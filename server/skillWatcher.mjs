import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { GAP_DEFINITIONS } from './recommendations.mjs';
import { scanSkillsOnly } from './scanSkills.mjs';

const clients = new Set();
let monitorStarted = false;
let baselineSnapshot = null;
let debounceTimer = null;
const watchers = [];

export function createSkillSnapshotFromSkills(skills) {
  const items = skills
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      displayName: skill.displayName,
      source: skill.source,
      path: skill.path,
      contentHash: skill.contentHash,
      updatedAt: skill.updatedAt,
      description: skill.description ?? '',
      domains: skill.domains ?? [],
      clusterId: skill.clusterId ?? 'other',
      triggerTerms: skill.triggerTerms ?? []
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    generatedAt: new Date().toISOString(),
    total: items.length,
    items
  };
}

function tokenSet(value) {
  return new Set(
    String(value ?? '')
      .toLowerCase()
      .replace(/[`"'()[\]{}:;,.!?/\\|<>]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 4)
  );
}

function overlapScore(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.min(left.size, right.size);
}

function skillText(skill) {
  return `${skill.name} ${skill.displayName} ${skill.description} ${(skill.triggerTerms ?? []).join(' ')} ${(skill.domains ?? []).join(' ')}`.toLowerCase();
}

export function buildSkillChangeComparison(diff, nextSnapshot) {
  if (!diff.added.length) return undefined;

  const existing = (nextSnapshot?.items ?? []).filter(
    (item) => !diff.added.some((added) => added.id === item.id)
  );
  const newSkillIds = diff.added.map((item) => item.id);
  const filledGapIds = new Set();
  const similarSkillIds = new Set();
  const workflowIds = new Set();

  for (const added of diff.added) {
    const text = skillText(added);
    for (const gap of GAP_DEFINITIONS) {
      const matched = (gap.keywords ?? []).some((keyword) => text.includes(String(keyword).toLowerCase()));
      if (matched) filledGapIds.add(gap.id);
    }

    const similar = existing
      .map((skill) => ({
        skill,
        score: overlapScore(text, skillText(skill))
      }))
      .filter((entry) => entry.score >= 0.34)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    similar.forEach((entry) => similarSkillIds.add(entry.skill.id));

    if ((added.domains ?? []).includes('analysis')) workflowIds.add('experiment-to-report');
    if ((added.domains ?? []).includes('literature') || (added.domains ?? []).includes('paper-writing')) {
      workflowIds.add('literature-to-paper');
      workflowIds.add('research-startup');
    }
    if ((added.domains ?? []).includes('documents')) workflowIds.add('pdf-to-review');
  }

  const parts = [];
  parts.push(`New skills: ${diff.added.map((item) => item.displayName || item.name).join(', ')}`);
  if (filledGapIds.size) parts.push(`filled ${filledGapIds.size} gap(s)`);
  if (similarSkillIds.size) parts.push(`similar to ${similarSkillIds.size} installed skill(s)`);
  if (workflowIds.size) parts.push(`can join ${workflowIds.size} workflow(s)`);

  return {
    newSkillIds,
    filledGapIds: [...filledGapIds],
    similarSkillIds: [...similarSkillIds],
    workflowIds: [...workflowIds],
    summary: parts.join('; ')
  };
}

export function diffSkillSnapshots(previous, next) {
  const previousById = new Map((previous?.items ?? []).map((item) => [item.id, item]));
  const nextById = new Map((next?.items ?? []).map((item) => [item.id, item]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const item of nextById.values()) {
    const old = previousById.get(item.id);
    if (!old) {
      added.push(item);
    } else if (old.contentHash !== item.contentHash || old.updatedAt !== item.updatedAt) {
      changed.push(item);
    }
  }

  for (const item of previousById.values()) {
    if (!nextById.has(item.id)) removed.push(item);
  }

  return {
    added,
    removed,
    changed,
    totalBefore: previous?.total ?? 0,
    totalAfter: next?.total ?? 0,
    hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0
  };
}

function sendEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(event, payload) {
  for (const res of clients) {
    sendEvent(res, event, payload);
  }
}

async function takeSnapshot() {
  const scan = await scanSkillsOnly();
  return createSkillSnapshotFromSkills(scan.skills);
}

function summarizeDiff(diff) {
  const nameList = (items) => items.slice(0, 5).map((item) => item.displayName || item.name);
  return {
    addedCount: diff.added.length,
    removedCount: diff.removed.length,
    changedCount: diff.changed.length,
    totalBefore: diff.totalBefore,
    totalAfter: diff.totalAfter,
    addedNames: nameList(diff.added),
    removedNames: nameList(diff.removed),
    changedNames: nameList(diff.changed)
  };
}

async function handlePossibleChange(reason) {
  try {
    const nextSnapshot = await takeSnapshot();
    const diff = diffSkillSnapshots(baselineSnapshot, nextSnapshot);
    baselineSnapshot = nextSnapshot;

    if (!diff.hasChanges) return;

    broadcast('skill-change', {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      reason,
      detectedAt: new Date().toISOString(),
      ...summarizeDiff(diff),
      comparison: buildSkillChangeComparison(diff, nextSnapshot)
    });
  } catch (error) {
    broadcast('watch-error', {
      detectedAt: new Date().toISOString(),
      error: error.message
    });
  }
}

function scheduleChangeCheck(reason) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void handlePossibleChange(reason);
  }, 900);
}

function watchDirectory(root, label) {
  if (!fs.existsSync(root)) return;

  try {
    const watcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
      const normalized = filename ? filename.toString() : '';
      if (
        normalized.includes('node_modules') ||
        normalized.includes('.git') ||
        normalized.includes('__pycache__')
      ) {
        return;
      }
      if (normalized && !normalized.toLowerCase().includes('skill.md') && eventType !== 'rename') {
        return;
      }
      scheduleChangeCheck(`${label}:${eventType}:${normalized || root}`);
    });
    watchers.push(watcher);
  } catch {
    const watcher = fs.watch(root, {}, (eventType, filename) => {
      scheduleChangeCheck(`${label}:${eventType}:${filename?.toString() || root}`);
    });
    watchers.push(watcher);
  }
}

export async function startSkillMonitor() {
  if (monitorStarted) return;
  monitorStarted = true;
  const config = await loadConfig();
  baselineSnapshot = await takeSnapshot();

  watchDirectory(config.paths.skillsRoot, 'skills');
  watchDirectory(config.paths.pluginCacheRoot, 'plugins');
}

export function stopSkillMonitor() {
  clearTimeout(debounceTimer);
  for (const watcher of watchers.splice(0)) watcher.close();
  for (const res of clients) res.end();
  clients.clear();
  monitorStarted = false;
  baselineSnapshot = null;
}

export async function subscribeSkillEvents(req, res) {
  await startSkillMonitor();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('\n');
  clients.add(res);

  sendEvent(res, 'watch-ready', {
    detectedAt: new Date().toISOString(),
    total: baselineSnapshot?.total ?? 0
  });

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}
