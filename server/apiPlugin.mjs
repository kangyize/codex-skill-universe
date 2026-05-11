import { recomputeEmbeddings } from './embeddings.mjs';
import { analyzeSkill, getAiStatus, suggestSkillGroup } from './aiAnalysis.mjs';
import { buildDeepAudit, buildInstallPlan, buildSkillRecommendations, checkInstallStatus } from './recommendations.mjs';
import { deleteResearchProject, listResearchProjects, saveResearchProject, setActiveResearchProject } from './researchProjects.mjs';
import { buildSkillUniverse } from './relations.mjs';
import { deleteSkillGroup, listSkillGroups, saveSkillGroup } from './skillGroups.mjs';
import { stopSkillMonitor, subscribeSkillEvents } from './skillWatcher.mjs';

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  return JSON.parse(text);
}

async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/skills') {
    sendJson(res, 200, await buildSkillUniverse());
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/refresh') {
    sendJson(res, 200, await buildSkillUniverse());
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/recompute-embeddings') {
    sendJson(res, 200, await recomputeEmbeddings());
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/recommendations') {
    sendJson(res, 200, await buildSkillRecommendations());
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/recommendations/refresh') {
    sendJson(res, 200, await buildSkillRecommendations({ refresh: true }));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/recommendations/install-plan') {
    const body = await readJsonBody(req);
    sendJson(res, 200, await buildInstallPlan(body.slug));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/recommendations/check-install') {
    const body = await readJsonBody(req);
    sendJson(res, 200, await checkInstallStatus(body.slug));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/recommendations/deep-audit') {
    const body = await readJsonBody(req);
    sendJson(res, 200, await buildDeepAudit(body.slug));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/research-projects') {
    sendJson(res, 200, await listResearchProjects());
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/research-projects/save') {
    const body = await readJsonBody(req);
    sendJson(res, 200, await saveResearchProject(body.project));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/research-projects/delete') {
    const body = await readJsonBody(req);
    sendJson(res, 200, await deleteResearchProject(body.projectId));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/research-projects/active') {
    const body = await readJsonBody(req);
    sendJson(res, 200, await setActiveResearchProject(body.projectId));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/ai/status') {
    sendJson(res, 200, await getAiStatus());
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/analyze-skill') {
    const body = await readJsonBody(req);
    sendJson(res, 200, await analyzeSkill(body.skillId));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/suggest-skill-group') {
    const body = await readJsonBody(req);
    sendJson(res, 200, await suggestSkillGroup(body));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/skill-groups') {
    sendJson(res, 200, await listSkillGroups());
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/skill-groups/save') {
    const body = await readJsonBody(req);
    sendJson(res, 200, await saveSkillGroup(body.group));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/skill-groups/delete') {
    const body = await readJsonBody(req);
    sendJson(res, 200, await deleteSkillGroup(body.groupId));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/skill-events') {
    await subscribeSkillEvents(req, res);
    return true;
  }

  return false;
}

export function skillApiPlugin() {
  return {
    name: 'skill-universe-api',
    configureServer(server) {
      server.httpServer?.once('close', stopSkillMonitor);
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next();
          return;
        }

        try {
          const handled = await handleApi(req, res);
          if (!handled) sendJson(res, 404, { error: 'API route not found' });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });
    }
  };
}
