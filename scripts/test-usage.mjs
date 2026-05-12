import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildSkillUniverse } from '../server/relations.mjs';
import { listSkillUsage, recordSkillUse, resetSkillUsage } from '../server/skillUsage.mjs';

const originalEnv = {
  SKILL_UNIVERSE_SKILLS_ROOT: process.env.SKILL_UNIVERSE_SKILLS_ROOT,
  SKILL_UNIVERSE_PLUGIN_CACHE_ROOT: process.env.SKILL_UNIVERSE_PLUGIN_CACHE_ROOT
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-universe-usage-'));
const localSkillPath = path.join(tempRoot, 'skills', 'usage-test-skill');
const pluginRoot = path.join(tempRoot, 'plugins');

try {
  await fs.mkdir(localSkillPath, { recursive: true });
  await fs.mkdir(pluginRoot, { recursive: true });
  await fs.writeFile(path.join(localSkillPath, 'SKILL.md'), [
    '---',
    'name: usage-test-skill',
    'description: Use when testing local skill usage counters.',
    '---',
    '',
    '# Workflow',
    'Record usage.'
  ].join('\n'), 'utf8');

  process.env.SKILL_UNIVERSE_SKILLS_ROOT = path.join(tempRoot, 'skills');
  process.env.SKILL_UNIVERSE_PLUGIN_CACHE_ROOT = pluginRoot;

  const universe = await buildSkillUniverse();
  assert.equal(universe.skills.length, 1);
  const skillId = universe.skills[0].id;

  await resetSkillUsage(skillId);
  let usage = await recordSkillUse(skillId, { event: 'test' });
  usage = await recordSkillUse(skillId, { event: 'test' });
  const entry = usage.items.find((item) => item.skillId === skillId);

  assert.ok(entry, 'recorded skill should be listed');
  assert.equal(entry.count, 2);
  assert.equal(entry.lastEvent, 'test');
  assert.equal(usage.totalUses >= 2, true);

  const listed = await listSkillUsage();
  assert.equal(listed.items.some((item) => item.skillId === skillId), true);

  await assert.rejects(() => recordSkillUse('missing-skill-id'), /Skill not found/);

  const afterReset = await resetSkillUsage(skillId);
  assert.equal(afterReset.items.some((item) => item.skillId === skillId), false);
  console.log('skill usage tests ok');
} finally {
  restoreEnv();
  await fs.rm(tempRoot, { recursive: true, force: true });
}
