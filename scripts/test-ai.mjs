import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyzeSkill, getAiStatus, suggestSkillGroup } from '../server/aiAnalysis.mjs';
import { buildSkillUniverse } from '../server/relations.mjs';
import { deleteSkillGroup, listSkillGroups, saveSkillGroup } from '../server/skillGroups.mjs';

const originalEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_ANALYSIS_MODEL: process.env.OPENAI_ANALYSIS_MODEL,
  SKILL_UNIVERSE_SKILLS_ROOT: process.env.SKILL_UNIVERSE_SKILLS_ROOT,
  SKILL_UNIVERSE_PLUGIN_CACHE_ROOT: process.env.SKILL_UNIVERSE_PLUGIN_CACHE_ROOT
};
const originalFetch = globalThis.fetch;

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
}

function fakeSkill(skillPath) {
  return {
    id: 'private-skill',
    name: 'private-skill',
    displayName: 'Private Skill',
    source: 'local',
    sourceLabel: 'local',
    path: skillPath,
    description: 'A concise public purpose description.',
    headings: ['Workflow', 'Validation'],
    triggerTerms: ['private', 'skill', 'workflow'],
    resources: {
      scripts: ['scan.js'],
      references: ['private-reference.md'],
      assets: ['private-template.docx'],
      agents: true
    },
    domains: ['tools'],
    clusterId: 'tools',
    position: [0, 0, 0],
    color: '#88ffe1',
    radius: 1,
    updatedAt: new Date().toISOString(),
    contentHash: 'test',
    health: {
      score: 82,
      level: 'good',
      issues: [],
      suggestions: [],
      staleDays: 0
    }
  };
}

function analysisPayload() {
  return {
    skillId: 'private-skill',
    title: 'Readable and scoped',
    summary: 'The skill is usable and only needs tighter trigger wording.',
    score: 88,
    verdict: 'good',
    issues: [
      { severity: 'low', title: 'Trigger can be clearer', detail: 'Add common maintenance phrases.' }
    ],
    fixes: [
      { title: 'Tighten description', detail: 'Mention dashboard startup and AI analysis explicitly.', effort: 'small' }
    ],
    suggestedDescription: 'Use when maintaining a local Codex skill dashboard and reviewing skill quality.',
    suggestedHeadings: ['Operating Workflow', 'AI Review', 'Privacy'],
    triggerTerms: ['dashboard', 'skill doctor', 'skill group'],
    securityNotes: ['Keep API keys in environment variables.'],
    privacyNotes: ['Do not send reference bodies or local paths.'],
    groupSeed: {
      name: 'Skill Maintenance',
      purpose: 'Review and maintain local skills.',
      defaultPrompt: 'Use the skill maintenance group to inspect this skill.'
    }
  };
}

function groupPayload(validId = 'private-skill') {
  return {
    name: 'Skill Doctor Group',
    purpose: 'Inspect and repair one skill before using it in a workflow.',
    members: [
      { skillId: validId, role: 'Review target', order: 1, reason: 'Selected by the user.' },
      { skillId: 'missing-skill-id', role: 'Invalid helper', order: 2, reason: 'Should be filtered.' }
    ],
    defaultPrompt: 'Use this group to analyze the selected skill, then apply concise fixes.',
    workflowSteps: ['Run AI Skill Doctor', 'Review issues', 'Save the group'],
    warnings: []
  };
}

