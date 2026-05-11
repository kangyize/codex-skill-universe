import fs from 'node:fs/promises';
import { embeddingCachePath, ensureDataDir, loadConfig } from './config.mjs';
import { scanSkillsOnly } from './scanSkills.mjs';

export async function loadEmbeddingCache() {
  try {
    return JSON.parse(await fs.readFile(embeddingCachePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { model: '', dimensions: 0, items: [] };
    throw error;
  }
}

async function saveEmbeddingCache(cache) {
  await ensureDataDir();
  await fs.writeFile(embeddingCachePath, JSON.stringify(cache, null, 2), 'utf8');
}

export function summarizeSkillForEmbedding(skill) {
  return [
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    `headings: ${skill.headings.join(' | ')}`,
    `triggers: ${skill.triggerTerms.join(', ')}`,
    `domains: ${skill.domains.join(', ')}`,
    `resources: scripts=${skill.resources.scripts.join(',') || 'none'}; references=${skill.resources.references.join(',') || 'none'}; assets=${skill.resources.assets.join(',') || 'none'}; agents=${skill.resources.agents ? 'yes' : 'no'}`
  ]
    .join('\n')
    .slice(0, 6000);
}

function hasOpenAIKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  return Boolean(key && key !== 'sk-...' && key !== 'YOUR_API_KEY_HERE');
}

function tokenizeForLocalVector(text) {
  const lower = text.toLowerCase();
  const latin = lower
    .replace(/[`"'“”‘’()[\]{}:;,.!?/\\|<>]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && token.length <= 48);
  const cjk = [...lower.matchAll(/[\u3400-\u9fff]{2,}/g)]
    .flatMap((match) => {
      const value = match[0];
      const grams = [];
      for (let index = 0; index < value.length - 1; index += 1) {
        grams.push(value.slice(index, index + 2));
      }
      return grams;
    });

  return [...latin, ...cjk];
}

function hashToken(token, dimensions) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % dimensions;
}

function normalizeVector(vector) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm ? vector.map((value) => Number((value / norm).toFixed(8))) : vector;
}

function buildLocalEmbeddingItems(skills, dimensions, model) {
  const documents = skills.map((skill) => {
    const summary = summarizeSkillForEmbedding(skill);
    const tokens = tokenizeForLocalVector(summary);
    const counts = new Map();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    return { skill, counts };
  });

  const documentFrequency = new Map();
  for (const doc of documents) {
    for (const token of doc.counts.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  return documents.map(({ skill, counts }) => {
    const vector = new Array(dimensions).fill(0);
    for (const [token, count] of counts) {
      const df = documentFrequency.get(token) ?? 1;
      const idf = Math.log((skills.length + 1) / (df + 0.5)) + 1;
      const weight = (1 + Math.log(count)) * idf;
      vector[hashToken(token, dimensions)] += weight;
    }

    for (const domain of skill.domains) {
      vector[hashToken(`domain:${domain}`, dimensions)] += 2.4;
    }
    if (skill.source === 'plugin') vector[hashToken('source:plugin', dimensions)] += 0.8;
    if (skill.resources.scripts.length) vector[hashToken('resource:scripts', dimensions)] += 0.7;
    if (skill.resources.references.length) vector[hashToken('resource:references', dimensions)] += 0.7;
    if (skill.resources.assets.length) vector[hashToken('resource:assets', dimensions)] += 0.5;

    return {
      id: skill.id,
      name: skill.name,
      contentHash: skill.contentHash,
      vector: normalizeVector(vector),
      provider: 'local',
      model,
      dimensions,
      updatedAt: new Date().toISOString()
    };
  });
}

async function requestEmbeddings(inputs, config) {
  const apiKey = process.env.OPENAI_API_KEY.trim();

  const response = await fetch(`${config.embedding.baseUrl.replace(/\/$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.embedding.model,
      input: inputs,
      encoding_format: 'float',
      ...(config.embedding.dimensions ? { dimensions: config.embedding.dimensions } : {})
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message ?? `OpenAI embeddings request failed: ${response.status}`;
    throw new Error(detail);
  }

  return payload.data.map((entry) => entry.embedding);
}

export async function recomputeEmbeddings() {
  const scan = await scanSkillsOnly();
  const config = await loadConfig();
  const useOpenAI = hasOpenAIKey();
  const dimensions = config.embedding.dimensions ?? 512;
  const model = useOpenAI ? config.embedding.model : `local-semantic-v1-${dimensions}`;
  const previous = await loadEmbeddingCache();
  const previousItems = new Map(
    (previous.items ?? [])
      .filter((item) => item.model === model && item.dimensions === dimensions)
      .map((item) => [item.id, item])
  );

  if (!useOpenAI) {
    const items = buildLocalEmbeddingItems(scan.skills, dimensions, model);
    const changed = items.filter((item) => previousItems.get(item.id)?.contentHash !== item.contentHash).length;
    await saveEmbeddingCache({
      provider: 'local',
      model,
      dimensions,
      updatedAt: new Date().toISOString(),
      items: items.sort((a, b) => a.name.localeCompare(b.name))
    });

    const { buildSkillUniverse } = await import('./relations.mjs');
    const universe = await buildSkillUniverse();
    return {
      ...universe,
      recompute: {
        model,
        updated: changed,
        reused: scan.skills.length - changed
      }
    };
  }

  const items = [];
  const pending = [];

  for (const skill of scan.skills) {
    const cached = previousItems.get(skill.id);
    if (cached?.contentHash === skill.contentHash) {
      items.push(cached);
      continue;
    }
    pending.push(skill);
  }

  const batchSize = 64;
  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    const vectors = await requestEmbeddings(batch.map(summarizeSkillForEmbedding), config);
    vectors.forEach((vector, index) => {
      const skill = batch[index];
      items.push({
        id: skill.id,
        name: skill.name,
        contentHash: skill.contentHash,
        vector,
        provider: 'openai',
        model,
        dimensions,
        updatedAt: new Date().toISOString()
      });
    });
  }

  const cache = {
    provider: 'openai',
    model,
    dimensions,
    updatedAt: new Date().toISOString(),
    items: items.sort((a, b) => a.name.localeCompare(b.name))
  };

  await saveEmbeddingCache(cache);
  const { buildSkillUniverse } = await import('./relations.mjs');
  const universe = await buildSkillUniverse();

  return {
    ...universe,
    recompute: {
      model,
      updated: pending.length,
      reused: scan.skills.length - pending.length
    }
  };
}
