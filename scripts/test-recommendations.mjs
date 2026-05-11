import assert from 'node:assert/strict';
import { buildInstallPlanForCandidate, buildSkillRecommendations, checkInstallStatus } from '../server/recommendations.mjs';

const fakeUniverse = {
  generatedAt: new Date().toISOString(),
  skills: [
    {
      id: 'secret-private-skill-1',
      name: 'secret-private-skill',
      displayName: 'secret-private-skill',
      description: 'A private literature and manuscript writing workflow.',
      headings: ['Workflow'],
      triggerTerms: ['private', 'literature'],
      domains: ['literature', 'paper-writing'],
      resources: { scripts: [], references: ['do-not-upload.md'], assets: [], agents: false },
      contentHash: 'a'
    },
    {
      id: 'results-analysis-1',
      name: 'results-analysis',
      displayName: 'results-analysis',
      description: 'Analyze experimental results and statistical significance.',
      headings: ['Strict analysis'],
      triggerTerms: ['results', 'analysis'],
      domains: ['analysis'],
      resources: { scripts: ['analysis.js'], references: [], assets: [], agents: false },
      contentHash: 'b'
    }
  ],
  clusters: [],
  relations: [],
  insights: [],
  meta: {}
};

const requestedUrls = [];
const searchPayload = {
  results: [
    {
      slug: 'maker/science-figures',
      displayName: 'science-figures',
      summary: 'Scientific data visualization with matplotlib and paper figure checks.',
      downloads: 120,
      stars: 999,
      score: 0.8
    },
    {
      slug: 'missing-skill',
      displayName: 'missing-skill',
      summary: 'This search result no longer has a detail page.',
      downloads: 999,
      stars: 999
    },
    {
      slug: 'maker/api-visualizer',
      displayName: 'api-visualizer',
      summary: 'Visualization skill that requires an API key token.',
      downloads: 4,
      stars: 1
    },
    {
      slug: 'maker/results-analysis',
      displayName: 'results-analysis',
      summary: 'Duplicate analysis helper.',
      downloads: 9,
      stars: 1
    }
  ]
};

const details = {
  'science-figures': {
    skill: {
      slug: 'science-figures',
      displayName: 'science-figures',
      summary: 'Scientific data visualization with matplotlib and paper figure checks.',
      stats: { downloads: 120, stars: 12, installsAllTime: 3 }
    },
    owner: { handle: 'maker' },
    moderation: { verdict: 'clean' }
  },
  'api-visualizer': {
    skill: {
      slug: 'api-visualizer',
      displayName: 'api-visualizer',
      summary: 'Visualization skill that requires an API key token.',
      stats: { downloads: 4, stars: 1 }
    },
    owner: { handle: 'maker' },
    moderation: { verdict: 'unknown' }
  },
  'results-analysis': {
    skill: {
      slug: 'results-analysis',
      displayName: 'results-analysis',
      summary: 'Duplicate analysis helper.',
      stats: { downloads: 9, stars: 1 }
    },
    owner: { handle: 'maker' },
    moderation: { verdict: 'clean' }
  }
};

async function mockFetch(url) {
  const textUrl = String(url);
  requestedUrls.push(textUrl);
  const detailMatch = textUrl.match(/\/api\/v1\/skills\/([^/?]+)/);
  if (detailMatch) {
    const slug = decodeURIComponent(detailMatch[1]);
    const detail = details[slug];
    if (!detail) return new Response('Skill not found', { status: 404 });
    return new Response(JSON.stringify(detail), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify(searchPayload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

const recommendations = await buildSkillRecommendations({
  universe: fakeUniverse,
  fetchImpl: mockFetch,
  refresh: true,
  writeCache: false
});

assert.equal(recommendations.status, 'online');
assert.ok(recommendations.gaps.some((gap) => gap.id === 'data-visualization'));
assert.ok(recommendations.candidates.length > 0);
assert.ok(recommendations.candidates.some((candidate) => candidate.requiresApiKey));
assert.ok(recommendations.candidates.some((candidate) => candidate.duplicateOf));
assert.ok(recommendations.candidates.every((candidate) => candidate.verified));
assert.ok(recommendations.candidates.every((candidate) => candidate.audit?.verdict), 'each candidate should include an install audit verdict');
assert.ok(
  ['medium', 'high'].includes(recommendations.candidates.find((candidate) => candidate.packageSlug === 'api-visualizer')?.audit.riskLevel),
  'API-key/unknown-security candidates should be marked as at least medium risk'
);
assert.ok(!recommendations.candidates.some((candidate) => candidate.packageSlug === 'missing-skill'));
assert.equal(
  recommendations.candidates.find((candidate) => candidate.packageSlug === 'science-figures')?.stars,
  12,
  'stars must come from verified detail stats, not search result guesses'
);
assert.equal(
  recommendations.candidates.find((candidate) => candidate.packageSlug === 'science-figures')?.sourceUrl,
  'https://clawhub.ai/maker/science-figures'
);
assert.ok(
  requestedUrls.every((url) => !url.includes('secret-private-skill') && !url.includes('do-not-upload')),
  'ClawHub requests must not include local skill names, resource names, paths, or private text'
);

const plan = buildInstallPlanForCandidate(recommendations.candidates[0]);
assert.ok(plan.commands.some((command) => command.includes('npx clawhub@latest install')));
assert.ok(plan.verificationSteps.some((step) => step.includes('.codex')));

const check = await checkInstallStatus('missing-test-skill-for-dashboard');
assert.equal(check.installed, false);
assert.ok(check.matches.length >= 2);

console.log(`recommendations ok: ${recommendations.candidates.length} verified candidates, ${requestedUrls.length} gap-only/detail requests`);