async function runAiTests() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-universe-ai-'));
  const skillPath = path.join(tempRoot, 'private-skill');
  const fakeSecretKey = 'sk-' + 'secretsecretsecret';
  const fakeEnvName = 'OPENAI_' + 'API_KEY';
  await fs.mkdir(skillPath, { recursive: true });
  await fs.writeFile(path.join(skillPath, 'SKILL.md'), [
    '---',
    'name: private-skill',
    'description: A concise public purpose description.',
    '---',
    '',
    '# Workflow',
    'Read references/private-reference.md by name only.',
    `Never expose ${fakeEnvName}=${fakeSecretKey}, C:\\Users\\example\\.env, or C:/Users/example/.env.`,
    '# Validation',
    'Keep logs/private.log local.'
  ].join('\n'), 'utf8');

  try {
    process.env[fakeEnvName] = 'sk-' + 'test000000000000';
    process.env.OPENAI_BASE_URL = 'https://api.openai.test/v1';
    process.env.OPENAI_ANALYSIS_MODEL = 'gpt-test';

    let requestBody = '';
    globalThis.fetch = async (_url, init) => {
      requestBody = String(init?.body ?? '');
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: JSON.stringify(analysisPayload()) })
      };
    };

    const analysis = await analyzeSkill('private-skill', {
      universe: { skills: [fakeSkill(skillPath)] }
    });

    assert.equal(analysis.skillId, 'private-skill');
    assert.equal(analysis.score, 88);
    assert.equal(analysis.model, 'gpt-test');
    assert.ok(requestBody.includes('private-reference.md'), 'resource names should be included');
    assert.ok(!requestBody.includes(skillPath), 'absolute skill paths must not be sent');
    assert.ok(!requestBody.includes('C:\\Users\\example'), 'Windows paths must be redacted');
    assert.ok(!requestBody.includes('C:/Users/example'), 'forward-slash Windows paths must be redacted');
    assert.ok(!requestBody.includes(`${fakeEnvName}=`), 'env assignments must be redacted');
    assert.ok(!requestBody.includes(fakeSecretKey), 'API-key-like values must be redacted');
    assert.ok(!requestBody.includes('private reference body'), 'reference bodies must not be sent');

    globalThis.fetch = async (_url, init) => {
      requestBody = String(init?.body ?? '');
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: JSON.stringify(groupPayload()) })
      };
    };
    const hiddenCatalogSkill = {
      ...fakeSkill(path.join(tempRoot, 'hidden-catalog-skill')),
      id: 'hidden-catalog-skill',
      name: 'hidden-catalog-skill',
      displayName: 'Hidden Catalog Skill',
      description: 'Private local catalog metadata that must stay local.'
    };
    const suggestion = await suggestSkillGroup({ skillId: 'private-skill', analysis }, {
      universe: { skills: [fakeSkill(skillPath), hiddenCatalogSkill], relations: [] }
    });

    assert.deepEqual(suggestion.members.map((member) => member.skillId), ['private-skill']);
    assert.ok(suggestion.warnings.some((warning) => warning.includes('missing-skill-id')));
    assert.ok(!requestBody.includes(skillPath), 'group suggestion prompt must not include local paths');
    assert.ok(!requestBody.includes('Hidden Catalog Skill'), 'group suggestion prompt must not include full local catalog metadata');
    assert.ok(!requestBody.includes('Private local catalog metadata'), 'group suggestion prompt must not send unrelated skill descriptions');

    process.env[fakeEnvName] = 'sk-...';
    const status = await getAiStatus();
    assert.equal(status.enabled, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function runSkillGroupStorageTests() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-universe-groups-'));
  const pluginRoot = path.join(tempRoot, 'plugins');
  const localSkillPath = path.join(tempRoot, 'skills', 'group-test-skill');
  await fs.mkdir(localSkillPath, { recursive: true });
  await fs.mkdir(pluginRoot, { recursive: true });
  await fs.writeFile(path.join(localSkillPath, 'SKILL.md'), [
    '---',
    'name: group-test-skill',
    'description: Use when testing saved skill group persistence.',
    '---',
    '',
    '# Workflow',
    'Test storage.'
  ].join('\n'), 'utf8');

  try {
    process.env.SKILL_UNIVERSE_SKILLS_ROOT = path.join(tempRoot, 'skills');
    process.env.SKILL_UNIVERSE_PLUGIN_CACHE_ROOT = pluginRoot;
    const universe = await buildSkillUniverse();
    assert.equal(universe.skills.length, 1);
    const validId = universe.skills[0].id;

    const saved = await saveSkillGroup({
      id: 'ai-test-group-storage',
      name: 'AI Test Group Storage',
      purpose: 'Verify save, list, filter, and delete.',
      members: [
        { skillId: validId, role: 'Valid member', order: 2, reason: 'Should remain.' },
        { skillId: 'missing-skill-id', role: 'Invalid member', order: 1, reason: 'Should be removed.' }
      ],
      defaultPrompt: 'Use the valid member.',
      workflowSteps: ['Save', 'List', 'Delete']
    });

    const group = saved.groups.find((item) => item.id === 'ai-test-group-storage');
    assert.ok(group, 'saved group should be returned');
    assert.deepEqual(group.members.map((member) => member.skillId), [validId]);
    assert.ok(group.warnings?.some((warning) => warning.includes('missing-skill-id')));

    const listed = await listSkillGroups();
    assert.ok(listed.groups.some((item) => item.id === 'ai-test-group-storage'));

    const afterDelete = await deleteSkillGroup('ai-test-group-storage');
    assert.ok(!afterDelete.groups.some((item) => item.id === 'ai-test-group-storage'));
  } finally {
    await deleteSkillGroup('ai-test-group-storage').catch(() => {});
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

try {
  await runAiTests();
  await runSkillGroupStorageTests();
  console.log('ai analysis and skill group tests ok');
} finally {
  restoreEnv();
}
