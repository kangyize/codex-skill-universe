import type { DeepAuditReport, InstallCheckResult, InstallPlan, RecomputeResponse, ResearchMissionResponse, ResearchProject, SkillRecommendationResponse, SkillUniverseResponse } from '../types';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export function fetchSkills() {
  return requestJson<SkillUniverseResponse>('/api/skills');
}

export function refreshSkills() {
  return requestJson<SkillUniverseResponse>('/api/refresh', { method: 'POST' });
}

export function recomputeEmbeddings() {
  return requestJson<RecomputeResponse>('/api/recompute-embeddings', {
    method: 'POST'
  });
}

export function fetchRecommendations() {
  return requestJson<SkillRecommendationResponse>('/api/recommendations');
}

export function refreshRecommendations() {
  return requestJson<SkillRecommendationResponse>('/api/recommendations/refresh', {
    method: 'POST'
  });
}

export function createInstallPlan(slug: string) {
  return requestJson<InstallPlan>('/api/recommendations/install-plan', {
    method: 'POST',
    body: JSON.stringify({ slug })
  });
}

export function checkInstallStatus(slug: string) {
  return requestJson<InstallCheckResult>('/api/recommendations/check-install', {
    method: 'POST',
    body: JSON.stringify({ slug })
  });
}

export function deepAuditCandidate(slug: string) {
  return requestJson<DeepAuditReport>('/api/recommendations/deep-audit', {
    method: 'POST',
    body: JSON.stringify({ slug })
  });
}

export function fetchResearchProjects() {
  return requestJson<ResearchMissionResponse>('/api/research-projects');
}

export function saveResearchProject(project: Partial<ResearchProject>) {
  return requestJson<ResearchMissionResponse>('/api/research-projects/save', {
    method: 'POST',
    body: JSON.stringify({ project })
  });
}

export function deleteResearchProject(projectId: string) {
  return requestJson<ResearchMissionResponse>('/api/research-projects/delete', {
    method: 'POST',
    body: JSON.stringify({ projectId })
  });
}

export function setActiveResearchProject(projectId: string) {
  return requestJson<ResearchMissionResponse>('/api/research-projects/active', {
    method: 'POST',
    body: JSON.stringify({ projectId })
  });
}
