import type { AiSkillAnalysis, AiStatus, DeepAuditReport, InstallCheckResult, InstallPlan, RecomputeResponse, ResearchMissionResponse, ResearchProject, SkillGroup, SkillGroupResponse, SkillGroupSuggestion, SkillRecommendationResponse, SkillUniverseResponse, SkillUsageResponse } from '../types';

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

export function fetchAiStatus() {
  return requestJson<AiStatus>('/api/ai/status');
}

export function analyzeSkillWithAi(skillId: string) {
  return requestJson<AiSkillAnalysis>('/api/ai/analyze-skill', {
    method: 'POST',
    body: JSON.stringify({ skillId })
  });
}

export function suggestSkillGroupWithAi(skillId: string, analysis?: AiSkillAnalysis | null, objective?: string) {
  return requestJson<SkillGroupSuggestion>('/api/ai/suggest-skill-group', {
    method: 'POST',
    body: JSON.stringify({ skillId, analysis, objective })
  });
}

export function fetchSkillGroups() {
  return requestJson<SkillGroupResponse>('/api/skill-groups');
}

export function saveSkillGroup(group: Partial<SkillGroup> | SkillGroupSuggestion) {
  return requestJson<SkillGroupResponse>('/api/skill-groups/save', {
    method: 'POST',
    body: JSON.stringify({ group })
  });
}

export function deleteSkillGroup(groupId: string) {
  return requestJson<SkillGroupResponse>('/api/skill-groups/delete', {
    method: 'POST',
    body: JSON.stringify({ groupId })
  });
}

export function fetchSkillUsage() {
  return requestJson<SkillUsageResponse>('/api/skill-usage');
}

export function recordSkillUse(skillId: string, event = 'manual') {
  return requestJson<SkillUsageResponse>('/api/skill-usage/record', {
    method: 'POST',
    body: JSON.stringify({ skillId, event })
  });
}

export function resetSkillUsage(skillId?: string) {
  return requestJson<SkillUsageResponse>('/api/skill-usage/reset', {
    method: 'POST',
    body: JSON.stringify({ skillId })
  });
}
