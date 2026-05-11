import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.mjs';

const DOMAIN_DEFINITIONS = [
  {
    id: 'literature',
    label: '文献检索',
    color: '#4dd7a8',
    keywords: ['literature', 'review', 'paper-lookup', 'citation', 'pubmed', 'arxiv', 'scholar', '文献', '引用']
  },
  {
    id: 'paper-writing',
    label: '论文写作',
    color: '#f2c14e',
    keywords: ['paper', 'writing', 'manuscript', 'scientific-writing', 'review-response', 'peer-review', '论文', '写作', 'rebuttal']
  },
  {
    id: 'documents',
    label: '文档/PDF',
    color: '#67b7ff',
    keywords: ['docx', 'document', 'pdf', 'pptx', 'slides', 'spreadsheet', 'word', 'mineru', 'ocr', 'markdown', '文档']
  },
  {
    id: 'analysis',
    label: '统计分析',
    color: '#ff8a65',
    keywords: ['analysis', 'statistical', 'results', 'experiment', 'ablation', '统计', '实验', '结果']
  },
  {
    id: 'research',
    label: '学术研究',
    color: '#a88bff',
    keywords: ['research', 'academic', 'ideation', 'reproduction', 'deep-research', 'feasibility', '科研', '研究']
  },
  {
    id: 'domain',
    label: '专业领域',
    color: '#ef6f91',
    keywords: ['carbonate', 'polarization', 'patent', 'blast', 'nc-', 'ontology', '专利', '偏振', '数字岩心']
  },
  {
    id: 'tools',
    label: '插件工具',
    color: '#8fd14f',
    keywords: ['github', 'plugin', 'skill', 'defuddle', 'finder', 'extract', 'security', 'moltguard', 'tool']
  },
  {
    id: 'other',
    label: '其他航区',
    color: '#cfd4dc',
    keywords: []
  }
];

export { DOMAIN_DEFINITIONS };

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readDirNames(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function stripYamlQuotes(value) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { frontmatter: '', body: markdown };
  return {
    frontmatter: match[1],
    body: markdown.slice(match[0].length)
  };
}

function parseYamlField(frontmatter, field) {
  const lines = frontmatter.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(new RegExp(`^${field}:\\s*(.*)$`));
    if (!match) continue;

    const initial = match[1].trim();
    if (initial && !initial.startsWith('|') && !initial.startsWith('>')) {
      return stripYamlQuotes(initial);
    }

    const collected = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const nextLine = lines[next];
      if (/^[A-Za-z0-9_-]+:\s*/.test(nextLine)) break;
      if (nextLine.trim()) collected.push(nextLine.trim());
    }
    return normalizeText(collected.join(' '));
  }

  return '';
}

