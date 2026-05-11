export type SkillSourceType = 'local' | 'plugin';

export interface SkillResources {
  scripts: string[];
  references: string[];
  assets: string[];
  agents: boolean;
}

export interface SkillHealth {
  score: number;
  level: 'good' | 'watch' | 'risk';
  issues: string[];
  suggestions: string[];
  staleDays: number;
}

export interface SkillNode {
  id: string;
  name: string;
  displayName: string;
  source: SkillSourceType;
  sourceLabel: string;
  path: string;
  description: string;
  headings: string[];
  triggerTerms: string[];
  resources: SkillResources;
  domains: string[];
  clusterId: string;
  position: [number, number, number];
  color: string;
  radius: number;
  updatedAt: string;
  contentHash: string;
  health: SkillHealth;
}

export interface SkillRelation {
  source: string;
  target: string;
  type: 'similar' | 'complement' | 'overlap';
  score: number;
  evidence: string;
}

export interface Cluster {
  id: string;
  label: string;
  color: string;
  skillIds: string[];
  position: [number, number, number];
  description: string;
}

export interface Insight {
  id: string;
  type: 'mission' | 'overlap' | 'gap' | 'cluster';
  title: string;
  skillIds: string[];
  rationale: string;
}

export interface SkillUniverseResponse {
  generatedAt: string;
  skills: SkillNode[];
  clusters: Cluster[];
  relations: SkillRelation[];
  insights: Insight[];
  meta: {
    localSkillCount: number;
    pluginSkillCount: number;
    embeddingModel: string;
    semanticEngine: string;
    hasEmbeddingCache: boolean;
    apiKeyConfigured: boolean;
    relationMode: 'embedding' | 'local-semantic' | 'lexical';
    warnings: string[];
  };
}

export interface RecomputeResponse extends SkillUniverseResponse {
  recompute: {
    model: string;
    updated: number;
    reused: number;
  };
}

export interface SkillChangeNotice {
  id: string;
  reason: string;
  detectedAt: string;
  addedCount: number;
  removedCount: number;
  changedCount: number;
  totalBefore: number;
  totalAfter: number;
  addedNames: string[];
  removedNames: string[];
  changedNames: string[];
  comparison?: SkillChangeComparison;
}

export interface SkillChangeComparison {
  newSkillIds: string[];
  filledGapIds: string[];
  similarSkillIds: string[];
  workflowIds: string[];
  summary: string;
}

export interface SkillGap {
  id: string;
  label: string;
  description: string;
  coverage: number;
  priority: number;
  evidence: string;
  queryTerms: string[];
  bridgeSkillIds: string[];
}

export interface SkillCandidate {
  slug: string;
  packageSlug: string;
  author: string;
  name: string;
  summary: string;
  source: string;
  sourceUrl: string;
  downloads: number;
  stars: number;
  sourceSecurity: string;
  requiresApiKey: boolean;
  verified: boolean;
  duplicateOf: string | null;
  gapId: string;
  gapLabel: string;
  query: string;
  recommendationScore: number;
  rationale: string[];
  complements: Array<{
    id: string;
    name: string;
    purpose: string;
  }>;
  risks: string[];
  audit: SkillCandidateAudit;
}

export interface SkillCandidateAudit {
  verdict: 'recommend' | 'caution' | 'manual-review';
  reasons: string[];
  riskLevel: 'low' | 'medium' | 'high';
  duplicateSkillIds: string[];
  workflowIds: string[];
}

export interface InstallPlan {
  slug: string;
  title: string;
  sourceUrl: string;
  commands: string[];
  auditSteps: string[];
  verificationSteps: string[];
  warnings: string[];
}

export interface InstallCheckResult {
  slug: string;
  packageSlug: string;
  checkedAt: string;
  installed: boolean;
  matches: Array<{
    label: string;
    root: string;
    skillPath: string;
    skillFile: string;
    exists: boolean;
  }>;
  nextAction: string;
}

export type DeepAuditFindingStatus = 'pass' | 'watch' | 'risk' | 'unknown';

export interface DeepAuditFinding {
  label: string;
  status: DeepAuditFindingStatus;
  detail: string;
}

export interface DeepAuditReport {
  slug: string;
  title: string;
  sourceUrl: string;
  checkedAt: string;
  fetched: boolean;
  verdict: 'recommend' | 'caution' | 'manual-review';
  riskLevel: 'low' | 'medium' | 'high';
  findings: DeepAuditFinding[];
  duplicateSkillIds: string[];
  workflowIds: string[];
  summary: string;
  warnings: string[];
}

export interface SkillRecommendationResponse {
  generatedAt: string;
  source: 'clawhub' | 'offline';
  status: 'online' | 'offline';
  fromCache: boolean;
  universeFingerprint: string;
  gaps: SkillGap[];
  candidates: SkillCandidate[];
  meta: {
    searchedQueries: number;
    verifiedCandidates: number;
    cacheTtlHours: number;
    privacy: string;
    warnings: string[];
  };
}

export type LayoutPreset = 'research' | 'install' | 'minimal' | 'fullscreen';
export type PerformanceMode = 'quality' | 'balanced' | 'battery';
export type SkillUniversePanelId = 'clusters' | 'missions' | 'recommendations' | 'details' | 'workflow' | 'installConsole' | 'timeline' | 'researchMission' | 'skillGroups';

