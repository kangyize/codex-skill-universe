import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDir, projectsDir } from './config.mjs';
import { buildSkillUniverse } from './relations.mjs';

const INDEX_PATH = path.join(projectsDir, 'index.json');

export const STAGE_OPTIONS = [
  { id: 'ideation', label: '选题构思' },
  { id: 'novelty', label: '查新定位' },
  { id: 'experiment', label: '实验设计' },
  { id: 'analysis', label: '结果分析' },
  { id: 'writing', label: '论文写作' },
  { id: 'submission', label: '投稿准备' },
  { id: 'rebuttal', label: '返修回复' }
];

const ROUTE_TEMPLATES = {
  ideation: [
    ['idea-discovery', '从方向出发生成候选问题和研究切口'],
    ['novelty-check', '快速查新，避免撞题'],
    ['research-refine', '收敛成可实验的问题定义'],
    ['experiment-plan', '把想法转成实验路线']
  ],
  novelty: [
    ['paper-lookup', '检索论文和 DOI'],
    ['literature-review', '形成系统综述与证据表'],
    ['novelty-check', '检查近期工作和差异点'],
    ['citation-management', '整理可靠引用']
  ],
  experiment: [
    ['experiment-plan', '拆解变量、baseline 和评价指标'],
    ['run-experiment', '启动本地或远程实验'],
    ['monitor-experiment', '跟踪训练和运行状态'],
    ['ablation-planner', '补齐消融实验']
  ],
  analysis: [
    ['results-analysis', '统计分析、显著性和图表解读'],
    ['statistical-analysis', '选择检验方法和报告口径'],
    ['result-to-claim', '判断结果能支撑哪些 claim'],
    ['paper-figure', '生成论文图表']
  ],
  writing: [
    ['paper-plan', '生成论文结构大纲'],
    ['paper-write', '按段落推进 LaTeX 初稿'],
    ['scientific-writing', '强化学术叙事与论证'],
    ['paper-compile', '编译并检查 PDF']
  ],
  submission: [
    ['paper-self-review', '投稿前自查结构和质量'],
    ['citation-verification', '核验引用和参考文献'],
    ['peer-review', '模拟审稿意见'],
    ['auto-paper-improvement-loop', '多轮改稿']
  ],
  rebuttal: [
    ['review-response', '拆解审稿意见和回应策略'],
    ['rebuttal', '生成安全、覆盖完整的 rebuttal'],
    ['paper-write', '同步修改正文'],
    ['paper-compile', '重新编译提交稿']
  ]
};

