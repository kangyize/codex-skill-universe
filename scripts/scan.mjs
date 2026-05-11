import { buildSkillUniverse } from '../server/relations.mjs';

const universe = await buildSkillUniverse();
console.log(JSON.stringify({
  skills: universe.skills.length,
  localSkillCount: universe.meta.localSkillCount,
  pluginSkillCount: universe.meta.pluginSkillCount,
  clusters: universe.clusters.map((cluster) => ({
    id: cluster.id,
    label: cluster.label,
    count: cluster.skillIds.length
  })),
  relationMode: universe.meta.relationMode,
  warnings: universe.meta.warnings
}, null, 2));