export interface PanelPosition {
  x: number;
  y: number;
}

export interface SkillUniverseLayoutState {
  preset: LayoutPreset;
  performanceMode: PerformanceMode;
  activeSnapshotId?: string;
  visible: {
    clusters: boolean;
    missions: boolean;
    recommendations: boolean;
    details: boolean;
    workflow: boolean;
    installConsole: boolean;
    timeline: boolean;
    researchMission: boolean;
    skillGroups: boolean;
  };
  pinned: {
    clusters: boolean;
    missions: boolean;
    recommendations: boolean;
    details: boolean;
    workflow: boolean;
    installConsole: boolean;
    timeline: boolean;
    researchMission: boolean;
    skillGroups: boolean;
  };
  positions: Partial<Record<SkillUniversePanelId, PanelPosition>>;
  minimized: Partial<Record<SkillUniversePanelId, boolean>>;
  zOrder: Partial<Record<SkillUniversePanelId, number>>;
  lastVisible?: SkillUniverseLayoutState['visible'];
}

export type SkillTagMap = Record<string, string[]>;

export interface LayoutSnapshot {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  layoutState: SkillUniverseLayoutState;
}

export interface CommandPaletteResult {
  id: string;
  type: 'skill' | 'candidate' | 'cluster' | 'mission' | 'tag' | 'project';
  title: string;
  subtitle: string;
  actionLabel: string;
}

export interface SkillUniverseTimelineEvent {
  id: string;
  type: 'skill-change' | 'refresh' | 'semantic' | 'recommendation' | 'install-plan' | 'install-check' | 'layout' | 'deep-audit' | 'project' | 'ai-analysis' | 'skill-group';
  title: string;
  detail: string;
  createdAt: string;
}

export interface AiStatus {
  enabled: boolean;
  provider: 'openai';
  model: string;
  baseUrl: string;
  privacy: string;
}

export interface AiSkillIssue {
  severity: 'low' | 'medium' | 'high';
  title: string;
  detail: string;
}

export interface AiSkillFix {
  title: string;
  detail: string;
  effort: 'small' | 'medium' | 'large';
}

export interface AiSkillAnalysis {
  skillId: string;
  title: string;
  summary: string;
  score: number;
  verdict: 'good' | 'watch' | 'risk';
  issues: AiSkillIssue[];
  fixes: AiSkillFix[];
  suggestedDescription: string;
  suggestedHeadings: string[];
  triggerTerms: string[];
  securityNotes: string[];
  privacyNotes: string[];
  groupSeed: {
    name: string;
    purpose: string;
    defaultPrompt: string;
  };
  generatedAt: string;
  model: string;
  privacy: string;
}

export interface SkillGroupMember {
  skillId: string;
  role: string;
  order: number;
  reason: string;
}

export interface SkillGroup {
  id: string;
  name: string;
  purpose: string;
  members: SkillGroupMember[];
  defaultPrompt: string;
  workflowSteps: string[];
  createdAt: string;
  updatedAt: string;
  warnings?: string[];
}

export interface SkillGroupSuggestion {
  name: string;
  purpose: string;
  members: SkillGroupMember[];
  defaultPrompt: string;
  workflowSteps: string[];
  warnings: string[];
  generatedAt: string;
  model: string;
}

export interface SkillGroupResponse {
  generatedAt: string;
  groups: SkillGroup[];
  meta: {
    storage: string;
  };
}

export type ResearchStage = 'ideation' | 'novelty' | 'experiment' | 'analysis' | 'writing' | 'submission' | 'rebuttal';

export interface ResearchClaim {
  id: string;
  text: string;
  evidence: string;
  status: 'supported' | 'partial' | 'missing' | 'risk';
  skillIds: string[];
  notes: string;
}

export interface ResearchProject {
  id: string;
  name: string;
  direction: string;
  targetVenue: string;
  stage: ResearchStage;
  keywords: string[];
  papers: string[];
  experimentPath: string;
  currentQuestion: string;
  claims: ResearchClaim[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchRouteStep {
  skillId: string;
  name: string;
  purpose: string;
  health: number;
}

export interface ResearchRoute {
  id: string;
  title: string;
  rationale: string;
  skillIds: string[];
  steps: ResearchRouteStep[];
  completeness: number;
}

export interface ResearchProjectGap {
  id: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  reason: string;
  action: string;
  skillIds: string[];
}

export interface ResearchNextAction {
  id: string;
  title: string;
  detail: string;
  priority: number;
  skillIds: string[];
}

export interface ResearchMissionAnalysis {
  projectId: string;
  stageLabel: string;
  routes: ResearchRoute[];
  gaps: ResearchProjectGap[];
  nextActions: ResearchNextAction[];
  evidence: ResearchClaim[];
  summary: string;
}

export interface ResearchMissionResponse {
  generatedAt: string;
  projects: ResearchProject[];
  activeProjectId: string | null;
  activeProject: ResearchProject | null;
  analysis: ResearchMissionAnalysis | null;
  stageOptions: Array<{ id: ResearchStage; label: string }>;
  meta: {
    storage: string;
    apiKeyRequired: boolean;
    privacy: string;
  };
}