const PROJECT_GAPS = [
  {
    id: 'related-work',
    label: '相关工作不足',
    stages: ['ideation', 'novelty', 'writing'],
    severity: 'high',
    skillNames: ['paper-lookup', 'literature-review', 'research-lit'],
    missing: (project) => project.papers.length < 3,
    reason: '项目关联论文少于 3 篇，related work 和 novelty 判断容易偏空。',
    action: '先补一轮文献检索和综述，把关键论文、数据集和方法脉络列出来。'
  },
  {
    id: 'novelty-position',
    label: '创新点定位不稳',
    stages: ['ideation', 'novelty'],
    severity: 'high',
    skillNames: ['novelty-check', 'research-refine', 'academic-deep-research'],
    missing: (project) => !project.currentQuestion || project.currentQuestion.length < 20,
    reason: '当前问题描述还不够具体，难以和已有工作形成清晰差异。',
    action: '把研究问题压缩成一个可验证命题，再做查新和反例搜索。'
  },
  {
    id: 'experiment-plan',
    label: '实验路线缺口',
    stages: ['experiment', 'analysis'],
    severity: 'high',
    skillNames: ['experiment-plan', 'run-experiment', 'ablation-planner'],
    missing: (project) => !project.experimentPath && project.stage !== 'ideation',
    reason: '还没有绑定实验目录或实验路线，后续结果分析缺少落点。',
    action: '先产出 experiment plan，再把代码目录或日志路径挂到项目档案里。'
  },
  {
    id: 'claim-evidence',
    label: 'Claim 证据链不足',
    stages: ['analysis', 'writing', 'submission'],
    severity: 'high',
    skillNames: ['result-to-claim', 'results-analysis', 'paper-figure'],
    missing: (project) => project.claims.length === 0 || project.claims.some((claim) => ['missing', 'risk'].includes(claim.status)),
    reason: '存在未登记 claim，或 claim 仍缺证据/风险较高。',
    action: '把核心 claim、支撑实验、图表和引用逐项绑定，避免论文主张悬空。'
  },
  {
    id: 'stats-and-figures',
    label: '统计与图表未闭环',
    stages: ['analysis', 'writing', 'submission'],
    severity: 'medium',
    skillNames: ['statistical-analysis', 'results-analysis', 'paper-figure'],
    missing: (project) => ['analysis', 'writing', 'submission'].includes(project.stage),
    reason: '进入结果/写作阶段后，需要显著性、置信区间、图表规范和 caption 一起闭环。',
    action: '先跑统计分析，再把可发表图表和图注纳入证据链。'
  },
  {
    id: 'citation-quality',
    label: '引用可靠性待核验',
    stages: ['writing', 'submission', 'rebuttal'],
    severity: 'medium',
    skillNames: ['citation-verification', 'citation-management', 'paper-self-review'],
    missing: (project) => ['writing', 'submission', 'rebuttal'].includes(project.stage),
    reason: '写作和投稿阶段需要核验 DOI、作者、年份、引用位置和参考文献格式。',
    action: '在定稿前做一次 citation verification，减少低级引用错误。'
  },
  {
    id: 'review-defense',
    label: '审稿风险未预演',
    stages: ['submission', 'rebuttal'],
    severity: 'medium',
    skillNames: ['peer-review', 'paper-self-review', 'review-response', 'rebuttal'],
    missing: (project) => ['submission', 'rebuttal'].includes(project.stage),
    reason: '投稿/返修阶段应提前模拟审稿人对 novelty、实验和叙事的攻击点。',
    action: '先模拟审稿意见，再逐条补实验、补表述或准备 rebuttal。'
  }
];

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  const slug = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || crypto.randomBytes(4).toString('hex');
}

function safeProjectId(value) {
  return String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || crypto.randomBytes(4).toString('hex');
}

function compactStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value ?? '')
    .split(/\r?\n|[,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeClaim(raw) {
  return {
    id: String(raw?.id ?? `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`),
    text: String(raw?.text ?? '').trim(),
    evidence: String(raw?.evidence ?? '').trim(),
    status: ['supported', 'partial', 'missing', 'risk'].includes(raw?.status) ? raw.status : 'missing',
    skillIds: compactStringArray(raw?.skillIds),
    notes: String(raw?.notes ?? '').trim()
  };
}

function normalizeProject(raw) {
  const id = safeProjectId(raw?.id ?? slugify(raw?.name ?? 'research-project'));
  const stage = STAGE_OPTIONS.some((item) => item.id === raw?.stage) ? raw.stage : 'ideation';
  const createdAt = raw?.createdAt ?? nowIso();
  return {
    id,
    name: String(raw?.name ?? '未命名科研项目').trim() || '未命名科研项目',
    direction: String(raw?.direction ?? '').trim(),
    targetVenue: String(raw?.targetVenue ?? '').trim(),
    stage,
    keywords: compactStringArray(raw?.keywords),
    papers: compactStringArray(raw?.papers),
    experimentPath: String(raw?.experimentPath ?? '').trim(),
    currentQuestion: String(raw?.currentQuestion ?? '').trim(),
    claims: Array.isArray(raw?.claims) ? raw.claims.map(normalizeClaim).filter((claim) => claim.text) : [],
    notes: String(raw?.notes ?? '').trim(),
    createdAt,
    updatedAt: raw?.updatedAt ?? createdAt
  };
}

async function ensureProjectsDir() {
  await ensureDataDir();
  await fs.mkdir(projectsDir, { recursive: true });
}

async function readIndex() {
  try {
    return JSON.parse(await fs.readFile(INDEX_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeIndex(index) {
  await ensureProjectsDir();
  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
}

async function readProjects() {
  await ensureProjectsDir();
  let entries = [];
  try {
    entries = await fs.readdir(projectsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const projects = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'index.json') continue;
    try {
      const raw = JSON.parse(await fs.readFile(path.join(projectsDir, entry.name), 'utf8'));
      projects.push(normalizeProject(raw));
    } catch {
      // Keep a malformed project file from breaking the dashboard.
    }
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function writeProject(project) {
  await ensureProjectsDir();
  await fs.writeFile(path.join(projectsDir, `${project.id}.json`), JSON.stringify(project, null, 2), 'utf8');
}

function skillSearchText(skill) {
  return [
    skill.id,
    skill.name,
    skill.displayName,
    skill.description,
    ...(skill.domains ?? []),
    ...(skill.triggerTerms ?? []),
    ...(skill.headings ?? [])
  ].join(' ').toLowerCase();
}

function findSkill(universe, preferredNames, extraTerms = []) {
  const skills = universe.skills ?? [];
  for (const name of preferredNames) {
    const exact = skills.find((skill) => skill.name === name || skill.id === name || skill.displayName === name);
    if (exact) return exact;
  }

  const terms = [...preferredNames, ...extraTerms].map((term) => String(term).toLowerCase()).filter(Boolean);
  return skills
    .map((skill) => {
      const text = skillSearchText(skill);
      const score = terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
      return { skill, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.skill.health.score - a.skill.health.score)[0]?.skill;
}

function buildStageRoute(project, universe) {
  const template = ROUTE_TEMPLATES[project.stage] ?? ROUTE_TEMPLATES.ideation;
  const steps = [];
  const seen = new Set();
  for (const [preferredName, purpose] of template) {
    const skill = findSkill(universe, [preferredName], project.keywords);
    if (!skill || seen.has(skill.id)) continue;
    seen.add(skill.id);
    steps.push({
      skillId: skill.id,
      name: skill.displayName,
      purpose,
      health: skill.health.score
    });
  }
  const completeness = template.length ? Math.round((steps.length / template.length) * 100) : 0;
  return {
    id: `${project.stage}-route`,
    title: `${STAGE_OPTIONS.find((item) => item.id === project.stage)?.label ?? '科研'}航线`,
    rationale: `按项目当前阶段自动匹配 ${steps.length}/${template.length} 个本地 skill。`,
    skillIds: steps.map((step) => step.skillId),
    steps,
    completeness
  };
}

function buildProjectGaps(project, universe) {
  return PROJECT_GAPS
    .filter((gap) => gap.stages.includes(project.stage) || gap.missing(project))
    .filter((gap) => gap.missing(project))
    .map((gap) => {
      const skillIds = gap.skillNames
        .map((name) => findSkill(universe, [name], project.keywords)?.id)
        .filter(Boolean);
      return {
        id: gap.id,
        label: gap.label,
        severity: gap.severity,
        reason: gap.reason,
        action: gap.action,
        skillIds: [...new Set(skillIds)]
      };
    })
    .slice(0, 6);
}

function buildNextActions(project, route, gaps) {
  const routeStep = route.steps[0];
  const actions = gaps.slice(0, 3).map((gap, index) => ({
    id: `gap-${gap.id}`,
    title: gap.label,
    detail: gap.action,
    priority: index + 1,
    skillIds: gap.skillIds
  }));

  if (routeStep) {
    actions.unshift({
      id: `route-${routeStep.skillId}`,
      title: `下一步使用 ${routeStep.name}`,
      detail: routeStep.purpose,
      priority: 0,
      skillIds: [routeStep.skillId]
    });
  }

  if (!actions.length) {
    actions.push({
      id: 'keep-going',
      title: '继续推进当前阶段',
      detail: project.currentQuestion || '项目档案较完整，可以继续沿当前航线推进并记录证据链。',
      priority: 1,
      skillIds: route.skillIds.slice(0, 2)
    });
  }

  return actions.slice(0, 4);
}

function buildEvidenceSummary(project, universe) {
  if (!project.claims.length) {
    const skill = findSkill(universe, ['result-to-claim', 'results-analysis']);
    return [{
      id: 'claim-placeholder',
      text: '尚未登记核心 claim',
      evidence: '需要从实验结果、图表或文献证据中提炼。',
      status: 'missing',
      skillIds: skill ? [skill.id] : [],
      notes: '进入分析或写作阶段前，建议先补 claim-evidence 表。'
    }];
  }
  return project.claims.map((claim) => ({
    ...claim,
    skillIds: claim.skillIds.filter((id) => universe.skills.some((skill) => skill.id === id))
  }));
}

function buildResearchAnalysis(project, universe) {
  if (!project) return null;
  const route = buildStageRoute(project, universe);
  const gaps = buildProjectGaps(project, universe);
  const nextActions = buildNextActions(project, route, gaps);
  const evidence = buildEvidenceSummary(project, universe);
  return {
    projectId: project.id,
    stageLabel: STAGE_OPTIONS.find((item) => item.id === project.stage)?.label ?? project.stage,
    routes: [route],
    gaps,
    nextActions,
    evidence,
    summary: gaps.length
      ? `当前阶段发现 ${gaps.length} 个项目缺口，建议先处理「${gaps[0].label}」。`
      : '项目档案和当前阶段没有明显硬缺口，可以继续沿推荐航线推进。'
  };
}

export async function listResearchProjects({ activeId } = {}) {
  const [index, projects, universe] = await Promise.all([
    readIndex(),
    readProjects(),
    buildSkillUniverse()
  ]);
  const activeProjectId = activeId ?? index.activeProjectId ?? projects[0]?.id ?? null;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null;

  return {
    generatedAt: nowIso(),
    projects,
    activeProjectId: activeProject?.id ?? null,
    activeProject,
    analysis: buildResearchAnalysis(activeProject, universe),
    stageOptions: STAGE_OPTIONS,
    meta: {
      storage: '.skill-universe/projects/*.json',
      apiKeyRequired: false,
      privacy: '项目档案只保存在本项目目录，不上传论文全文、实验日志或密钥。'
    }
  };
}

export async function saveResearchProject(rawProject) {
  const currentProjects = await readProjects();
  const requestedId = rawProject?.id ? safeProjectId(rawProject.id) : '';
  const existing = requestedId ? currentProjects.find((project) => project.id === requestedId) : null;
  const baseId = requestedId || slugify(rawProject?.name ?? 'research-project');
  let id = baseId;
  if (!existing) {
    const existingIds = new Set(currentProjects.map((project) => project.id));
    while (existingIds.has(id)) id = `${baseId}-${crypto.randomBytes(2).toString('hex')}`;
  }
  const now = nowIso();
  const project = normalizeProject({
    ...existing,
    ...rawProject,
    id,
    createdAt: existing?.createdAt ?? rawProject?.createdAt ?? now,
    updatedAt: now
  });
  await writeProject(project);
  await writeIndex({ activeProjectId: project.id });
  return listResearchProjects({ activeId: project.id });
}

export async function deleteResearchProject(projectId) {
  await ensureProjectsDir();
  const id = projectId ? safeProjectId(projectId) : '';
  if (id) {
    try {
      await fs.unlink(path.join(projectsDir, `${id}.json`));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const projects = await readProjects();
  await writeIndex({ activeProjectId: projects[0]?.id ?? null });
  return listResearchProjects({ activeId: projects[0]?.id });
}

export async function setActiveResearchProject(projectId) {
  const projects = await readProjects();
  const activeProjectId = projects.some((project) => project.id === projectId)
    ? projectId
    : projects[0]?.id ?? null;
  await writeIndex({ activeProjectId });
  return listResearchProjects({ activeId: activeProjectId });
}
