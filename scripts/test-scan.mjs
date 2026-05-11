import assert from 'node:assert/strict';
import { buildSkillUniverse } from '../server/relations.mjs';

const universe = await buildSkillUniverse();

assert.ok(universe.skills.length >= 30, `expected at least 30 skills, found ${universe.skills.length}`);
assert.ok(universe.meta.localSkillCount >= 30, `expected local skills, found ${universe.meta.localSkillCount}`);
assert.ok(universe.meta.pluginSkillCount >= 1, `expected plugin skills, found ${universe.meta.pluginSkillCount}`);
assert.ok(universe.clusters.length >= 4, `expected multiple clusters, found ${universe.clusters.length}`);
assert.ok(universe.insights.length >= 3, `expected insights, found ${universe.insights.length}`);
assert.ok(
  universe.skills.every((skill) => Number.isFinite(skill.health?.score) && skill.health.score >= 0 && skill.health.score <= 100),
  'every skill should include a bounded health score'
);
assert.ok(
  universe.skills.some((skill) => skill.health?.suggestions?.length >= 0),
  'health payload should include suggestions arrays'
);

console.log(`scan ok: ${universe.meta.localSkillCount} local, ${universe.meta.pluginSkillCount} plugin, ${universe.skills.length} total`);
