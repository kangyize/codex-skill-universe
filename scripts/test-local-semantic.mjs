import assert from 'node:assert/strict';
import { recomputeEmbeddings, loadEmbeddingCache } from '../server/embeddings.mjs';

delete process.env.OPENAI_API_KEY;

const universe = await recomputeEmbeddings();
const cache = await loadEmbeddingCache();

assert.equal(cache.provider, 'local', 'cache should use the no-key local provider');
assert.equal(universe.meta.relationMode, 'local-semantic', 'relations should use local semantic vectors');
assert.ok(cache.items.length >= 30, `expected local vectors, found ${cache.items.length}`);
assert.ok(universe.relations.length >= 20, `expected semantic relations, found ${universe.relations.length}`);

console.log(`local semantic ok: ${cache.items.length} vectors, ${universe.relations.length} relations`);
