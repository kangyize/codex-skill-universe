import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { buildSkillUniverse } from './relations.mjs';

const DEFAULT_ANALYSIS_MODEL = 'gpt-4.1-mini';
const MAX_SKILL_MARKDOWN_CHARS = 12000;

function hasOpenAIKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  return Boolean(key && key !== 'sk-...' && key !== 'YOUR_API_KEY_HERE');
}

function redactSensitiveText(value) {
  return String(value ?? '')
    .replace(/[A-Za-z]:\\(?:[^\\\r\n]+\\)+[^\\\r\n]*/g, '[local-path]')
    .replace(/[A-Za-z]:\/(?:[^\/\r\n]+\/)*[^\/\s"'`<>)]*/g, '[local-path]')
    .replace(/\/(?:Users|home|var|tmp|mnt)\/[^\s"'`<>)]*/g, '[local-path]')
    .replace(/\b[A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*\s*=\s*[^\s]+/gi, '[secret-redacted]')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[api-key-redacted]');
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { frontmatter: '', body: markdown };
  return {
    frontmatter: match[1],
    body: markdown.slice(match[0].length)
  };
}

function skillSummary(skill) {
  return {
    id: skill.id,
    name: skill.name,
    displayName: skill.displayName,
    description: redactSensitiveText(skill.description),
    headings: skill.headings,
    triggerTerms: skill.triggerTerms,
    domains: skill.domains,
    source: skill.source,
    resources: skill.resources,
    health: skill.health
  };
}

async function readSelectedSkill(skill) {
  const skillFile = path.join(skill.path, 'SKILL.md');
  const markdown = await fs.readFile(skillFile, 'utf8');
  const { frontmatter, body } = parseFrontmatter(markdown);
  return {
    ...skillSummary(skill),
    frontmatter: redactSensitiveText(frontmatter),
    markdown: redactSensitiveText(body).slice(0, MAX_SKILL_MARKDOWN_CHARS)
  };
}

function outputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const chunks = [];
  for (const item of payload?.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === 'string') chunks.push(content.text);
      if (typeof content.output_text === 'string') chunks.push(content.output_text);
    }
  }
  return chunks.join('\n').trim();
}

async function requestStructuredJson({ system, user, schema }) {
  await loadConfig();
  if (!hasOpenAIKey()) {
    throw new Error('OPENAI_API_KEY is not configured. AI analysis is disabled.');
  }

  const baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.OPENAI_ANALYSIS_MODEL?.trim() || DEFAULT_ANALYSIS_MODEL;
  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY.trim()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: system }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: user }]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: schema.name,
          strict: true,
          schema: schema.schema
        }
      }
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message ?? `OpenAI Responses request failed: ${response.status}`;
    throw new Error(detail);
  }

  const text = outputText(payload);
  if (!text) throw new Error('OpenAI returned an empty structured output.');
  return JSON.parse(text);
}

const analysisSchema = {
  name: 'skill_doctor_analysis',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'skillId',
      'title',
      'summary',
      'score',
      'verdict',
      'issues',
      'fixes',
      'suggestedDescription',
      'suggestedHeadings',
      'triggerTerms',
      'securityNotes',
      'privacyNotes',
      'groupSeed'
    ],
    properties: {
      skillId: { type: 'string' },
      title: { type: 'string' },
      summary: { type: 'string' },
      score: { type: 'number', minimum: 0, maximum: 100 },
      verdict: { type: 'string', enum: ['good', 'watch', 'risk'] },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['severity', 'title', 'detail'],
          properties: {
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            title: { type: 'string' },
            detail: { type: 'string' }
          }
        }
      },
      fixes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'detail', 'effort'],
          properties: {
            title: { type: 'string' },
            detail: { type: 'string' },
            effort: { type: 'string', enum: ['small', 'medium', 'large'] }
          }
        }
      },
      suggestedDescription: { type: 'string' },
      suggestedHeadings: { type: 'array', items: { type: 'string' } },
      triggerTerms: { type: 'array', items: { type: 'string' } },
      securityNotes: { type: 'array', items: { type: 'string' } },
      privacyNotes: { type: 'array', items: { type: 'string' } },
      groupSeed: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'purpose', 'defaultPrompt'],
        properties: {
          name: { type: 'string' },
          purpose: { type: 'string' },
          defaultPrompt: { type: 'string' }
        }
      }
    }
  }
};

const groupSchema = {
  name: 'skill_group_suggestion',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'purpose', 'members', 'defaultPrompt', 'workflowSteps', 'warnings'],
    properties: {
      name: { type: 'string' },
      purpose: { type: 'string' },
      members: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['skillId', 'role', 'order', 'reason'],
          properties: {
            skillId: { type: 'string' },
            role: { type: 'string' },
            order: { type: 'number' },
            reason: { type: 'string' }
          }
        }
      },
      defaultPrompt: { type: 'string' },
      workflowSteps: { type: 'array', items: { type: 'string' } },
      warnings: { type: 'array', items: { type: 'string' } }
    }
  }
};

function normalizeAnalysis(raw, skillId) {
  return {
    ...raw,
    skillId,
    score: Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0))),
    issues: (raw.issues ?? []).slice(0, 8),
    fixes: (raw.fixes ?? []).slice(0, 8),
    suggestedHeadings: (raw.suggestedHeadings ?? []).slice(0, 10),
    triggerTerms: (raw.triggerTerms ?? []).slice(0, 16),
    securityNotes: (raw.securityNotes ?? []).slice(0, 8),
    privacyNotes: (raw.privacyNotes ?? []).slice(0, 8),
    generatedAt: new Date().toISOString(),
    model: process.env.OPENAI_ANALYSIS_MODEL?.trim() || DEFAULT_ANALYSIS_MODEL,
    privacy: 'Sent only selected SKILL.md frontmatter/body and resource names. References/assets/logs/env/local paths are excluded or redacted.'
  };
}

