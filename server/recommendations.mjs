import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureDataDir, recommendationCachePath } from './config.mjs';
import { buildSkillUniverse } from './relations.mjs';

const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 8;
const RECOMMENDATION_CACHE_VERSION = 2;
const SEARCH_LIMIT = 6;
const SEARCH_TIMEOUT_MS = 2200;

const CLAWHUB_SEARCH_BASES = [
  'https://clawhub.ai/api/v1/search',
  'https://clawhub.ai/api/search',
  'https://wry-manatee-359.convex.site/api/v1/search'
];

export const GAP_DEFINITIONS = [
  {
    id: 'data-visualization',
    label: '数据可视化',
    description: '把实验结果、统计输出和论文图表转成可复用、可审稿的可视化工作流。',
    targetCoverage: 3,
    queries: ['scientific data visualization skill', 'plotly matplotlib research figures skill'],
    keywords: ['visualization', 'visualisation', 'plotly', 'matplotlib', 'chart', 'charts', 'figure qa', 'scientific figures', 'plot', '可视化', '绘图', '图表'],
    bridgeKeywords: ['results', 'analysis', 'statistical', 'experiment', 'figure', 'plot']
  },
  {
    id: 'figure-quality',
    label: '科学图表质检',
    description: '检查图片分辨率、坐标轴、配色、显著性标注和投稿规范。',
    targetCoverage: 2,
    queries: ['scientific figure quality check skill', 'paper figure review visualization skill'],
    keywords: ['figure quality', 'dpi', 'axis', 'caption', 'colorblind', 'visual qa', 'image quality', '图表质检', '图片质量', '坐标轴'],
    bridgeKeywords: ['paper', 'review', 'results', 'scientific', 'writing']
  },
  {
    id: 'reproduction-runner',
    label: '代码复现实验执行',
    description: '从论文或仓库出发，拉起环境、运行 baseline、记录失败点和复现实验日志。',
    targetCoverage: 2,
    queries: ['paper reproduction runner skill', 'research code reproduction experiment runner skill'],
    keywords: ['reproduction runner', 'reproduce code', 'baseline runner', 'experiment runner', 'docker', 'conda', 'benchmark', '复现实验', '代码复现', '基线实验'],
    bridgeKeywords: ['reproduction', 'feasibility', 'paper', 'experiment', 'analysis']
  },
  {
    id: 'patent-prior-art',
    label: '专利检索/现有技术',
    description: '围绕技术方案做专利检索、现有技术对比和规避设计线索。',
    targetCoverage: 2,
    queries: ['patent prior art search skill', 'patent search analysis skill'],
    keywords: ['prior art', 'patent search', 'patent lookup', 'google patents', 'espacenet', '现有技术', '专利检索', '专利查询'],
    bridgeKeywords: ['patent', 'technical', 'research', 'writing']
  },
  {
    id: 'data-cleaning',
    label: '数据清洗/表格整理',
    description: '把 CSV、Excel、实验记录和半结构化表格整理成可分析数据。',
    targetCoverage: 2,
    queries: ['data cleaning spreadsheet skill', 'csv excel data wrangling skill'],
    keywords: ['data cleaning', 'wrangling', 'csv', 'excel', 'spreadsheet', 'tidy data', '数据清洗', '表格整理'],
    bridgeKeywords: ['spreadsheet', 'results', 'analysis', 'experiment']
  },
  {
    id: 'lab-automation',
    label: '实验自动化',
    description: '管理批量任务、日志、参数扫描和实验产物索引。',
    targetCoverage: 2,
    queries: ['experiment automation skill', 'batch experiment logging skill'],
    keywords: ['experiment automation', 'batch run', 'pipeline', 'job queue', 'logging', 'parameter sweep', '实验自动化', '批量实验'],
    bridgeKeywords: ['scripts', 'analysis', 'results', 'pipeline']
  },
  {
    id: 'skill-security',
    label: 'Skill 安全审查',
    description: '安装前审查 SKILL.md、脚本权限、网络访问、密钥和潜在提示注入风险。',
    targetCoverage: 2,
    queries: ['skill security review prompt injection skill', 'agent skill audit security skill'],
    keywords: ['security review', 'prompt injection', 'secret', 'credentials', 'guardrails', 'audit', '安全审查', '提示注入', '密钥'],
    bridgeKeywords: ['security', 'moltguard', 'skill', 'plugin', 'tool']
  }
];

function normalizeSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/\/+$/, '');
}

function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function textForSkill(skill) {
  return [
    skill.name,
    skill.displayName,
    skill.description,
    ...(skill.headings ?? []),
    ...(skill.triggerTerms ?? []),
    ...(skill.domains ?? [])
  ]
    .join(' ')
    .toLowerCase();
}

function tokenSet(value) {
  return new Set(
    compactText(value)
      .toLowerCase()
      .replace(/[`"'()[\]{}:;,.!?/\\|<>]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3)
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

function installedNames(skills) {
  return new Set(
    skills.flatMap((skill) => [
      normalizeSlug(skill.name),
      normalizeSlug(skill.displayName),
      normalizeSlug(skill.name).replace(/-\d+\.\d+\.\d+$/, '')
    ])
  );
}

function matchKeywords(text, keywords) {
  return keywords.filter((keyword) => text.includes(keyword.toLowerCase()));
}

export function analyzeSkillGaps(universe) {
  const skills = universe.skills ?? [];

  return GAP_DEFINITIONS.map((gap) => {
    const matches = skills
      .map((skill) => {
        const text = textForSkill(skill);
        const matchedKeywords = matchKeywords(text, gap.keywords);
        const bridgeMatches = matchKeywords(text, gap.bridgeKeywords ?? []);
        return {
          skill,
          score: matchedKeywords.length * 2 + bridgeMatches.length,
          matchedKeywords,
          bridgeMatches
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    const strongMatches = matches.filter((entry) => entry.matchedKeywords.length > 0);
    const coverage = Math.min(1, strongMatches.length / gap.targetCoverage);
    const bridgeSkillIds = matches.slice(0, 4).map((entry) => entry.skill.id);
    const evidence =
      strongMatches.length > 0
        ? `已有 ${strongMatches.length} 个相关 skill，但覆盖深度仍可加强`
        : `当前星域没有明显覆盖 ${gap.label} 的专门 skill`;

    return {
      id: gap.id,
      label: gap.label,
      description: gap.description,
      coverage: Number(coverage.toFixed(2)),
      priority: Number((1 - coverage).toFixed(2)),
      evidence,
      queryTerms: gap.queries,
      bridgeSkillIds
    };
  }).sort((a, b) => b.priority - a.priority);
}

function universeFingerprint(universe) {
  const source = (universe.skills ?? [])
    .map((skill) => `${skill.id}:${skill.contentHash}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(source).digest('hex');
}

async function readCache() {
  try {
    return JSON.parse(await fs.readFile(recommendationCachePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeCache(payload) {
  await ensureDataDir();
  await fs.writeFile(recommendationCachePath, JSON.stringify(payload, null, 2), 'utf8');
}

function extractArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.skills)) return payload.skills;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function readNestedNumber(item, keys) {
  for (const key of keys) {
    const value = key.split('.').reduce((current, part) => current?.[part], item);
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function normalizeCandidate(raw, gap, query) {
  const skill = raw.skill ?? raw;
  const rawSlug =
    skill.slug ??
    skill.name ??
    skill.id ??
    skill.packageName ??
    skill.path ??
    skill.url?.replace(/^https?:\/\/clawhub\.ai\//, '');
  const slug = normalizeSlug(rawSlug);
  if (!slug) return null;

  const parts = slug.split('/').filter(Boolean);
  const packageSlug = parts.at(-1) ?? slug;
  const author =
    skill.author?.username ??
    skill.author?.name ??
    skill.owner ??
    skill.namespace ??
    (parts.length > 1 ? parts[0] : '');
  const displayName =
    compactText(skill.displayName ?? skill.title ?? skill.name ?? packageSlug) || packageSlug;
  const summary = compactText(skill.summary ?? skill.description ?? skill.shortDescription ?? skill.readme ?? '');
  const url = skill.url ?? `https://clawhub.ai/${slug}`;
  const downloads = readNestedNumber(skill, ['downloads', 'downloadCount', 'stats.downloads', 'stats.installCount', 'stats.totalDownloads']);
  const stars = readNestedNumber(skill, ['stars', 'starCount', 'stats.stars', 'stats.likes']);
  const remoteScore = readNestedNumber(skill, ['score', 'rankScore', '_score']);
  const sourceSecurity =
    skill.security?.status ??
    skill.securityStatus ??
    skill.verdict ??
    skill.auditStatus ??
    'unknown';
  const requiresApiKey = /\b(api key|apikey|token|secret|credential|openai|anthropic|gemini|serpapi|github token)\b/i.test(
    `${displayName} ${summary}`
  );

  return {
    slug,
    packageSlug,
    author,
    name: displayName,
    summary,
    source: 'ClawHub',
    sourceUrl: url,
    downloads,
    stars,
    remoteScore,
    sourceSecurity,
    requiresApiKey,
    verified: false,
    duplicateOf: null,
    gapId: gap.id,
    gapLabel: gap.label,
    query,
    recommendationScore: 0,
    rationale: [],
    complements: [],
    risks: []
  };
}

function canonicalClawHubUrl(slug, ownerHandle) {
  return ownerHandle ? `https://clawhub.ai/${ownerHandle}/${slug}` : `https://clawhub.ai/skills/${slug}`;
}

async function fetchSkillDetails(slug, fetchImpl) {
  const encodedSlug = encodeURIComponent(slug);
  const urls = [
    `https://clawhub.ai/api/v1/skills/${encodedSlug}`,
    `https://clawhub.ai/api/skill?slug=${encodedSlug}`
  ];

  const errors = [];
  for (const url of urls) {
    try {
      const payload = await fetchJsonWithTimeout(url, fetchImpl);
      if (payload?.skill?.slug) return payload;
      errors.push(`${url}: empty skill payload`);
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }

  return { error: errors.join(' | ') };
}

async function verifyAndEnrichCandidate(candidate, fetchImpl) {
  const detail = await fetchSkillDetails(candidate.packageSlug, fetchImpl);
  if (!detail?.skill?.slug) {
    return {
      candidate: null,
      warning: `Skipped unverifiable ClawHub candidate "${candidate.packageSlug}": ${detail.error ?? 'skill detail not found'}`
    };
  }

  const skill = detail.skill;
  const owner = detail.owner ?? {};
  const stats = skill.stats ?? {};
  const moderation = detail.moderation ?? {};
  const slug = normalizeSlug(skill.slug);
  const ownerHandle = normalizeSlug(owner.handle ?? owner.username ?? owner.name);
  const sourceSecurity =
    moderation.verdict ??
    moderation.status ??
    skill.security?.status ??
    candidate.sourceSecurity ??
    'unknown';
  const summary = compactText(skill.summary ?? skill.description ?? candidate.summary);
  const displayName = compactText(skill.displayName ?? skill.title ?? candidate.name) || candidate.name;

  return {
    candidate: {
      ...candidate,
      slug: ownerHandle ? `${ownerHandle}/${slug}` : slug,
      packageSlug: slug,
      author: ownerHandle,
      name: displayName,
      summary,
      sourceUrl: canonicalClawHubUrl(slug, ownerHandle),
      downloads: Number(stats.downloads ?? stats.installsAllTime ?? 0) || 0,
      stars: Number(stats.stars ?? 0) || 0,
      sourceSecurity,
      requiresApiKey:
        candidate.requiresApiKey ||
        /\b(api key|apikey|token|secret|credential|openai|anthropic|gemini|serpapi|github token)\b/i.test(
          `${displayName} ${summary}`
        ),
      verified: true
    },
    warning: null
  };
}

async function fetchJsonWithTimeout(url, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

async function searchClawHub(query, gap, fetchImpl) {
  const attempts = CLAWHUB_SEARCH_BASES.map(async (base) => {
    const url = new URL(base);
    url.searchParams.set('q', query);
    url.searchParams.set('query', query);
    url.searchParams.set('limit', String(SEARCH_LIMIT));

    const payload = await fetchJsonWithTimeout(url, fetchImpl);
    const items = extractArray(payload)
      .map((item) => normalizeCandidate(item, gap, query))
      .filter(Boolean);
    if (!items.length) throw new Error(`${url.origin}: empty search response`);
    return { items, warning: null };
  });

  const results = await Promise.allSettled(attempts);
  const success = results.find((result) => result.status === 'fulfilled');
  if (success?.status === 'fulfilled') return success.value;

  const errors = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason?.message ?? String(result.reason));
  return {
    items: [],
    warning: `ClawHub search failed for "${query}": ${errors.join(' | ')}`
  };
}

function findDuplicate(candidate, skills, installed) {
  const names = [
    candidate.slug,
    candidate.packageSlug,
    candidate.name,
    normalizeSlug(candidate.name)
  ].map(normalizeSlug);

  const exact = names.find((name) => installed.has(name));
  if (exact) return exact;

  const candidateText = `${candidate.name} ${candidate.summary} ${candidate.packageSlug}`;
  const close = skills
    .map((skill) => ({
      skill,
      score: overlapScore(candidateText, `${skill.name} ${skill.displayName} ${skill.description}`)
    }))
    .filter((entry) => entry.score >= 0.45)
    .sort((a, b) => b.score - a.score)[0];

  return close?.skill.displayName ?? null;
}

function findDuplicateSkillIds(candidate, skills) {
  const candidateNames = new Set(
    [candidate.slug, candidate.packageSlug, candidate.name, normalizeSlug(candidate.name)]
      .map(normalizeSlug)
      .filter(Boolean)
  );
  const candidateText = `${candidate.name} ${candidate.summary} ${candidate.packageSlug}`;

  return skills
    .map((skill) => {
      const names = [
        normalizeSlug(skill.name),
        normalizeSlug(skill.displayName),
        normalizeSlug(skill.name).replace(/-\d+\.\d+\.\d+$/, '')
      ];
      const exact = names.some((name) => candidateNames.has(name));
      return {
        skill,
        score: exact
          ? 1
          : overlapScore(candidateText, `${skill.name} ${skill.displayName} ${skill.description}`)
      };
    })
    .filter((entry) => entry.score >= 0.42)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => entry.skill.id);
}

function workflowMatchesForCandidate(candidate, gap, universe) {
  const bridge = new Set(gap.bridgeSkillIds ?? []);
  return (universe.insights ?? [])
    .filter((insight) => insight.type === 'mission')
    .filter((insight) => insight.skillIds.some((id) => bridge.has(id)))
    .slice(0, 4)
    .map((insight) => insight.id);
}

function auditCandidate(candidate, gap, universe) {
  const skills = universe.skills ?? [];
  const duplicateSkillIds = findDuplicateSkillIds(candidate, skills);
  const workflowIds = workflowMatchesForCandidate(candidate, gap, universe);
  const security = String(candidate.sourceSecurity ?? 'unknown').toLowerCase();
  const safeSecurity = ['clean', 'safe', 'approved'].includes(security);
  const reasons = [];
  let riskPoints = 0;

  if (gap.coverage < 0.5) reasons.push(`Fills weak coverage area: ${gap.label}`);
  else reasons.push(`Extends existing area: ${gap.label}`);
  if (candidate.stars > 0) reasons.push(`Verified ClawHub stars: ${candidate.stars}`);
  if (candidate.downloads > 0) reasons.push(`Verified ClawHub downloads: ${candidate.downloads}`);
  if (safeSecurity) reasons.push(`ClawHub security status: ${candidate.sourceSecurity}`);

  if (!safeSecurity) {
    riskPoints += security === 'unknown' ? 1 : 2;
    reasons.push(`Security status needs review: ${candidate.sourceSecurity}`);
  }
  if (candidate.requiresApiKey) {
    riskPoints += 1;
    reasons.push('Description suggests API key/token usage.');
  }
  if (duplicateSkillIds.length) {
    riskPoints += 1;
    reasons.push(`May overlap with ${duplicateSkillIds.length} installed skill(s).`);
  }
  if ((candidate.risks ?? []).some((risk) => /upload|third|network|secret|token|key/i.test(risk))) {
    riskPoints += 1;
  }

  const riskLevel = riskPoints >= 3 ? 'high' : riskPoints >= 1 ? 'medium' : 'low';
  const verdict =
    riskLevel === 'low'
      ? 'recommend'
      : riskLevel === 'medium'
        ? 'caution'
        : 'manual-review';

  return {
    verdict,
    reasons: reasons.slice(0, 6),
    riskLevel,
    duplicateSkillIds,
    workflowIds
  };
}

function textFromDeepDetail(detail, candidate) {
  const skill = detail?.skill ?? {};
  const fields = [
    candidate?.name,
    candidate?.summary,
    skill.name,
    skill.displayName,
    skill.title,
    skill.summary,
    skill.description,
    skill.readme,
    skill.skillMarkdown,
    skill.skillMd,
    skill.content,
    detail?.readme,
    detail?.skillMarkdown,
    detail?.skillMd,
    detail?.content
  ];
  const files = [
    ...(Array.isArray(skill.files) ? skill.files : []),
    ...(Array.isArray(detail?.files) ? detail.files : [])
  ];
  return [
    ...fields.filter(Boolean),
    ...files.map((file) => `${file.path ?? file.name ?? ''} ${file.content ?? file.summary ?? ''}`)
  ].join('\n');
}

function deepFinding(label, status, detail) {
  return { label, status, detail };
}

function buildDeepAuditSummary(candidate, detail, universe) {
  const text = textFromDeepDetail(detail, candidate);
  const lower = text.toLowerCase();
  const fetched = Boolean(detail?.skill?.slug);
  const findings = [];

  const hasScripts = /\b(scripts?|shell|powershell|bash|python|node|npm|pip|exec|spawn|subprocess|child_process)\b/i.test(text);
  const hasNetwork = /\b(https?:\/\/|fetch\(|axios|requests\.|curl|invoke-webrequest|iwr|download|upload|webhook)\b/i.test(text);
  const hasSecrets = /\b(api[_ -]?key|apikey|token|secret|credential|password|openai_api_key|github_token)\b/i.test(text);
  const hasSensitivePaths = /(\.env|\.ssh|appdata|%userprofile%|~\/|\/home\/|\\users\\|\.codex|\.aws|\.config)/i.test(text);
  const hasPromptInjection = /\b(ignore previous|system prompt|developer message|prompt injection|exfiltrat|leak secret|泄露|忽略.*指令)\b/i.test(text);

  findings.push(
    deepFinding(
      '脚本/命令执行',
      hasScripts ? 'watch' : fetched ? 'pass' : 'unknown',
      hasScripts ? '远程说明里出现脚本或命令执行相关词，安装前应检查 scripts 和命令。' : fetched ? '未在详情摘要中发现明显脚本执行信号。' : '未能获取远程详情，无法判断脚本风险。'
    ),
    deepFinding(
      '外部网络访问',
      hasNetwork ? 'watch' : fetched ? 'pass' : 'unknown',
      hasNetwork ? '远程说明里出现网络请求、下载或上传相关词，使用前应确认会访问哪些服务。' : fetched ? '未在详情摘要中发现明显网络访问描述。' : '未能获取远程详情，无法判断网络行为。'
    ),
    deepFinding(
      '密钥/API key 需求',
      hasSecrets || candidate.requiresApiKey ? 'risk' : fetched ? 'pass' : 'unknown',
      hasSecrets || candidate.requiresApiKey ? '发现 token、secret 或 API key 相关描述，安装和运行前要确认密钥保存位置。' : fetched ? '未发现明显密钥需求。' : '未能获取远程详情，无法判断密钥需求。'
    ),
    deepFinding(
      '敏感路径访问',
      hasSensitivePaths ? 'risk' : fetched ? 'pass' : 'unknown',
      hasSensitivePaths ? '说明中出现本地敏感路径迹象，安装前必须人工查看文件列表和脚本。' : fetched ? '未发现明显敏感路径访问迹象。' : '未能获取远程详情，无法判断本地路径访问。'
    ),
    deepFinding(
      'Prompt injection 风险',
      hasPromptInjection ? 'risk' : fetched ? 'pass' : 'unknown',
      hasPromptInjection ? '说明中出现提示注入或泄露相关高风险词，需要谨慎审查。' : fetched ? '未发现明显提示注入高风险词。' : '未能获取远程详情，无法判断提示注入风险。'
    )
  );

  const duplicateSkillIds = candidate.audit?.duplicateSkillIds?.length
    ? candidate.audit.duplicateSkillIds
    : findDuplicateSkillIds(candidate, universe.skills ?? []);
  const workflowIds = candidate.audit?.workflowIds ?? [];
  if (duplicateSkillIds.length) {
    findings.push(deepFinding('本地重复度', 'watch', `可能与 ${duplicateSkillIds.length} 个已安装 skill 重叠。`));
  } else {
    findings.push(deepFinding('本地重复度', 'pass', '未发现明显本地重复项。'));
  }

  const riskCount = findings.filter((finding) => finding.status === 'risk').length;
  const watchCount = findings.filter((finding) => finding.status === 'watch').length;
  const riskLevel = riskCount >= 2 ? 'high' : riskCount >= 1 || watchCount >= 2 ? 'medium' : 'low';
  const verdict = riskLevel === 'low' ? 'recommend' : riskLevel === 'medium' ? 'caution' : 'manual-review';

  return {
    slug: candidate.slug,
    title: candidate.name,
    sourceUrl: candidate.sourceUrl,
    checkedAt: new Date().toISOString(),
    fetched,
    verdict,
    riskLevel,
    findings,
    duplicateSkillIds,
    workflowIds,
    summary: fetched
      ? `已基于 ClawHub 详情摘要完成审查：${riskCount} 个高风险项，${watchCount} 个需关注项。`
      : '未能获取 ClawHub 详情；只能基于当前推荐缓存做保守审查。',
    warnings: fetched ? [] : ['ClawHub 详情暂不可用，安装前请手动打开页面检查 SKILL.md 和 scripts。']
  };
}

function scoreCandidate(candidate, gap, universe, installed) {
  const skills = universe.skills ?? [];
  const duplicate = findDuplicate(candidate, skills, installed);
  const complements = gap.bridgeSkillIds
    .map((id) => skills.find((skill) => skill.id === id))
    .filter(Boolean)
    .slice(0, 3)
    .map((skill) => ({
      id: skill.id,
      name: skill.displayName,
      purpose: `可接在 ${skill.displayName} 之后补足「${gap.label}」`
    }));

  const rationale = [
    `命中空白区「${gap.label}」`,
    gap.coverage < 0.5 ? '当前本地覆盖偏弱，优先级高' : '本地已有部分能力，可作为增强模块'
  ];
  const risks = [];

  if (duplicate) {
    risks.push(`可能与已安装的 ${duplicate} 功能重叠`);
  }
  if (candidate.requiresApiKey) {
    risks.push('描述中疑似提到 API key、token 或第三方凭据');
  }
  if (candidate.sourceSecurity === 'unknown') {
    risks.push('来源安全状态未知，安装前需要审查 SKILL.md 和脚本');
  } else if (!['clean', 'safe', 'approved'].includes(String(candidate.sourceSecurity).toLowerCase())) {
    risks.push(`ClawHub 安全状态为 ${candidate.sourceSecurity}，安装前必须人工审查`);
  }
  if (candidate.downloads) rationale.push(`ClawHub 下载量 ${candidate.downloads}`);
  if (candidate.stars) rationale.push(`Stars ${candidate.stars}`);

  const popularity = Math.min(16, Math.log10(candidate.downloads + 1) * 5 + Math.log10(candidate.stars + 1) * 4);
  const remoteBoost = Math.min(10, candidate.remoteScore ? candidate.remoteScore * 10 : 0);
  const score =
    32 +
    gap.priority * 36 +
    popularity +
    remoteBoost -
    (duplicate ? 22 : 0) -
    (candidate.requiresApiKey ? 8 : 0) -
    (candidate.sourceSecurity === 'unknown' ? 3 : 0);

  const scoredCandidate = {
    ...candidate,
    duplicateOf: duplicate,
    complements,
    rationale,
    risks,
    recommendationScore: Math.max(0, Math.min(100, Math.round(score)))
  };

  return {
    ...scoredCandidate,
    audit: auditCandidate(scoredCandidate, gap, universe)
  };
}

function dedupeCandidates(candidates) {
  const bySlug = new Map();
  for (const candidate of candidates) {
    const current = bySlug.get(candidate.slug);
    if (!current || candidate.recommendationScore > current.recommendationScore) {
      bySlug.set(candidate.slug, candidate);
    }
  }
  return [...bySlug.values()].sort((a, b) => b.recommendationScore - a.recommendationScore);
}

export function buildInstallPlanForCandidate(candidate) {
  const packageSlug = candidate.packageSlug ?? candidate.slug?.split('/').filter(Boolean).at(-1) ?? candidate.slug;
  const skillDir = `%USERPROFILE%\\.codex\\skills\\${packageSlug}`;
  return {
    slug: candidate.slug,
    title: `安装方案：${candidate.name}`,
    sourceUrl: candidate.sourceUrl,
    commands: [
      `npx clawhub@latest install ${packageSlug}`,
      `Test-Path "${skillDir}\\SKILL.md"`
    ],
    auditSteps: [
      '先打开 ClawHub 页面查看 SKILL.md、作者、更新时间、下载量和 README。',
      '检查 scripts/assets/references 是否包含会上传本地文件、读取密钥或执行远程脚本的逻辑。',
      '如果描述里要求 API key/token，先确认用途和保存位置，不要把密钥写进仓库。'
    ],
    verificationSteps: [
      `确认 ${skillDir}\\SKILL.md 存在。`,
      '回到 Skill Universe，等待自动监控提示“发现新 skill”，再更新星域。',
      '重启 Codex，让新 skill 被运行时完整识别。'
    ],
    warnings: candidate.risks?.length ? candidate.risks : ['来源安全状态未知，安装前请审查 skill 内容。']
  };
}

async function computeRecommendations(universe, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const gaps = analyzeSkillGaps(universe);
  const installed = installedNames(universe.skills ?? []);
  const warnings = [];
  const jobs = gaps
    .filter((entry) => entry.priority >= 0.15)
    .flatMap((gap) =>
      gap.queryTerms.slice(0, 2).map((query) =>
        searchClawHub(query, gap, fetchImpl)
      )
    );

  const searchResults = await Promise.all(jobs);
  for (const result of searchResults) {
    if (result.warning) warnings.push(result.warning);
  }
  const rawCandidates = searchResults.flatMap((result) => result.items);
  const searched = jobs.length;

  const uniqueRawCandidates = dedupeCandidates(rawCandidates).slice(0, 36);
  const detailResults = await Promise.all(
    uniqueRawCandidates.map((candidate) => verifyAndEnrichCandidate(candidate, fetchImpl))
  );
  for (const result of detailResults) {
    if (result.warning) warnings.push(result.warning);
  }

  const verifiedCandidates = detailResults.map((result) => result.candidate).filter(Boolean);
  if (!verifiedCandidates.length) {
    warnings.push('No verified ClawHub candidates were returned. Hidden install recommendations until the detail API confirms real skills.');
  }

  const scored = dedupeCandidates(
    verifiedCandidates.map((candidate) => {
      const gap = gaps.find((entry) => entry.id === candidate.gapId);
      return scoreCandidate(candidate, gap, universe, installed);
    })
  );

  const candidates = scored.slice(0, 18);

  return {
    cacheVersion: RECOMMENDATION_CACHE_VERSION,
    generatedAt: new Date().toISOString(),
    source: candidates.length > 0 ? 'clawhub' : 'offline',
    status: candidates.length > 0 ? 'online' : 'offline',
    universeFingerprint: universeFingerprint(universe),
    gaps,
    candidates,
    meta: {
      searchedQueries: searched,
      verifiedCandidates: verifiedCandidates.length,
      cacheTtlHours: Math.round(CACHE_MAX_AGE_MS / 1000 / 60 / 60),
      privacy: 'Only gap keywords are sent to ClawHub. Local skill bodies, paths, logs, and secrets are never uploaded.',
      warnings
    }
  };
}

export async function buildSkillRecommendations(options = {}) {
  const universe = options.universe ?? await buildSkillUniverse();
  const fingerprint = universeFingerprint(universe);
  const cache = await readCache();
  const cacheTime = cache?.generatedAt ? Date.parse(cache.generatedAt) : 0;
  const isFresh =
    cache?.cacheVersion === RECOMMENDATION_CACHE_VERSION &&
    cache?.universeFingerprint === fingerprint &&
    Date.now() - cacheTime < CACHE_MAX_AGE_MS;

  if (!options.refresh && isFresh) {
    return {
      ...cache,
      fromCache: true
    };
  }

  const computed = await computeRecommendations(universe, options);
  if (options.writeCache !== false) await writeCache(computed);
  return {
    ...computed,
    fromCache: false
  };
}

export async function buildInstallPlan(slug) {
  if (!slug) throw new Error('Missing candidate slug');
  const cache = await readCache();
  const candidate = cache?.candidates?.find((item) => item.slug === slug || item.packageSlug === slug);
  if (candidate) return buildInstallPlanForCandidate(candidate);

  const fallback = {
    slug,
    packageSlug: slug.split('/').filter(Boolean).at(-1) ?? slug,
    name: slug,
    sourceUrl: `https://clawhub.ai/${slug}`,
    risks: ['该候选不在当前推荐缓存中，请先刷新推荐结果再安装。']
  };
  return buildInstallPlanForCandidate(fallback);
}

export async function buildDeepAudit(slug, options = {}) {
  if (!slug) throw new Error('Missing candidate slug');
  const cache = await readCache();
  const candidate = cache?.candidates?.find((item) => item.slug === slug || item.packageSlug === slug);
  if (!candidate) throw new Error('Candidate is not in the current recommendation cache. Refresh recommendations first.');

  const universe = options.universe ?? await buildSkillUniverse();
  const detail = await fetchSkillDetails(candidate.packageSlug, options.fetchImpl ?? fetch);
  return buildDeepAuditSummary(candidate, detail, universe);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function checkInstallStatus(slug) {
  if (!slug) throw new Error('Missing candidate slug');
  const cache = await readCache();
  const candidate = cache?.candidates?.find((item) => item.slug === slug || item.packageSlug === slug);
  const packageSlug = candidate?.packageSlug ?? slug.split('/').filter(Boolean).at(-1) ?? slug;
  const home = os.homedir();
  const targets = [
    {
      label: 'Codex skills',
      root: path.join(home, '.codex', 'skills'),
      skillPath: path.join(home, '.codex', 'skills', packageSlug)
    },
    {
      label: 'OpenClaw workspace',
      root: path.join(home, '.openclaw', 'workspace', 'skills'),
      skillPath: path.join(home, '.openclaw', 'workspace', 'skills', packageSlug)
    }
  ];

  const matches = await Promise.all(
    targets.map(async (target) => {
      const skillFile = path.join(target.skillPath, 'SKILL.md');
      const exists = await fileExists(skillFile);
      return {
        ...target,
        skillFile,
        exists
      };
    })
  );

  const installed = matches.some((match) => match.exists);
  return {
    slug: candidate?.slug ?? slug,
    packageSlug,
    checkedAt: new Date().toISOString(),
    installed,
    matches,
    nextAction: installed
      ? 'Skill file found. Refresh the star field or wait for the directory monitor to prompt an update.'
      : 'Skill file not found yet. Run the install command, then check again.'
  };
}
