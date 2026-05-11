import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDir, skillGroupsDir } from './config.mjs';
import { buildSkillUniverse } from './relations.mjs';

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
}

async function ensureGroupsDir() {
  await ensureDataDir();
  await fs.mkdir(skillGroupsDir, { recursive: true });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function normalizeGroup(raw, validSkillIds = new Set()) {
  const now = new Date().toISOString();
  const name = String(raw?.name ?? 'Untitled Skill Group').trim() || 'Untitled Skill Group';
  const id = slugify(raw?.id) || `${slugify(name) || 'skill-group'}-${Date.now()}`;
  const warnings = [];
  const seen = new Set();
  const members = Array.isArray(raw?.members) ? raw.members : [];
  const normalizedMembers = members
    .filter((member) => {
      const skillId = String(member?.skillId ?? '').trim();
      if (!skillId || !validSkillIds.has(skillId)) {
        if (skillId) warnings.push(`Removed unknown skillId: ${skillId}`);
        return false;
      }
      if (seen.has(skillId)) return false;
      seen.add(skillId);
      return true;
    })
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .map((member, index) => ({
      skillId: String(member.skillId).trim(),
      role: String(member.role ?? 'Member').trim() || 'Member',
      order: index + 1,
      reason: String(member.reason ?? '').trim()
    }));

  return {
    id,
    name,
    purpose: String(raw?.purpose ?? '').trim(),
    members: normalizedMembers,
    defaultPrompt: String(raw?.defaultPrompt ?? '').trim(),
    workflowSteps: Array.isArray(raw?.workflowSteps)
      ? raw.workflowSteps.map((step) => String(step).trim()).filter(Boolean).slice(0, 12)
      : [],
    createdAt: raw?.createdAt ?? now,
    updatedAt: now,
    warnings: [...new Set([...(raw?.warnings ?? []), ...warnings])].slice(0, 8)
  };
}

async function validSkillIds() {
  const universe = await buildSkillUniverse();
  return new Set(universe.skills.map((skill) => skill.id));
}

export async function listSkillGroups() {
  await ensureGroupsDir();
  const entries = await fs.readdir(skillGroupsDir, { withFileTypes: true }).catch(() => []);
  const groups = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    try {
      groups.push(await readJson(path.join(skillGroupsDir, entry.name)));
    } catch {
      // Ignore malformed local group files instead of blocking the dashboard.
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    groups: groups.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    meta: {
      storage: '.skill-universe/skill-groups/*.json'
    }
  };
}

export async function saveSkillGroup(rawGroup) {
  await ensureGroupsDir();
  const group = normalizeGroup(rawGroup, await validSkillIds());
  await fs.writeFile(path.join(skillGroupsDir, `${group.id}.json`), JSON.stringify(group, null, 2), 'utf8');
  return listSkillGroups();
}

export async function deleteSkillGroup(groupId) {
  if (!groupId) throw new Error('Missing groupId');
  await ensureGroupsDir();
  const id = slugify(groupId);
  if (id) {
    await fs.unlink(path.join(skillGroupsDir, `${id}.json`)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  return listSkillGroups();
}
