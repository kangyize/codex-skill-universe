import assert from 'node:assert/strict';
import { buildSkillChangeComparison, createSkillSnapshotFromSkills, diffSkillSnapshots } from '../server/skillWatcher.mjs';

function skill(id, contentHash = 'a', updatedAt = '2026-01-01T00:00:00.000Z') {
  return {
    id,
    name: id,
    displayName: id,
    source: 'local',
    path: `C:\\skills\\${id}`,
    contentHash,
    updatedAt,
    description: id.includes('visual') ? 'scientific data visualization and chart plotting skill' : 'paper writing workflow',
    domains: id.includes('visual') ? ['analysis'] : ['paper-writing'],
    triggerTerms: id.includes('visual') ? ['visualization', 'chart'] : ['paper', 'writing']
  };
}

const before = createSkillSnapshotFromSkills([skill('alpha'), skill('beta'), skill('gamma')]);
const after = createSkillSnapshotFromSkills([
  skill('alpha'),
  skill('beta', 'b', '2026-01-02T00:00:00.000Z'),
  skill('delta-visualization')
]);

const diff = diffSkillSnapshots(before, after);

assert.equal(diff.added.length, 1);
assert.equal(diff.added[0].id, 'delta-visualization');
assert.equal(diff.removed.length, 1);
assert.equal(diff.removed[0].id, 'gamma');
assert.equal(diff.changed.length, 1);
assert.equal(diff.changed[0].id, 'beta');
assert.equal(diff.totalBefore, 3);
assert.equal(diff.totalAfter, 3);
assert.equal(diff.hasChanges, true);

const comparison = buildSkillChangeComparison(diff, after);
assert.ok(comparison?.newSkillIds.includes('delta-visualization'));
assert.ok(comparison?.filledGapIds.includes('data-visualization'));
assert.ok(comparison?.workflowIds.includes('experiment-to-report'));

console.log('watcher diff ok');
