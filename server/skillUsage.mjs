import fs from 'node:fs/promises';
import { ensureDataDir, skillUsagePath } from './config.mjs';
import { buildSkillUniverse } from './relations.mjs';

async function readStore() {
  try {
    const payload = JSON.parse(await fs.readFile(skillUsagePath, 'utf8'));
    return payload && typeof payload === 'object' ? payload : { items: {} };
  } catch (error) {
    if (error.code === 'ENOENT') return { items: {} };
    throw error;
  }
}

async function writeStore(store) {
  await ensureDataDir();
  await fs.writeFile(skillUsagePath, JSON.stringify(store, null, 2), 'utf8');
}

function normalizeEntry(skillId, raw) {
  return {
    skillId,
    count: Math.max(0, Math.floor(Number(raw?.count ?? 0))),
    firstUsedAt: raw?.firstUsedAt ?? null,
    lastUsedAt: raw?.lastUsedAt ?? null,
    lastEvent: String(raw?.lastEvent ?? '').slice(0, 80)
  };
}

function toResponse(store) {
  const items = Object.entries(store.items ?? {})
    .map(([skillId, raw]) => normalizeEntry(skillId, raw))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)));

  return {
    generatedAt: new Date().toISOString(),
    items,
    totalUses: items.reduce((sum, item) => sum + item.count, 0),
    meta: {
      storage: '.skill-universe/skill-usage.json',
      privacy: 'Usage counters are local-only and are not uploaded or committed.'
    }
  };
}

async function assertKnownSkill(skillId) {
  if (!skillId) throw new Error('Missing skillId');
  const universe = await buildSkillUniverse();
  const skill = universe.skills.find((item) => item.id === skillId);
  if (!skill) throw new Error(`Skill not found: ${skillId}`);
  return skill;
}

export async function listSkillUsage() {
  return toResponse(await readStore());
}

export async function recordSkillUse(skillId, options = {}) {
  const skill = await assertKnownSkill(skillId);
  const store = await readStore();
  const now = new Date().toISOString();
  const current = normalizeEntry(skill.id, store.items?.[skill.id]);
  const amount = Math.max(1, Math.min(100, Math.floor(Number(options.amount ?? 1) || 1)));

  store.items = {
    ...(store.items ?? {}),
    [skill.id]: {
      skillId: skill.id,
      count: current.count + amount,
      firstUsedAt: current.firstUsedAt ?? now,
      lastUsedAt: now,
      lastEvent: String(options.event ?? 'manual').slice(0, 80)
    }
  };

  await writeStore(store);
  return listSkillUsage();
}

export async function resetSkillUsage(skillId) {
  const store = await readStore();
  if (!skillId) {
    store.items = {};
  } else {
    delete store.items?.[skillId];
  }
  await writeStore(store);
  return listSkillUsage();
}