function localCompanionMembers(universe, focusSkillId, usedSkillIds) {
  if (!focusSkillId || !Array.isArray(universe?.relations)) return [];
  const skillsById = new Map((universe.skills ?? []).map((skill) => [skill.id, skill]));
  const candidates = [];

  for (const relation of universe.relations) {
    const relatedId = relation.source === focusSkillId ? relation.target : relation.target === focusSkillId ? relation.source : '';
    if (!relatedId || usedSkillIds.has(relatedId) || !skillsById.has(relatedId)) continue;
    candidates.push({
      relation,
      skill: skillsById.get(relatedId)
    });
  }

  return candidates
    .sort((a, b) => Number(b.relation.score ?? 0) - Number(a.relation.score ?? 0))
    .slice(0, 5)
    .map(({ relation, skill }) => ({
      skillId: skill.id,
      role: relation.type === 'overlap' ? 'Overlap check' : 'Companion skill',
      order: 0,
      reason: `${skill.displayName}: ${relation.evidence}`
    }));
}

function normalizeGroup(raw, validSkillIds, focusSkillId, universe) {
  const warnings = [...(raw.warnings ?? [])];
  const seen = new Set();
  const members = (raw.members ?? [])
    .filter((member) => {
      if (!validSkillIds.has(member.skillId)) {
        warnings.push(`Removed unknown skillId: ${member.skillId}`);
        return false;
      }
      if (seen.has(member.skillId)) return false;
      seen.add(member.skillId);
      return true;
    })
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((member, index) => ({
      skillId: member.skillId,
      role: member.role,
      order: index + 1,
      reason: member.reason
    }));

  if (focusSkillId && validSkillIds.has(focusSkillId) && !members.some((member) => member.skillId === focusSkillId)) {
    members.unshift({
      skillId: focusSkillId,
      role: 'Core skill',
      order: 1,
      reason: 'The user selected this skill as the group focus.'
    });
  }

  for (const companion of localCompanionMembers(universe, focusSkillId, seen)) {
    if (members.length >= 6) break;
    seen.add(companion.skillId);
    members.push(companion);
  }

  return {
    name: raw.name,
    purpose: raw.purpose,
    members: members.map((member, index) => ({ ...member, order: index + 1 })).slice(0, 8),
    defaultPrompt: raw.defaultPrompt,
    workflowSteps: (raw.workflowSteps ?? []).slice(0, 10),
    warnings: [...new Set(warnings)].slice(0, 8),
    generatedAt: new Date().toISOString(),
    model: process.env.OPENAI_ANALYSIS_MODEL?.trim() || DEFAULT_ANALYSIS_MODEL
  };
}

export async function getAiStatus() {
  const config = await loadConfig();
  const model = process.env.OPENAI_ANALYSIS_MODEL?.trim() || DEFAULT_ANALYSIS_MODEL;
  return {
    enabled: hasOpenAIKey(),
    provider: 'openai',
    model,
    baseUrl: config.embedding.baseUrl,
    privacy: 'AI analysis is user-triggered and excludes references/assets text, logs, env files, and local absolute paths.'
  };
}

export async function analyzeSkill(skillId, options = {}) {
  if (!skillId) throw new Error('Missing skillId');
  const universe = options.universe ?? await buildSkillUniverse();
  const skill = universe.skills.find((item) => item.id === skillId);
  if (!skill) throw new Error(`Skill not found: ${skillId}`);
  const selected = await readSelectedSkill(skill);

  const raw = await requestStructuredJson({
    system: [
      'You are a Codex skill quality reviewer.',
      'Evaluate whether the selected SKILL.md can help another Codex agent know when and how to use the skill.',
      'Prefer practical, concise fixes. Do not invent capabilities not supported by the skill text.',
      'Return only the requested JSON schema.'
    ].join(' '),
    user: JSON.stringify({ selectedSkill: selected }, null, 2),
    schema: analysisSchema
  });

  return normalizeAnalysis(raw, skillId);
}

export async function suggestSkillGroup({ skillId, objective = '', analysis = null } = {}, options = {}) {
  if (!skillId) throw new Error('Missing skillId. Choose a skill before requesting an AI skill group.');
  const universe = options.universe ?? await buildSkillUniverse();
  const validSkillIds = new Set(universe.skills.map((skill) => skill.id));
  const focusSkill = skillId ? universe.skills.find((skill) => skill.id === skillId) : null;
  if (skillId && !focusSkill) throw new Error(`Skill not found: ${skillId}`);

  const raw = await requestStructuredJson({
    system: [
      'You design small reusable skill groups for a local Codex skill dashboard.',
      'For privacy, you can only see the selected focus skill and must not ask for the full local skill catalog.',
      'Use only the provided focus skillId in members; the server will add local companion skills without sending their metadata to you.',
      'Create a practical group name, purpose, default prompt, workflow steps, and a role for the selected skill.',
      'Return only the requested JSON schema.'
    ].join(' '),
    user: JSON.stringify({
      objective: redactSensitiveText(objective),
      focusSkill: focusSkill ? skillSummary(focusSkill) : null,
      analysisSeed: analysis ? redactSensitiveText(JSON.stringify(analysis).slice(0, 4000)) : null,
      allowedSkillIds: focusSkill ? [focusSkill.id] : []
    }, null, 2),
    schema: groupSchema
  });

  return normalizeGroup(raw, validSkillIds, skillId, universe);
}
