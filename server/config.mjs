import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();

export const dataDir = path.join(projectRoot, '.skill-universe');
export const embeddingCachePath = path.join(dataDir, 'embeddings.json');
export const recommendationCachePath = path.join(dataDir, 'recommendations.json');
export const projectsDir = path.join(dataDir, 'projects');
export const skillGroupsDir = path.join(dataDir, 'skill-groups');
export const skillUsagePath = path.join(dataDir, 'skill-usage.json');

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function loadLocalEnv() {
  for (const fileName of ['.env', '.env.local']) {
    let text = '';
    try {
      text = await fs.readFile(path.join(projectRoot, fileName), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

function resolveHomePath(...segments) {
  return path.join(os.homedir(), ...segments);
}

export async function loadConfig() {
  await loadLocalEnv();
  const config = await readJsonIfExists(path.join(projectRoot, 'skill-universe.config.json'));
  const embedding = config.embedding ?? {};

  return {
    projectRoot,
    dataDir,
    paths: {
      skillsRoot:
        process.env.SKILL_UNIVERSE_SKILLS_ROOT ??
        config.paths?.skillsRoot ??
        resolveHomePath('.codex', 'skills'),
      pluginCacheRoot:
        process.env.SKILL_UNIVERSE_PLUGIN_CACHE_ROOT ??
        config.paths?.pluginCacheRoot ??
        resolveHomePath('.codex', 'plugins', 'cache')
    },
    embedding: {
      model:
        process.env.OPENAI_EMBEDDING_MODEL ??
        embedding.model ??
        'text-embedding-3-small',
      dimensions:
        Number(process.env.OPENAI_EMBEDDING_DIMENSIONS ?? embedding.dimensions ?? 512) || undefined,
      baseUrl:
        process.env.OPENAI_BASE_URL ??
        embedding.baseUrl ??
        'https://api.openai.com/v1'
    },
    privacy: {
      includeReferenceText: false,
      includeAssetText: false,
      ...(config.privacy ?? {})
    }
  };
}

export async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}
