import assert from 'node:assert/strict';
import { summarizeSkillForEmbedding } from '../server/embeddings.mjs';

const summary = summarizeSkillForEmbedding({
  name: 'private-skill',
  description: 'A concise public purpose description.',
  headings: ['Workflow', 'Validation'],
  triggerTerms: ['private', 'skill', 'workflow'],
  domains: ['tools'],
  resources: {
    scripts: ['scan.js'],
    references: ['secret-reference.md'],
    assets: ['private-template.docx'],
    agents: true
  },
  path: 'C:\\Users\\example\\.codex\\skills\\private-skill'
});

assert.ok(summary.includes('secret-reference.md'), 'resource names should be included');
assert.ok(!summary.includes('C:\\Users'), 'absolute paths must not be sent to embeddings');
assert.ok(!summary.includes('OPENAI_API_KEY'), 'environment secrets must not be sent to embeddings');
assert.ok(!summary.includes('full reference body'), 'reference bodies must not be sent to embeddings');

console.log('privacy summary ok');