function extractHeadings(body) {
  return [...body.matchAll(/^#{1,3}\s+(.+)$/gm)]
    .map((match) => normalizeText(match[1].replace(/[#*`]/g, '')))
    .filter(Boolean)
    .slice(0, 10);
}

function tokenize(text) {
  return [...new Set(
    text
      .toLowerCase()
      .replace(/[`"'“”‘’()[\]{}:;,.!?/\\|<>]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 4 && token.length <= 36)
  )];
}

function inferDomains(skill) {
  const haystack = `${skill.name} ${skill.description} ${skill.headings.join(' ')}`.toLowerCase();
  const scored = DOMAIN_DEFINITIONS.filter((domain) => domain.id !== 'other')
    .map((domain) => ({
      id: domain.id,
      score: domain.keywords.reduce(
        (sum, keyword) => sum + (haystack.includes(keyword.toLowerCase()) ? 1 : 0),
        0
      )
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.id);

  return scored.length ? scored.slice(0, 3) : ['other'];
}

function getPrimaryDomain(skill) {
  return skill.domains[0] ?? 'other';
}

function listResourceNames(skillPath, folderName) {
  return readDirNames(path.join(skillPath, folderName));
}

async function collectResources(skillPath) {
  const [scripts, references, assets, agents] = await Promise.all([
    listResourceNames(skillPath, 'scripts'),
    listResourceNames(skillPath, 'references'),
    listResourceNames(skillPath, 'assets'),
    pathExists(path.join(skillPath, 'agents', 'openai.yaml'))
  ]);

  return { scripts, references, assets, agents };
}

function makeId(source, skillPath, name) {
  const stable = crypto.createHash('sha1').update(`${source}:${skillPath}:${name}`).digest('hex').slice(0, 10);
  const slug = (name || path.basename(skillPath)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'skill'}-${stable}`;
}

function computeHash(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function computeSkillHealth({ name, description, headings, triggerTerms, resources, frontmatter, updatedAt }) {
  const issues = [];
  const suggestions = [];
  let score = 100;
  const staleDays = Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 86400000));

  if (!frontmatter) {
    score -= 18;
    issues.push('Missing frontmatter');
    suggestions.push('Add YAML frontmatter with name and description.');
  }

  if (!description) {
    score -= 24;
    issues.push('Missing description');
    suggestions.push('Add a specific description so Codex knows when to use this skill.');
  } else if (description.length < 48) {
    score -= 10;
    issues.push('Description is short');
    suggestions.push('Expand the description with triggers, scope, and expected outputs.');
  }

  if (!headings.length) {
    score -= 10;
    issues.push('No section headings');
    suggestions.push('Add headings for workflow, inputs, outputs, and safety notes.');
  }

  if (!triggerTerms.length || (name && triggerTerms.length < 3)) {
    score -= 8;
    issues.push('Few trigger terms');
    suggestions.push('Mention common user phrases that should activate this skill.');
  }

  if (!resources.scripts.length && !resources.references.length && !resources.assets.length && !resources.agents) {
    score -= 6;
    issues.push('No resources folder content');
    suggestions.push('Add scripts, references, or assets when the workflow needs reusable material.');
  }

  if (!resources.references.length) {
    score -= 4;
    suggestions.push('Add references when the skill depends on stable background guidance.');
  }

  if (staleDays > 365) {
    score -= 12;
    issues.push('Stale for over a year');
    suggestions.push('Review whether instructions and external tools are still current.');
  } else if (staleDays > 180) {
    score -= 6;
    issues.push('Stale for over six months');
    suggestions.push('Schedule a quick refresh pass.');
  }

  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  const level = normalized >= 78 ? 'good' : normalized >= 55 ? 'watch' : 'risk';

  return {
    score: normalized,
    level,
    issues,
    suggestions: [...new Set(suggestions)].slice(0, 5),
    staleDays
  };
}

function inferPluginLabel(skillPath, pluginCacheRoot) {
  const relative = path.relative(pluginCacheRoot, skillPath);
  const parts = relative.split(path.sep).filter(Boolean);
  const skillIndex = parts.indexOf('skills');
  if (skillIndex <= 0) return 'plugin';
  return parts.slice(0, skillIndex).join(' / ');
}

async function parseSkill(skillPath, source, sourceLabel, warnings) {
  const skillFile = path.join(skillPath, 'SKILL.md');
  const markdown = await fs.readFile(skillFile, 'utf8');
  const stats = await fs.stat(skillFile);
  const { frontmatter, body } = parseFrontmatter(markdown);
  const name = parseYamlField(frontmatter, 'name') || path.basename(skillPath);
  const description = parseYamlField(frontmatter, 'description');
  const headings = extractHeadings(body);
  const resources = await collectResources(skillPath);
  const health = computeSkillHealth({
    name,
    description,
    headings,
    triggerTerms: tokenize(`${name} ${description}`).slice(0, 12),
    resources,
    frontmatter,
    updatedAt: stats.mtime
  });

  if (!frontmatter) warnings.push(`Missing frontmatter: ${skillFile}`);
  if (!description) warnings.push(`Missing description: ${skillFile}`);

  const base = {
    id: makeId(source, skillPath, name),
    name,
    displayName: name.replace(/^"|"$/g, ''),
    source,
    sourceLabel,
    path: skillPath,
    description,
    headings,
    triggerTerms: tokenize(`${name} ${description}`).slice(0, 12),
    resources,
    domains: [],
    clusterId: 'other',
    position: [0, 0, 0],
    color: '#cfd4dc',
    radius: 1,
    updatedAt: stats.mtime.toISOString(),
    contentHash: '',
    health
  };

  base.domains = inferDomains(base);
  base.clusterId = getPrimaryDomain(base);
  const domain = DOMAIN_DEFINITIONS.find((entry) => entry.id === base.clusterId) ?? DOMAIN_DEFINITIONS.at(-1);
  base.color = domain.color;
  base.radius = 0.86 + Math.min(0.5, base.triggerTerms.length / 36) + (resources.scripts.length ? 0.12 : 0);
  base.contentHash = computeHash({
    name,
    description,
    headings,
    triggerTerms: base.triggerTerms,
    resources,
    domains: base.domains
  });

  return base;
}

async function scanLocalSkills(skillsRoot, warnings) {
  const skills = [];
  const folders = await readDirNames(skillsRoot);

  for (const folder of folders) {
    const skillPath = path.join(skillsRoot, folder);
    if (!(await pathExists(path.join(skillPath, 'SKILL.md')))) continue;
    try {
      skills.push(await parseSkill(skillPath, 'local', '本机 skills', warnings));
    } catch (error) {
      warnings.push(`Failed to parse ${skillPath}: ${error.message}`);
    }
  }

  return skills;
}

async function findPluginSkillDirs(pluginCacheRoot, warnings) {
  const found = [];

  async function walk(dirPath, depth = 0) {
    if (depth > 9) return;
    let entries = [];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md')) {
      found.push(dirPath);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name === 'assets') continue;
      await walk(path.join(dirPath, entry.name), depth + 1);
    }
  }

  if (!(await pathExists(pluginCacheRoot))) {
    warnings.push(`Plugin cache not found: ${pluginCacheRoot}`);
    return found;
  }

  await walk(pluginCacheRoot);
  return found;
}

async function scanPluginSkills(pluginCacheRoot, warnings) {
  const dirs = await findPluginSkillDirs(pluginCacheRoot, warnings);
  const skills = [];

  for (const skillPath of dirs) {
    try {
      skills.push(
        await parseSkill(
          skillPath,
          'plugin',
          inferPluginLabel(skillPath, pluginCacheRoot),
          warnings
        )
      );
    } catch (error) {
      warnings.push(`Failed to parse ${skillPath}: ${error.message}`);
    }
  }

  return skills;
}

function layoutSkills(skills) {
  const clusters = DOMAIN_DEFINITIONS.map((domain, index) => {
    const angle = (index / DOMAIN_DEFINITIONS.length) * Math.PI * 2;
    const orbit = domain.id === 'other' ? 19 : 14 + (index % 3) * 2.6;
    return {
      id: domain.id,
      label: domain.label,
      color: domain.color,
      skillIds: [],
      position: [
        Number((Math.cos(angle) * orbit).toFixed(2)),
        Number((((index % 2) - 0.5) * 5).toFixed(2)),
        Number((Math.sin(angle) * orbit).toFixed(2))
      ],
      description: domain.keywords.slice(0, 4).join(' / ')
    };
  });

  const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  const grouped = new Map();

  for (const skill of skills) {
    const cluster = clusterById.get(skill.clusterId) ?? clusterById.get('other');
    cluster.skillIds.push(skill.id);
    if (!grouped.has(cluster.id)) grouped.set(cluster.id, []);
    grouped.get(cluster.id).push(skill);
  }

  for (const [clusterId, items] of grouped) {
    const cluster = clusterById.get(clusterId);
    items.forEach((skill, index) => {
      const angle = (index / Math.max(1, items.length)) * Math.PI * 2;
      const layer = Math.floor(index / 8);
      const spread = 2.2 + layer * 1.1 + Math.min(2.8, items.length * 0.08);
      const vertical = ((index % 5) - 2) * 0.72;
      skill.position = [
        Number((cluster.position[0] + Math.cos(angle) * spread).toFixed(2)),
        Number((cluster.position[1] + vertical).toFixed(2)),
        Number((cluster.position[2] + Math.sin(angle) * spread).toFixed(2))
      ];
      skill.color = cluster.color;
    });
  }

  return clusters.filter((cluster) => cluster.skillIds.length > 0);
}

export async function scanSkillsOnly() {
  const config = await loadConfig();
  const warnings = [];
  const [localSkills, pluginSkills] = await Promise.all([
    scanLocalSkills(config.paths.skillsRoot, warnings),
    scanPluginSkills(config.paths.pluginCacheRoot, warnings)
  ]);
  const skills = [...localSkills, ...pluginSkills].sort((a, b) => a.displayName.localeCompare(b.displayName));
  const clusters = layoutSkills(skills);

  return {
    skills,
    clusters,
    warnings,
    localSkillCount: localSkills.length,
    pluginSkillCount: pluginSkills.length,
    config
  };
}
