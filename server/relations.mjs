import { DOMAIN_DEFINITIONS, scanSkillsOnly } from './scanSkills.mjs';
import { loadEmbeddingCache } from './embeddings.mjs';

function tokenSet(skill) {
  const source = `${skill.name} ${skill.description} ${skill.headings.join(' ')} ${skill.triggerTerms.join(' ')}`;
  return new Set(
    source
      .toLowerCase()
      .replace(/[`"'“”‘’()[\]{}:;,.!?/\\|<>]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 3)
  );
}

function jaccard(a, b) {
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / union.size;
}

function cosine(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

function relationEvidence(a, b, mode) {
  const sharedDomains = a.domains.filter((domain) => b.domains.includes(domain));
  const domainLabel =
    DOMAIN_DEFINITIONS.find((domain) => domain.id === sharedDomains[0])?.label ?? '语义邻近';
  if (mode === 'embedding') return `${domainLabel}；OpenAI embedding 语义距离较近`;
  if (mode === 'local-semantic') return `${domainLabel}；本地语义向量距离较近`;
  return `${domainLabel}；描述、触发词或标题重叠`;
}

function buildSimilarityRelations(skills, cache) {
  const vectors = new Map((cache?.items ?? []).map((item) => [item.id, item.vector]));
  const hasVectors = skills.every((skill) => vectors.has(skill.id));
  const vectorMode = cache?.provider === 'openai' ? 'embedding' : 'local-semantic';
  const tokens = new Map(skills.map((skill) => [skill.id, tokenSet(skill)]));
  const relations = [];

  for (let i = 0; i < skills.length; i += 1) {
    for (let j = i + 1; j < skills.length; j += 1) {
      const a = skills[i];
      const b = skills[j];
      const sameDomain = a.domains.some((domain) => b.domains.includes(domain)) ? 0.08 : 0;
      const score = hasVectors
        ? cosine(vectors.get(a.id), vectors.get(b.id))
        : Math.min(0.98, jaccard(tokens.get(a.id), tokens.get(b.id)) * 2.1 + sameDomain);

      const threshold = hasVectors ? (vectorMode === 'embedding' ? 0.72 : 0.18) : 0.24;
      if (score < threshold) continue;

      relations.push({
        source: a.id,
        target: b.id,
        type: score > (hasVectors ? (vectorMode === 'embedding' ? 0.88 : 0.42) : 0.58) ? 'overlap' : 'similar',
        score: Number(score.toFixed(3)),
        evidence: relationEvidence(a, b, hasVectors ? vectorMode : 'lexical')
      });
    }
  }

  return {
    relations: relations.sort((a, b) => b.score - a.score).slice(0, 120),
    relationMode: hasVectors ? vectorMode : 'lexical'
  };
}

const MISSION_PATTERNS = [
  {
    id: 'literature-to-paper',
    title: '文献到论文初稿航线',
    names: ['paper-lookup', 'literature-review', 'scientific-writing', 'docx'],
    fallbackDomains: ['literature', 'paper-writing', 'documents'],
    rationale: '先检索论文，再形成综述，随后写成论文段落，最后导出为可编辑文档。'
  },
  {
    id: 'pdf-to-review',
    title: 'PDF 解析到审稿航线',
    names: ['extract-pdf-markdown', 'paper-self-review', 'peer-review', 'review-response'],
    fallbackDomains: ['documents', 'paper-writing'],
    rationale: '先把论文材料结构化，再检查完整性，最后形成审稿意见或回复策略。'
  },
  {
    id: 'experiment-to-report',
    title: '实验结果到报告航线',
    names: ['results-analysis', 'statistical-analysis', 'results-report', 'scientific-writing'],
    fallbackDomains: ['analysis', 'paper-writing'],
    rationale: '先做统计和结果解释，再压缩成决策报告或论文结果段。'
  },
  {
    id: 'research-startup',
    title: '研究启动航线',
    names: ['research-ideation', 'academic-deep-research', 'paper-lookup', 'citation-management'],
    fallbackDomains: ['research', 'literature'],
    rationale: '从选题和 gap 出发，进入深度调研，再补齐论文与引用证据。'
  }
];

function findSkillByName(skills, name) {
  return skills.find((skill) => skill.name.toLowerCase().replace(/^"|"$/g, '') === name);
}

function buildMissionInsights(skills) {
  const insights = [];

  for (const pattern of MISSION_PATTERNS) {
    const exact = pattern.names.map((name) => findSkillByName(skills, name)).filter(Boolean);
    let selected = exact;

    if (selected.length < 3) {
      const fallback = skills
        .filter((skill) => skill.domains.some((domain) => pattern.fallbackDomains.includes(domain)))
        .slice(0, 4);
      selected = [...new Map([...exact, ...fallback].map((skill) => [skill.id, skill])).values()];
    }

    if (selected.length >= 3) {
      insights.push({
        id: pattern.id,
        type: 'mission',
        title: pattern.title,
        skillIds: selected.slice(0, 5).map((skill) => skill.id),
        rationale: pattern.rationale
      });
    }
  }

  return insights;
}

function buildOverlapInsights(relations, skills) {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  return relations
    .filter((relation) => relation.type === 'overlap')
    .slice(0, 6)
    .map((relation, index) => {
      const a = byId.get(relation.source);
      const b = byId.get(relation.target);
      return {
        id: `overlap-${index}`,
        type: 'overlap',
        title: `${a?.displayName ?? 'Skill'} 与 ${b?.displayName ?? 'Skill'} 功能接近`,
        skillIds: [relation.source, relation.target],
        rationale: relation.evidence
      };
    });
}

function buildClusterInsights(clusters) {
  return clusters
    .filter((cluster) => cluster.skillIds.length >= 5)
    .slice(0, 5)
    .map((cluster) => ({
      id: `cluster-${cluster.id}`,
      type: 'cluster',
      title: `${cluster.label} 是高密度星区`,
      skillIds: cluster.skillIds.slice(0, 6),
      rationale: `该星区聚集了 ${cluster.skillIds.length} 个 skill，适合做专题工作流整理。`
    }));
}

export async function buildSkillUniverse() {
  const scan = await scanSkillsOnly();
  const cache = await loadEmbeddingCache();
  const { relations, relationMode } = buildSimilarityRelations(scan.skills, cache);
  const insights = [
    ...buildMissionInsights(scan.skills),
    ...buildOverlapInsights(relations, scan.skills),
    ...buildClusterInsights(scan.clusters)
  ];

  return {
    generatedAt: new Date().toISOString(),
    skills: scan.skills,
    clusters: scan.clusters,
    relations,
    insights,
    meta: {
      localSkillCount: scan.localSkillCount,
      pluginSkillCount: scan.pluginSkillCount,
      embeddingModel: scan.config.embedding.model,
      semanticEngine:
        relationMode === 'embedding'
          ? 'OpenAI Embeddings'
          : relationMode === 'local-semantic'
            ? 'Local semantic vectors'
            : 'Lexical rules',
      hasEmbeddingCache: Boolean(cache?.items?.length),
      apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
      relationMode,
      warnings: scan.warnings
    }
  };
}
