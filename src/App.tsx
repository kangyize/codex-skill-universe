import {
  Activity,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  History,
  Layers3,
  LayoutDashboard,
  Minus,
  Move,
  Orbit,
  Pin,
  PinOff,
  Play,
  RefreshCw,
  Route,
  Satellite,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Telescope
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react';
import {
  checkInstallStatus,
  createInstallPlan,
  deepAuditCandidate,
  deleteResearchProject,
  fetchRecommendations,
  fetchResearchProjects,
  fetchSkills,
  recomputeEmbeddings,
  refreshRecommendations,
  refreshSkills,
  saveResearchProject,
  setActiveResearchProject
} from './lib/api';
import { SkillUniverse } from './components/SkillUniverse';
import type {
  Cluster,
  DeepAuditReport,
  Insight,
  InstallCheckResult,
  InstallPlan,
  LayoutPreset,
  LayoutSnapshot,
  PanelPosition,
  PerformanceMode,
  ResearchMissionResponse,
  ResearchProject,
  ResearchStage,
  SkillCandidate,
  SkillCandidateAudit,
  SkillChangeNotice,
  SkillNode,
  SkillRecommendationResponse,
  SkillRelation,
  SkillTagMap,
  SkillUniverseLayoutState,
  SkillUniverseResponse,
  SkillUniverseTimelineEvent
} from './types';

type PanelId = keyof SkillUniverseLayoutState['visible'];
type RecommendationSort = 'score' | 'stars' | 'downloads' | 'security';
type RecommendationSecurityFilter = 'all' | 'clean' | 'suspicious' | 'unknown';
type TriStateFilter = 'all' | 'yes' | 'no';

const LAYOUT_STORAGE_KEY = 'skill-universe.layout.v1';
const TIMELINE_STORAGE_KEY = 'skill-universe.timeline.v1';
const TAG_STORAGE_KEY = 'skill-universe.tags.v1';
const SNAPSHOT_STORAGE_KEY = 'skill-universe.layoutSnapshots.v1';
const DEFAULT_TAGS = ['常用', '待审查', '实验相关', '论文工具链'];
const PANEL_LABELS: Record<PanelId, string> = {
  clusters: '星区',
  missions: '航线',
  recommendations: '推荐',
  details: '详情',
  workflow: '工作流',
  installConsole: '安装方案',
  timeline: '时间轴',
  researchMission: '科研任务'
};

const PERFORMANCE_LABELS: Record<PerformanceMode, string> = {
  quality: '高画质',
  balanced: '平衡',
  battery: '省电'
};

const DEFAULT_LAYOUT: SkillUniverseLayoutState = {
  preset: 'research',
  performanceMode: 'balanced',
  visible: {
    clusters: true,
    missions: true,
    recommendations: false,
    details: true,
    workflow: true,
    installConsole: false,
    timeline: false,
    researchMission: false
  },
  pinned: {
    clusters: true,
    missions: true,
    recommendations: true,
    details: true,
    workflow: false,
    installConsole: false,
    timeline: true,
    researchMission: false
  },
  positions: {},
  minimized: {},
  zOrder: {}
};

const PRESET_LABELS: Record<LayoutPreset, string> = {
  research: '研究模式',
  install: '安装模式',
  minimal: '极简星域',
  fullscreen: '全屏探索'
};

const PRESET_LAYOUTS: Record<LayoutPreset, SkillUniverseLayoutState> = {
  research: DEFAULT_LAYOUT,
  install: {
    preset: 'install',
    performanceMode: 'balanced',
    visible: {
      clusters: false,
      missions: false,
      recommendations: true,
      details: true,
      workflow: false,
      installConsole: true,
      timeline: false,
      researchMission: true
    },
    pinned: {
      clusters: true,
      missions: true,
      recommendations: false,
      details: true,
      workflow: false,
      installConsole: false,
      timeline: true,
      researchMission: false
    },
    positions: {},
    minimized: {},
    zOrder: {}
  },
  minimal: {
    preset: 'minimal',
    performanceMode: 'balanced',
    visible: {
      clusters: false,
      missions: false,
      recommendations: false,
      details: false,
      workflow: false,
      installConsole: false,
      timeline: false,
      researchMission: false
    },
    pinned: DEFAULT_LAYOUT.pinned,
    positions: {},
    minimized: {},
    zOrder: {}
  },
  fullscreen: {
    preset: 'fullscreen',
    performanceMode: 'balanced',
    visible: {
      clusters: false,
      missions: false,
      recommendations: false,
      details: false,
      workflow: false,
      installConsole: false,
      timeline: false,
      researchMission: false
    },
    pinned: DEFAULT_LAYOUT.pinned,
    positions: {},
    minimized: {},
    zOrder: {}
  }
};

function mergeLayout(value: Partial<SkillUniverseLayoutState> | null): SkillUniverseLayoutState {
  return {
    preset: value?.preset ?? DEFAULT_LAYOUT.preset,
    performanceMode: value?.performanceMode ?? DEFAULT_LAYOUT.performanceMode,
    activeSnapshotId: value?.activeSnapshotId,
    visible: { ...DEFAULT_LAYOUT.visible, ...(value?.visible ?? {}) },
    pinned: { ...DEFAULT_LAYOUT.pinned, ...(value?.pinned ?? {}) },
    positions: value?.positions ?? {},
    minimized: value?.minimized ?? {},
    zOrder: value?.zOrder ?? {},
    lastVisible: value?.lastVisible
  };
}

function loadLayoutState() {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    return raw ? mergeLayout(JSON.parse(raw) as Partial<SkillUniverseLayoutState>) : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function loadTimeline() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TIMELINE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 200) as SkillUniverseTimelineEvent[] : [];
  } catch {
    return [];
  }
}

function loadSkillTags(): SkillTagMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(TAG_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as SkillTagMap : {};
  } catch {
    return {};
  }
}

function loadLayoutSnapshots(): LayoutSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((snapshot) => ({
        ...snapshot,
        layoutState: mergeLayout(snapshot.layoutState)
      })).slice(0, 24) as LayoutSnapshot[]
      : [];
  } catch {
    return [];
  }
}

function frontPanelZOrder(zOrder: Partial<Record<PanelId, number>>, panel: PanelId) {
  const panels = Object.keys(PANEL_LABELS) as PanelId[];
  const ordered = panels
    .filter((item) => item !== panel && Number.isFinite(zOrder[item]))
    .sort((left, right) => (zOrder[left] ?? 0) - (zOrder[right] ?? 0));
  const rebased: Partial<Record<PanelId, number>> = {};
  ordered.forEach((item, index) => {
    rebased[item] = 21 + index;
  });
  rebased[panel] = 21 + ordered.length;
  return rebased;
}

function allPanelsVisible(value: boolean): SkillUniverseLayoutState['visible'] {
  return {
    clusters: value,
    missions: value,
    recommendations: value,
    details: value,
    workflow: value,
    installConsole: value,
    timeline: value,
    researchMission: value
  };
}

function panelStyle(position?: PanelPosition, transform = false, zIndex?: number): CSSProperties | undefined {
  if (!position && !zIndex) return undefined;
  return {
    ...(position ? {
    left: position.x,
    top: position.y,
    right: 'auto',
    bottom: 'auto',
    transform: transform ? 'none' : undefined
    } : {}),
    zIndex
  };
}

function VirtualList<T,>({
  items,
  itemHeight,
  height,
  className,
  empty,
  renderItem
}: {
  items: T[];
  itemHeight: number;
  height: number;
  className: string;
  empty: ReactNode;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const overscan = 4;
  const visibleCount = Math.ceil(height / itemHeight) + overscan * 2;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(items.length, startIndex + visibleCount);
  const visibleItems = items.slice(startIndex, endIndex);

  if (!items.length) return <>{empty}</>;

  return (
    <div
      className={className}
      style={{ height }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        {visibleItems.map((item, offset) => {
          const index = startIndex + offset;
          return (
            <div
              key={index}
              className="virtual-list-row"
              style={{
                height: itemHeight,
                position: 'absolute',
                top: index * itemHeight,
                left: 0,
                right: 0
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function startPanelDrag(
  event: ReactPointerEvent<HTMLElement>,
  panelRef: React.RefObject<HTMLElement | null>,
  _pinned: boolean,
  onPositionChange: (position: PanelPosition) => void
) {
  if ((event.target as HTMLElement).closest('button,a,input,select')) return;
  const panel = panelRef.current;
  if (!panel) return;
  const rect = panel.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;
  let animationFrame = 0;
  let latestPosition: PanelPosition | null = null;

  function flushPosition() {
    animationFrame = 0;
    if (latestPosition) onPositionChange(latestPosition);
  }

  function move(moveEvent: PointerEvent) {
    const nextX = Math.max(10, Math.min(window.innerWidth - rect.width - 10, moveEvent.clientX - offsetX));
    const nextY = Math.max(10, Math.min(window.innerHeight - rect.height - 10, moveEvent.clientY - offsetY));
    latestPosition = { x: nextX, y: nextY };
    if (!animationFrame) animationFrame = window.requestAnimationFrame(flushPosition);
  }

  function stop() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
    if (latestPosition) onPositionChange(latestPosition);
  }

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop, { once: true });
}

function resourceCount(skill: SkillNode) {
  return (
    skill.resources.scripts.length +
    skill.resources.references.length +
    skill.resources.assets.length +
    (skill.resources.agents ? 1 : 0)
  );
}

function clusterName(clusters: Cluster[], clusterId: string) {
  return clusters.find((cluster) => cluster.id === clusterId)?.label ?? clusterId;
}

function relationScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

function skillTokenList(skill: SkillNode) {
  return [
    skill.name,
    skill.displayName,
    skill.description,
    ...skill.domains,
    ...skill.triggerTerms,
    ...skill.headings
  ]
    .join(' ')
    .toLowerCase()
    .replace(/[`"'()[\]{}:;,.!?/\\|<>]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function sharedTerms(a: SkillNode, b: SkillNode) {
  const right = new Set(skillTokenList(b));
  return [...new Set(skillTokenList(a).filter((token) => right.has(token)))].slice(0, 8);
}

function relationTypeLabel(type: SkillRelation['type']) {
  if (type === 'overlap') return '可能重复';
  if (type === 'complement') return '互补组合';
  return '相似技能';
}

function relationModeLabel(mode: SkillUniverseResponse['meta']['relationMode']) {
  if (mode === 'embedding') return 'OpenAI 语义';
  if (mode === 'local-semantic') return '本地语义';
  return '本地规则';
}

function sortRelationsForSkill(skillId: string, relations: SkillRelation[]) {
  return relations
    .filter((relation) => relation.source === skillId || relation.target === skillId)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function skillNames(ids: string[], skillsById: Map<string, SkillNode>) {
  return ids
    .map((id) => skillsById.get(id)?.displayName)
    .filter(Boolean)
    .join(' -> ');
}

function changeNoticeTitle(notice: SkillChangeNotice) {
  if (notice.addedCount > 0) return `发现 ${notice.addedCount} 个新 skill`;
  if (notice.removedCount > 0) return `检测到 ${notice.removedCount} 个 skill 已移除`;
  if (notice.changedCount > 0) return `检测到 ${notice.changedCount} 个 skill 已更新`;
  return 'skill 目录发生变化';
}

function changeNoticeDetail(notice: SkillChangeNotice) {
  const parts = [];
  if (notice.addedNames.length) parts.push(`新增：${notice.addedNames.join('、')}`);
  if (notice.changedNames.length) parts.push(`修改：${notice.changedNames.join('、')}`);
  if (notice.removedNames.length) parts.push(`移除：${notice.removedNames.join('、')}`);
  return parts.join('；') || `当前 ${notice.totalAfter} 个 skill`;
}

function stepPurpose(insight: Insight, skill: SkillNode, index: number) {
  const missionPurposes: Record<string, string[]> = {
    'literature-to-paper': [
      '检索论文、DOI、作者、开放获取入口和引用线索',
      '把候选论文整理成主题综述、证据链和可复用参考列表',
      '把综述材料转成论文式段落、章节框架或方法表述',
      '将草稿整理为可编辑文档，便于继续修改、排版和提交'
    ],
    'pdf-to-review': [
      '把 PDF 或扫描材料解析成 Markdown/结构化文本',
      '检查论文结构、实验报告、引用和提交前完整性',
      '形成正式审稿意见，指出方法、证据和写作问题',
      '把审稿意见转为回复策略、逐条回应和修订动作'
    ],
    'experiment-to-report': [
      '读取实验结果，做对比、消融、显著性和图表分析',
      '选择合适统计检验，确认假设、效应量和报告口径',
      '把统计结论压缩为决策报告或实验复盘',
      '将结果解释写成论文 Results/Discussion 段落'
    ],
    'research-startup': [
      '从想法、5W1H 和 gap 出发，形成可研究问题',
      '围绕问题做深度调研，标注证据质量和分歧',
      '补齐核心论文、作者、开放获取入口和引用链',
      '生成准确 BibTeX，清洗引用元数据并校验参考文献'
    ]
  };

  const known = missionPurposes[insight.id]?.[index];
  if (known) return known;

  if (skill.domains.includes('literature')) return '检索、筛选或核验学术证据，为后续步骤提供可信输入';
  if (skill.domains.includes('documents')) return '解析、转换或生成文档材料，让信息进入可编辑状态';
  if (skill.domains.includes('paper-writing')) return '把材料转成论文、审稿、回复或学术表达';
  if (skill.domains.includes('analysis')) return '处理实验数据、统计比较或解释结果';
  if (skill.domains.includes('research')) return '澄清研究问题、路线和证据边界';
  if (skill.domains.includes('tools')) return '执行工具化动作，衔接 Codex、插件或自动化流程';
  return '完成该航线中的专门处理步骤';
}

function stepOutcome(insight: Insight, index: number, total: number) {
  if (index === 0) return '输入被收集并校准';
  if (index === total - 1) return '形成可交付结果';
  if (insight.type === 'overlap') return '帮助判断是否保留、合并或分工使用';
  if (insight.type === 'cluster') return '形成该星区的专题工作口';
  return '产出可传给下一步的中间材料';
}

function workflowSteps(insight: Insight | undefined, skillsById: Map<string, SkillNode>) {
  if (!insight) return [];
  const skills = insight.skillIds.map((id) => skillsById.get(id)).filter((skill): skill is SkillNode => Boolean(skill));
  return skills.map((skill, index) => ({
    skill,
    purpose: stepPurpose(insight, skill, index),
    outcome: stepOutcome(insight, index, skills.length)
  }));
}

function workflowCompleteness(steps: Array<{ skill: SkillNode }>) {
  const domainText = steps.flatMap((step) => step.skill.domains).join(' ');
  const checks = [
    { id: 'literature', label: '检索', ok: /literature|research|academic/.test(domainText) },
    { id: 'analysis', label: '分析', ok: /analysis|statistics/.test(domainText) },
    { id: 'writing', label: '写作', ok: /paper-writing|writing/.test(domainText) },
    { id: 'export', label: '导出', ok: /documents|pdf|tools/.test(domainText) }
  ];
  const covered = checks.filter((item) => item.ok);
  const missing = checks.filter((item) => !item.ok);
  return {
    percent: Math.round((covered.length / checks.length) * 100),
    covered,
    missing
  };
}

function emptyResearchProject(): Partial<ResearchProject> {
  return {
    name: '',
    direction: '',
    targetVenue: '',
    stage: 'ideation',
    keywords: [],
    papers: [],
    experimentPath: '',
    currentQuestion: '',
    claims: [],
    notes: ''
  };
}

function linesToArray(value: string) {
  return value
    .split(/\r?\n|[,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToLines(value?: string[]) {
  return (value ?? []).join('\n');
}

function stageLabel(response: ResearchMissionResponse | null, stage?: ResearchStage) {
  return response?.stageOptions.find((item) => item.id === stage)?.label ?? stage ?? '未设置';
}

function securityBucket(status: string) {
  const normalized = String(status || 'unknown').toLowerCase();
  if (['clean', 'safe', 'approved'].includes(normalized)) return 'clean';
  if (normalized.includes('suspicious') || normalized.includes('blocked') || normalized.includes('risk')) return 'suspicious';
  return 'unknown';
}

function verdictLabel(verdict?: SkillCandidateAudit['verdict']) {
  if (verdict === 'recommend') return '建议安装';
  if (verdict === 'caution') return '谨慎安装';
  return '需要人工审查';
}

function riskLabel(risk?: SkillCandidateAudit['riskLevel']) {
  if (risk === 'low') return '低风险';
  if (risk === 'medium') return '中风险';
  return '高风险';
}

function fallbackAudit(candidate: SkillCandidate): SkillCandidateAudit {
  const riskPoints =
    (candidate.requiresApiKey ? 1 : 0) +
    (candidate.duplicateOf ? 1 : 0) +
    (securityBucket(candidate.sourceSecurity) === 'clean' ? 0 : 1) +
    Math.min(1, candidate.risks.length);
  return {
    verdict: riskPoints === 0 ? 'recommend' : riskPoints <= 2 ? 'caution' : 'manual-review',
    riskLevel: riskPoints === 0 ? 'low' : riskPoints <= 2 ? 'medium' : 'high',
    reasons: [
      `命中空白区：${candidate.gapLabel}`,
      `${candidate.stars} stars，${candidate.downloads} 下载`,
      ...candidate.risks
    ].slice(0, 6),
    duplicateSkillIds: [],
    workflowIds: []
  };
}

function StatusPill({ universe }: { universe: SkillUniverseResponse }) {
  return (
    <div className="status-pills" aria-label="扫描状态">
      <span>
        <Satellite size={14} />
        {universe.skills.length} skills
      </span>
      <span>
        <Layers3 size={14} />
        {universe.clusters.length} 星区
      </span>
      <span className={universe.meta.relationMode !== 'lexical' ? 'is-live' : ''}>
        <BrainCircuit size={14} />
        {relationModeLabel(universe.meta.relationMode)}
      </span>
    </div>
  );
}

function WindowControls({
  pinned,
  onTogglePinned,
  onMinimize,
  onHide,
  hideLabel
}: {
  pinned: boolean;
  onTogglePinned: () => void;
  onMinimize?: () => void;
  onHide: () => void;
  hideLabel: string;
}) {
  return (
    <div className="window-controls">
      <button type="button" onClick={onTogglePinned} aria-label={pinned ? '取消固定' : '固定窗口'} title={pinned ? '取消固定' : '固定窗口'}>
        {pinned ? <Pin size={14} /> : <PinOff size={14} />}
      </button>
      {onMinimize ? (
        <button type="button" onClick={onMinimize} aria-label="最小化窗口" title="最小化窗口">
          <Minus size={14} />
        </button>
      ) : null}
      <button type="button" onClick={onHide} aria-label={hideLabel} title={hideLabel}>
        <EyeOff size={14} />
      </button>
    </div>
  );
}

function PanelLauncher({
  layout,
  snapshots,
  activeWorkflow,
  hasInstallCandidate,
  onTogglePanel,
  onApplyPreset,
  onSetPerformanceMode,
  onSaveSnapshot,
  onApplySnapshot,
  onRenameSnapshot,
  onDeleteSnapshot,
  onResetLayout,
  onHideAllPanels,
  onRestoreLastPanels,
  onOpenCommandPalette
}: {
  layout: SkillUniverseLayoutState;
  snapshots: LayoutSnapshot[];
  activeWorkflow: boolean;
  hasInstallCandidate: boolean;
  onTogglePanel: (panel: PanelId) => void;
  onApplyPreset: (preset: LayoutPreset) => void;
  onSetPerformanceMode: (mode: PerformanceMode) => void;
  onSaveSnapshot: () => void;
  onApplySnapshot: (snapshotId: string) => void;
  onRenameSnapshot: (snapshotId: string) => void;
  onDeleteSnapshot: (snapshotId: string) => void;
  onResetLayout: () => void;
  onHideAllPanels: () => void;
  onRestoreLastPanels: () => void;
  onOpenCommandPalette: () => void;
}) {
  const visible = layout.visible;
  const panelItems: Array<{ id: PanelId; label: string; enabled: boolean }> = [
    { id: 'clusters', label: PANEL_LABELS.clusters, enabled: true },
    { id: 'missions', label: PANEL_LABELS.missions, enabled: true },
    { id: 'details', label: PANEL_LABELS.details, enabled: true },
    { id: 'recommendations', label: PANEL_LABELS.recommendations, enabled: true },
    { id: 'researchMission', label: PANEL_LABELS.researchMission, enabled: true },
    { id: 'workflow', label: PANEL_LABELS.workflow, enabled: activeWorkflow },
    { id: 'installConsole', label: PANEL_LABELS.installConsole, enabled: hasInstallCandidate },
    { id: 'timeline', label: PANEL_LABELS.timeline, enabled: true }
  ];

  return (
    <div className="panel-launcher" aria-label="窗口开关">
      <button type="button" className="toolbar-button command-trigger" onClick={onOpenCommandPalette} title="搜索 skill 和快捷动作 Ctrl/Cmd+K">
        <Search size={14} />
        搜索
      </button>

      <details className="toolbar-menu" data-menu="view">
        <summary>
          <LayoutDashboard size={14} />
          <span>{PRESET_LABELS[layout.preset]}</span>
        </summary>
        <div className="toolbar-popover view-popover">
          <div className="toolbar-group">
            <strong>布局预设</strong>
            <label className="layout-menu">
              <select value={layout.preset} onChange={(event) => onApplyPreset(event.target.value as LayoutPreset)} aria-label="布局预设">
                {Object.entries(PRESET_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="toolbar-group">
            <strong>性能模式</strong>
            <label className="layout-menu">
              <select value={layout.performanceMode} onChange={(event) => onSetPerformanceMode(event.target.value as PerformanceMode)} aria-label="性能模式">
                {Object.entries(PERFORMANCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="toolbar-group">
            <strong>布局快照</strong>
            <label className="layout-menu snapshot-menu">
              <select value={layout.activeSnapshotId ?? ''} onChange={(event) => event.target.value && onApplySnapshot(event.target.value)} aria-label="布局快照">
                <option value="">选择快照</option>
                {snapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>{snapshot.name}</option>
                ))}
              </select>
            </label>
            <div className="toolbar-row">
              <button type="button" onClick={onSaveSnapshot}>保存当前</button>
              {layout.activeSnapshotId ? (
                <>
                  <button type="button" onClick={() => onRenameSnapshot(layout.activeSnapshotId!)}>改名</button>
                  <button type="button" onClick={() => onDeleteSnapshot(layout.activeSnapshotId!)}>删除</button>
                </>
              ) : null}
            </div>
          </div>

          <button type="button" className="wide-menu-action" onClick={onResetLayout}>
            <RefreshCw size={14} />
            恢复默认布局
          </button>
        </div>
      </details>

      <details className="toolbar-menu" data-menu="panels">
        <summary>
          <Eye size={14} />
          <span>面板</span>
        </summary>
        <div className="toolbar-popover panel-popover">
          <div className="toolbar-group">
            <strong>常用面板</strong>
            {panelItems.filter((item) => ['clusters', 'missions', 'details'].includes(item.id)).map((item) => (
              <button key={item.id} type="button" data-panel={item.id} data-active={visible[item.id] && !layout.minimized[item.id]} onClick={() => onTogglePanel(item.id)}>
                {visible[item.id] && !layout.minimized[item.id] ? <Eye size={14} /> : <EyeOff size={14} />}
                {item.label}{visible[item.id] && layout.minimized[item.id] ? '（最小化）' : ''}
              </button>
            ))}
          </div>
          <div className="toolbar-group">
            <strong>工具面板</strong>
            {panelItems.filter((item) => !['clusters', 'missions', 'details'].includes(item.id)).map((item) => (
              <button key={item.id} type="button" data-panel={item.id} data-active={visible[item.id] && !layout.minimized[item.id]} onClick={() => onTogglePanel(item.id)} disabled={!item.enabled}>
                {visible[item.id] && !layout.minimized[item.id] ? <Eye size={14} /> : <EyeOff size={14} />}
                {item.label}{visible[item.id] && layout.minimized[item.id] ? '（最小化）' : ''}
              </button>
            ))}
          </div>
          <div className="toolbar-group">
            <strong>快捷操作</strong>
            <button type="button" onClick={onHideAllPanels}>隐藏全部面板</button>
            <button type="button" onClick={onRestoreLastPanels}>恢复上次面板</button>
          </div>
        </div>
      </details>
    </div>
  );
}

function MiniPanelBar({
  layout,
  onRestore
}: {
  layout: SkillUniverseLayoutState;
  onRestore: (panel: PanelId) => void;
}) {
  const minimizedPanels = (Object.keys(PANEL_LABELS) as PanelId[])
    .filter((panel) => layout.visible[panel] && layout.minimized[panel]);

  if (!minimizedPanels.length) return null;

  return (
    <div className="mini-panel-bar" aria-label="最小化面板">
      {minimizedPanels.map((panel) => (
        <button key={panel} type="button" onClick={() => onRestore(panel)}>
          <span>{PANEL_LABELS[panel]}</span>
        </button>
      ))}
    </div>
  );
}

function ClusterDock({
  clusters,
  activeClusterIds,
  pinned,
  position,
  zIndex,
  onPositionChange,
  onToggle,
  onActivate,
  onMinimize,
  onTogglePinned,
  onHide
}: {
  clusters: Cluster[];
  activeClusterIds: Set<string>;
  pinned: boolean;
  position?: PanelPosition;
  zIndex?: number;
  onPositionChange: (position: PanelPosition) => void;
  onToggle: (clusterId: string) => void;
  onActivate: () => void;
  onMinimize: () => void;
  onTogglePinned: () => void;
  onHide: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  return (
    <aside className="cluster-dock" data-pinned={pinned} ref={panelRef} aria-label="星区筛选" style={panelStyle(position, false, zIndex)} onPointerDownCapture={onActivate}>
      <div className="panel-heading window-heading" onPointerDown={(event) => startPanelDrag(event, panelRef, pinned, onPositionChange)}>
        <span className="heading-title">
          <Telescope size={18} />
          <span>星区</span>
        </span>
        <WindowControls pinned={pinned} onTogglePinned={onTogglePinned} onMinimize={onMinimize} onHide={onHide} hideLabel="隐藏星区窗口" />
      </div>
      <div className="cluster-list">
        {clusters.map((cluster) => {
          const active = activeClusterIds.has(cluster.id);
          return (
            <button
              className={`cluster-chip ${active ? 'active' : ''}`}
              key={cluster.id}
              onClick={() => onToggle(cluster.id)}
              type="button"
              style={{ '--cluster-color': cluster.color } as CSSProperties}
            >
              <span className="cluster-swatch" />
              <span className="cluster-label">{cluster.label}</span>
              <span className="cluster-count">{cluster.skillIds.length}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function HealthBlock({ skill }: { skill: SkillNode }) {
  const health = skill.health;
  return (
    <section className="detail-section health-section" data-level={health.level}>
      <h3>健康评分</h3>
      <div className="health-summary">
        <b>{health.score}</b>
        <span>{health.level === 'good' ? '状态良好' : health.level === 'watch' ? '建议维护' : '需要修复'}</span>
        <small>{health.staleDays} 天未更新</small>
      </div>
      {health.issues.length ? (
        <ul>
          {health.issues.slice(0, 4).map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      ) : (
        <p className="muted">没有明显结构问题。</p>
      )}
      {health.suggestions.length ? (
        <div className="health-suggestions">
          {health.suggestions.slice(0, 3).map((suggestion) => <span key={suggestion}>{suggestion}</span>)}
        </div>
      ) : null}
    </section>
  );
}

function resourceDelta(a: SkillNode, b: SkillNode) {
  const left = resourceCount(a);
  const right = resourceCount(b);
  if (left === right) return '资源规模接近';
  return left > right
    ? `${a.displayName} 的可复用资源更多`
    : `${b.displayName} 的可复用资源更多`;
}

function keepSuggestion(a: SkillNode, b: SkillNode) {
  const aScore = a.health.score + resourceCount(a) * 3 + (a.description.length > 80 ? 6 : 0);
  const bScore = b.health.score + resourceCount(b) * 3 + (b.description.length > 80 ? 6 : 0);
  const keep = aScore >= bScore ? a : b;
  return `优先保留 ${keep.displayName}；它的健康分、描述完整度或资源结构更占优。`;
}

function RelationExplanationCards({
  selected,
  relations,
  skillsById,
  clusters
}: {
  selected: SkillNode;
  relations: SkillRelation[];
  skillsById: Map<string, SkillNode>;
  clusters: Cluster[];
}) {
  const explanations = relations
    .map((relation) => {
      const otherId = relation.source === selected.id ? relation.target : relation.source;
      const other = skillsById.get(otherId);
      if (!other) return null;
      const domains = selected.domains
        .filter((domain) => other.domains.includes(domain))
        .map((domain) => clusterName(clusters, domain));
      const terms = sharedTerms(selected, other);
      const recommendation = relation.type === 'overlap'
        ? keepSuggestion(selected, other)
        : `适合和 ${other.displayName} 分工使用：一个作为入口，一个补足后续处理。`;
      return { relation, other, domains, terms, recommendation };
    })
    .filter(Boolean)
    .slice(0, 4) as Array<{
      relation: SkillRelation;
      other: SkillNode;
      domains: string[];
      terms: string[];
      recommendation: string;
    }>;

  return (
    <section className="detail-section relation-explain-section">
      <h3>为什么相似</h3>
      {explanations.length ? (
        <div className="relation-explain-list">
          {explanations.map(({ relation, other, domains, terms, recommendation }) => (
            <article key={`${relation.source}-${relation.target}`} className="relation-explain-card" data-type={relation.type}>
              <div>
                <strong>{other.displayName}</strong>
                <span>{relationTypeLabel(relation.type)} · {relationScore(relation.score)}</span>
              </div>
              <p>{relation.evidence}</p>
              <div className="relation-evidence-grid">
                <span>共享领域 <b>{domains.length ? domains.join('、') : '语义邻近'}</b></span>
                <span>共享关键词 <b>{terms.length ? terms.join('、') : '暂无明显词面重合'}</b></span>
                <span>资源差异 <b>{resourceDelta(selected, other)}</b></span>
              </div>
              <p className="relation-recommendation">{recommendation}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">暂无足够强的相似/重复关系。</p>
      )}
    </section>
  );
}

function SkillTagEditor({
  skillId,
  tags,
  onChange
}: {
  skillId: string;
  tags: string[];
  onChange: (skillId: string, tags: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const normalizedTags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];

  function addTag(tag: string) {
    const nextTag = tag.trim();
    if (!nextTag) return;
    onChange(skillId, [...new Set([...normalizedTags, nextTag])]);
    setDraft('');
  }

  function removeTag(tag: string) {
    onChange(skillId, normalizedTags.filter((item) => item !== tag));
  }

  return (
    <section className="detail-section tag-section">
      <h3>个人标签</h3>
      <div className="tag-list">
        {normalizedTags.length ? normalizedTags.map((tag) => (
          <button key={tag} type="button" onClick={() => removeTag(tag)} title="点击移除标签">
            {tag}
            <span>×</span>
          </button>
        )) : <p className="muted">还没有个人标签。</p>}
      </div>
      <div className="tag-presets">
        {DEFAULT_TAGS.filter((tag) => !normalizedTags.includes(tag)).map((tag) => (
          <button key={tag} type="button" onClick={() => addTag(tag)}>{tag}</button>
        ))}
      </div>
      <form className="tag-form" onSubmit={(event) => {
        event.preventDefault();
        addTag(draft);
      }}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="添加自定义标签" />
        <button type="submit">添加</button>
      </form>
    </section>
  );
}

function SkillDetail({
  selected,
  universe,
  skillsById,
  tags,
  pinned,
  position,
  zIndex,
  onPositionChange,
  onUpdateTags,
  onSelectSkill,
  onActivate,
  onMinimize,
  onTogglePinned,
  onHide
}: {
  selected: SkillNode | undefined;
  universe: SkillUniverseResponse;
  skillsById: Map<string, SkillNode>;
  tags: string[];
  pinned: boolean;
  position?: PanelPosition;
  zIndex?: number;
  onPositionChange: (position: PanelPosition) => void;
  onUpdateTags: (skillId: string, tags: string[]) => void;
  onSelectSkill: (id: string) => void;
  onActivate: () => void;
  onMinimize: () => void;
  onTogglePinned: () => void;
  onHide: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const commonProps = {
    ref: panelRef,
    style: panelStyle(position, false, zIndex),
    'data-pinned': pinned,
    onPointerDownCapture: onActivate
  };

  if (!selected) {
    return (
      <aside className="detail-panel empty-state" aria-label="Skill 详情" {...commonProps}>
        <div className="detail-panel-head window-heading" onPointerDown={(event) => startPanelDrag(event, panelRef, pinned, onPositionChange)}>
          <div className="detail-titlemark">
            <Orbit size={28} />
            <h2>Skill 宇宙</h2>
          </div>
          <WindowControls pinned={pinned} onTogglePinned={onTogglePinned} onMinimize={onMinimize} onHide={onHide} hideLabel="隐藏详情面板" />
        </div>
        <p>当前星域已载入 {universe.skills.length} 个 skill。</p>
        <div className="empty-grid">
          <span>本机 {universe.meta.localSkillCount}</span>
          <span>插件 {universe.meta.pluginSkillCount}</span>
          <span>{universe.relations.length} 组关系</span>
        </div>
      </aside>
    );
  }

  const related = sortRelationsForSkill(selected.id, universe.relations);
  const missions = universe.insights.filter((insight) => insight.skillIds.includes(selected.id)).slice(0, 4);

  return (
    <aside className="detail-panel" aria-label="Skill 详情" {...commonProps}>
      <div className="detail-panel-head window-heading" onPointerDown={(event) => startPanelDrag(event, panelRef, pinned, onPositionChange)}>
        <div>
          <div className="detail-kicker">
            <span style={{ background: selected.color }} />
            {clusterName(universe.clusters, selected.clusterId)}
          </div>
          <h2>{selected.displayName}</h2>
        </div>
        <WindowControls pinned={pinned} onTogglePinned={onTogglePinned} onMinimize={onMinimize} onHide={onHide} hideLabel="隐藏详情面板" />
      </div>
      <p className="detail-description">{selected.description || '这个 skill 没有写 description。'}</p>

      <div className="detail-stats">
        <span>
          <Boxes size={14} />
          {selected.source === 'plugin' ? 'Plugin' : 'Local'}
        </span>
        <span>
          <FileText size={14} />
          {resourceCount(selected)} 资源
        </span>
        <span data-health={selected.health.level}>
          <Activity size={14} />
          健康 {selected.health.score}
        </span>
      </div>

      <HealthBlock skill={selected} />
      <SkillTagEditor skillId={selected.id} tags={tags} onChange={onUpdateTags} />

      <section className="detail-section">
        <h3>资源结构</h3>
        <div className="resource-grid">
          <span>scripts <b>{selected.resources.scripts.length}</b></span>
          <span>references <b>{selected.resources.references.length}</b></span>
          <span>assets <b>{selected.resources.assets.length}</b></span>
          <span>agent UI <b>{selected.resources.agents ? 'yes' : 'no'}</b></span>
        </div>
      </section>

      <section className="detail-section">
        <h3>相邻技能</h3>
        <div className="related-list">
          {related.length ? (
            related.map((relation) => {
              const otherId = relation.source === selected.id ? relation.target : relation.source;
              const other = skillsById.get(otherId);
              if (!other) return null;
              return (
                <button key={`${relation.source}-${relation.target}`} onClick={() => onSelectSkill(other.id)} type="button">
                  <span>{other.displayName}</span>
                  <small>{relationScore(relation.score)}</small>
                </button>
              );
            })
          ) : (
            <p className="muted">暂无高置信相邻项。</p>
          )}
        </div>
      </section>

      <RelationExplanationCards
        selected={selected}
        relations={related}
        skillsById={skillsById}
        clusters={universe.clusters}
      />

      <section className="detail-section">
        <h3>组合航线</h3>
        <div className="mission-mini-list">
          {missions.length ? (
            missions.map((mission) => (
              <button key={mission.id} type="button" onClick={() => onSelectSkill(mission.skillIds[0])}>
                {mission.title}
              </button>
            ))
          ) : (
            <p className="muted">暂未进入推荐航线。</p>
          )}
        </div>
      </section>
    </aside>
  );
}

function MissionDeck({
  insights,
  skillsById,
  activeInsightId,
  pinned,
  position,
  zIndex,
  onPositionChange,
  onSelectMission,
  onActivate,
  onMinimize,
  onTogglePinned,
  onHide
}: {
  insights: Insight[];
  skillsById: Map<string, SkillNode>;
  activeInsightId: string | null;
  pinned: boolean;
  position?: PanelPosition;
  zIndex?: number;
  onPositionChange: (position: PanelPosition) => void;
  onSelectMission: (insight: Insight) => void;
  onActivate: () => void;
  onMinimize: () => void;
  onTogglePinned: () => void;
  onHide: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: 0,
    startX: 0,
    scrollLeft: 0
  });

  function scrollMissions(direction: -1 | 1) {
    const row = rowRef.current;
    if (!row) return;
    row.scrollBy({
      left: direction * Math.max(260, row.clientWidth * 0.72),
      behavior: 'auto'
    });
  }

  function beginMissionScroll(event: ReactPointerEvent<HTMLDivElement>) {
    const row = rowRef.current;
    if (!row || (event.target as HTMLElement).closest('button,a')) return;
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: row.scrollLeft
    };
  }

  function moveMissionScroll(event: ReactPointerEvent<HTMLDivElement>) {
    const row = rowRef.current;
    const drag = dragRef.current;
    if (!row || !drag.active || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    if (Math.abs(delta) > 5) {
      drag.moved = true;
      row.dataset.dragging = 'true';
    }
    row.scrollLeft = drag.scrollLeft - delta;
  }

  function endMissionScroll(event: ReactPointerEvent<HTMLDivElement>) {
    const row = rowRef.current;
    const drag = dragRef.current;
    if (!row || !drag.active || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      window.setTimeout(() => {
        row.dataset.dragging = 'false';
      }, 80);
    } else {
      row.dataset.dragging = 'false';
    }
    dragRef.current = { ...dragRef.current, active: false };
  }

  function wheelMissionScroll(event: ReactWheelEvent<HTMLDivElement>) {
    const row = rowRef.current;
    if (!row) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    row.scrollLeft += event.deltaY;
    event.preventDefault();
  }

  function selectMissionFromCard(insight: Insight) {
    if (rowRef.current?.dataset.dragging === 'true') return;
    onSelectMission(insight);
  }

  return (
    <section className="mission-deck" data-pinned={pinned} ref={panelRef} aria-label="组合推荐" style={panelStyle(position, false, zIndex)} onPointerDownCapture={onActivate}>
      <div className="mission-title window-heading" onPointerDown={(event) => startPanelDrag(event, panelRef, pinned, onPositionChange)}>
        <span className="heading-title">
          <Route size={18} />
          <span>推荐航线</span>
        </span>
        <div className="mission-actions">
          <button type="button" onClick={() => scrollMissions(-1)} aria-label="向左滑动推荐航线" title="向左滑动">
            <ChevronLeft size={15} />
          </button>
          <button type="button" onClick={() => scrollMissions(1)} aria-label="向右滑动推荐航线" title="向右滑动">
            <ChevronRight size={15} />
          </button>
          <WindowControls pinned={pinned} onTogglePinned={onTogglePinned} onMinimize={onMinimize} onHide={onHide} hideLabel="隐藏推荐航线窗口" />
        </div>
      </div>
      <div
        className="mission-row"
        data-dragging="false"
        ref={rowRef}
        onPointerDown={beginMissionScroll}
        onPointerMove={moveMissionScroll}
        onPointerUp={endMissionScroll}
        onPointerCancel={endMissionScroll}
        onPointerLeave={endMissionScroll}
        onWheel={wheelMissionScroll}
      >
        {insights.slice(0, 8).map((insight) => (
          <article
            className={`mission-card ${insight.type}`}
            key={insight.id}
            data-active={insight.id === activeInsightId}
            onClick={() => selectMissionFromCard(insight)}
          >
            <strong>{insight.title}</strong>
            <span>{skillNames(insight.skillIds, skillsById)}</span>
            <p>{insight.rationale}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function DeepAuditSummary({ report }: { report: DeepAuditReport }) {
  return (
    <div className="deep-audit-summary" data-risk={report.riskLevel}>
      <strong>深度审查：{verdictLabel(report.verdict)} · {riskLabel(report.riskLevel)}</strong>
      <p>{report.summary}</p>
      <div className="deep-audit-findings">
        {report.findings.slice(0, 6).map((finding) => (
          <span key={finding.label} data-status={finding.status} title={finding.detail}>
            {finding.label}
          </span>
        ))}
      </div>
      {report.warnings.length ? <small>{report.warnings[0]}</small> : null}
    </div>
  );
}

function RecommendationRadar({
  recommendations,
  skillsById,
  activePlanSlug,
  deepAudits,
  deepAuditBusySlug,
  busy,
  pinned,
  position,
  zIndex,
  onPositionChange,
  onRefresh,
  onCreateInstallPlan,
  onDeepAudit,
  onActivate,
  onMinimize,
  onTogglePinned,
  onHide
}: {
  recommendations: SkillRecommendationResponse | null;
  skillsById: Map<string, SkillNode>;
  activePlanSlug: string | null;
  deepAudits: Record<string, DeepAuditReport>;
  deepAuditBusySlug: string | null;
  busy: boolean;
  pinned: boolean;
  position?: PanelPosition;
  zIndex?: number;
  onPositionChange: (position: PanelPosition) => void;
  onRefresh: () => void;
  onCreateInstallPlan: (candidate: SkillCandidate) => void;
  onDeepAudit: (candidate: SkillCandidate) => void;
  onActivate: () => void;
  onMinimize: () => void;
  onTogglePinned: () => void;
  onHide: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [minStars, setMinStars] = useState(0);
  const [minDownloads, setMinDownloads] = useState(0);
  const [security, setSecurity] = useState<RecommendationSecurityFilter>('all');
  const [apiKey, setApiKey] = useState<TriStateFilter>('all');
  const [duplicate, setDuplicate] = useState<TriStateFilter>('all');
  const [sort, setSort] = useState<RecommendationSort>('score');
  const gaps = recommendations?.gaps ?? [];
  const candidates = recommendations?.candidates ?? [];

  const filteredCandidates = useMemo(() => {
    const sorted = candidates
      .filter((candidate) => candidate.stars >= minStars)
      .filter((candidate) => candidate.downloads >= minDownloads)
      .filter((candidate) => security === 'all' || securityBucket(candidate.sourceSecurity) === security)
      .filter((candidate) => apiKey === 'all' || candidate.requiresApiKey === (apiKey === 'yes'))
      .filter((candidate) => duplicate === 'all' || Boolean(candidate.duplicateOf) === (duplicate === 'yes'))
      .slice();

    sorted.sort((a, b) => {
      if (sort === 'stars') return b.stars - a.stars || b.recommendationScore - a.recommendationScore;
      if (sort === 'downloads') return b.downloads - a.downloads || b.recommendationScore - a.recommendationScore;
      if (sort === 'security') {
        const rank = (candidate: SkillCandidate) => securityBucket(candidate.sourceSecurity) === 'clean' ? 2 : securityBucket(candidate.sourceSecurity) === 'unknown' ? 1 : 0;
        return rank(b) - rank(a) || b.recommendationScore - a.recommendationScore;
      }
      return b.recommendationScore - a.recommendationScore;
    });
    return sorted;
  }, [apiKey, candidates, duplicate, minDownloads, minStars, security, sort]);

  return (
    <section
      className="recommendation-panel"
      data-pinned={pinned}
      ref={panelRef}
      aria-label="Skill 推荐安装雷达"
      style={panelStyle(position, false, zIndex)}
      onPointerDownCapture={onActivate}
    >
      <div className="recommendation-head window-heading" onPointerDown={(event) => startPanelDrag(event, panelRef, pinned, onPositionChange)}>
        <span className="heading-title">
          <Search size={18} />
          <span>推荐安装雷达</span>
        </span>
        <div className="recommendation-actions">
          <button type="button" onClick={onRefresh} disabled={busy}>
            <RefreshCw size={14} className={busy ? 'spin' : ''} />
            联网刷新
          </button>
          <WindowControls pinned={pinned} onTogglePinned={onTogglePinned} onMinimize={onMinimize} onHide={onHide} hideLabel="隐藏推荐安装窗口" />
        </div>
      </div>

      {!recommendations ? (
        <div className="recommendation-empty">
          <Sparkles size={26} />
          <h2>还没有推荐结果</h2>
          <p>点击“联网刷新”后，只会把空白区关键词发给 ClawHub，不上传本地 skill 全文、路径或密钥。</p>
        </div>
      ) : (
        <>
          <div className="recommendation-meta">
            <span data-status={recommendations.status}>{recommendations.status === 'online' ? 'ClawHub 在线' : '离线/缓存'}</span>
            <span>{recommendations.fromCache ? '来自缓存' : '刚刚计算'}</span>
            <span>{recommendations.candidates.length} 个候选</span>
            <span>{filteredCandidates.length} 个显示中</span>
          </div>

          <section className="radar-section">
            <h3>空白区地图</h3>
            <div className="gap-grid">
              {gaps.slice(0, 7).map((gap) => (
                <article className="gap-card" key={gap.id} data-priority={gap.priority > 0.55 ? 'high' : 'normal'}>
                  <strong>{gap.label}</strong>
                  <span>覆盖 {Math.round(gap.coverage * 100)}%</span>
                  <p>{gap.evidence}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="radar-section">
            <div className="filter-heading">
              <h3>推荐候选</h3>
              <SlidersHorizontal size={16} />
            </div>
            <div className="recommendation-filters">
              <label>最低 stars <input type="number" min={0} value={minStars} onChange={(event) => setMinStars(Number(event.target.value) || 0)} /></label>
              <label>最低下载 <input type="number" min={0} value={minDownloads} onChange={(event) => setMinDownloads(Number(event.target.value) || 0)} /></label>
              <label>安全 <select value={security} onChange={(event) => setSecurity(event.target.value as RecommendationSecurityFilter)}>
                <option value="all">全部</option>
                <option value="clean">clean</option>
                <option value="suspicious">suspicious</option>
                <option value="unknown">unknown</option>
              </select></label>
              <label>API key <select value={apiKey} onChange={(event) => setApiKey(event.target.value as TriStateFilter)}>
                <option value="all">全部</option>
                <option value="no">不需要</option>
                <option value="yes">可能需要</option>
              </select></label>
              <label>重复 <select value={duplicate} onChange={(event) => setDuplicate(event.target.value as TriStateFilter)}>
                <option value="all">全部</option>
                <option value="no">不重复</option>
                <option value="yes">可能重复</option>
              </select></label>
              <label>排序 <select value={sort} onChange={(event) => setSort(event.target.value as RecommendationSort)}>
                <option value="score">匹配分</option>
                <option value="stars">stars</option>
                <option value="downloads">下载量</option>
                <option value="security">安全优先</option>
              </select></label>
            </div>

            <VirtualList
              items={filteredCandidates}
              itemHeight={360}
              height={Math.min(560, Math.max(260, window.innerHeight - 430))}
              className="candidate-list virtual-list"
              empty={(
                <div className="recommendation-empty inline">
                  <Search size={22} />
                  <h2>没有符合筛选的候选</h2>
                  <p>可以降低 stars、下载量或安全状态筛选；未验证存在的 ClawHub 项仍不会展示。</p>
                </div>
              )}
              renderItem={(candidate) => {
                const audit = candidate.audit ?? fallbackAudit(candidate);
                const report = deepAudits[candidate.slug];
                return (
                  <article className="candidate-card" key={candidate.slug} data-verdict={audit.verdict}>
                    <div className="candidate-top">
                      <div>
                        <strong>{candidate.name}</strong>
                        <span>{candidate.slug}</span>
                      </div>
                      <b>
                        <small>匹配</small>
                        {candidate.recommendationScore}
                      </b>
                    </div>
                    <p>{candidate.summary || `用于补强“${candidate.gapLabel}”的 ClawHub skill。`}</p>
                    <div className="candidate-badges">
                      <span>{candidate.gapLabel}</span>
                      <span>{candidate.stars} stars</span>
                      <span>{candidate.downloads} 下载</span>
                      <span>{candidate.sourceSecurity}</span>
                      <span data-risk={audit.riskLevel}>{verdictLabel(audit.verdict)}</span>
                      {candidate.verified ? <span>已验证存在</span> : null}
                      {candidate.requiresApiKey ? <span className="warn">疑似要 key</span> : null}
                      {candidate.duplicateOf ? <span className="warn">可能重复</span> : null}
                    </div>
                    <div className="candidate-links">
                      <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">
                        查看 ClawHub
                      </a>
                      <button type="button" onClick={() => onCreateInstallPlan(candidate)} disabled={busy && activePlanSlug === candidate.slug}>
                        {busy && activePlanSlug === candidate.slug
                          ? '生成中...'
                          : activePlanSlug === candidate.slug
                            ? '查看安装方案'
                            : '生成安装方案'}
                      </button>
                      <button type="button" onClick={() => onDeepAudit(candidate)} disabled={deepAuditBusySlug === candidate.slug}>
                        {deepAuditBusySlug === candidate.slug ? '审查中...' : report ? '刷新深度审查' : '深度审查'}
                      </button>
                    </div>
                    {report ? <DeepAuditSummary report={report} /> : null}
                    {candidate.complements.length ? (
                      <div className="candidate-complements">
                        <span>可组合：</span>
                        {candidate.complements.map((item) => (
                          <small key={item.id}>{skillsById.get(item.id)?.displayName ?? item.name}</small>
                        ))}
                      </div>
                    ) : null}
                    <ul className="candidate-rationale">
                      {audit.reasons.slice(0, 4).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                      {candidate.risks.slice(0, 2).map((item) => (
                        <li className="warn" key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                );
              }}
            />
          </section>
          {recommendations.meta.warnings.length ? (
            <p className="recommendation-warning">{recommendations.meta.warnings[0]}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

function InstallConsole({
  candidate,
  plan,
  checkResult,
  busy,
  copiedCommand,
  pinned,
  position,
  zIndex,
  onPositionChange,
  onCopyCommand,
  onCheckInstall,
  onActivate,
  onMinimize,
  onTogglePinned,
  onClose
}: {
  candidate: SkillCandidate;
  plan: InstallPlan | null;
  checkResult: InstallCheckResult | null;
  busy: 'plan' | 'check' | null;
  copiedCommand: string | null;
  pinned: boolean;
  position?: PanelPosition;
  zIndex?: number;
  onPositionChange: (position: PanelPosition) => void;
  onCopyCommand: (command: string) => void;
  onCheckInstall: () => void;
  onActivate: () => void;
  onMinimize: () => void;
  onTogglePinned: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const commands = plan?.commands ?? [`npx clawhub@latest install ${candidate.packageSlug}`];
  const warnings = plan?.warnings?.length ? plan.warnings : candidate.risks;
  const sourceSecurity = candidate.sourceSecurity === 'unknown' ? '安全状态未知' : `安全状态：${candidate.sourceSecurity}`;
  const audit = candidate.audit ?? fallbackAudit(candidate);

  return (
    <section className="install-console" data-pinned={pinned} role="dialog" aria-label="安装方案" ref={panelRef} style={panelStyle(position, true, zIndex)} onPointerDownCapture={onActivate}>
      <div className="install-console-head window-heading" onPointerDown={(event) => startPanelDrag(event, panelRef, pinned, onPositionChange)}>
        <div>
          <span className="workflow-kicker">
            <Terminal size={15} />
            安装方案
          </span>
          <h2>{candidate.name}</h2>
          <p>{candidate.slug}</p>
        </div>
        <WindowControls pinned={pinned} onTogglePinned={onTogglePinned} onMinimize={onMinimize} onHide={onClose} hideLabel="关闭安装方案" />
      </div>

      {busy === 'plan' && !plan ? (
        <div className="install-console-loading">
          <Sparkles size={22} />
          <span>正在生成安装方案...</span>
        </div>
      ) : null}

      <section className="install-audit-card" data-risk={audit.riskLevel}>
        <div>
          <span>安装前审查报告</span>
          <h3>{verdictLabel(audit.verdict)} · {riskLabel(audit.riskLevel)}</h3>
        </div>
        <div className="audit-pill-row">
          <span>{candidate.stars} stars</span>
          <span>{candidate.downloads} 下载</span>
          <span>{sourceSecurity}</span>
          <span>{candidate.requiresApiKey ? '可能需要 API key' : '未发现 key 需求'}</span>
          <span>{candidate.duplicateOf ? `可能重复：${candidate.duplicateOf}` : '未发现明显重复'}</span>
        </div>
        <ul>
          {audit.reasons.slice(0, 6).map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      </section>

      <div className="install-console-grid">
        <section className="install-step-card">
          <strong>1 查看来源</strong>
          <div className="install-source-line">
            <span>{candidate.stars} stars</span>
            <span>{candidate.downloads} 下载</span>
            <span>{sourceSecurity}</span>
          </div>
          <a href={plan?.sourceUrl ?? candidate.sourceUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={14} />
            打开 ClawHub
          </a>
        </section>

        <section className="install-step-card">
          <strong>2 审核风险</strong>
          <div className="install-risk-list">
            {warnings.length ? (
              warnings.map((warning) => <p key={warning}>{warning}</p>)
            ) : (
              <p>没有从推荐数据中发现明显风险；安装前仍建议查看 SKILL.md 和 scripts。</p>
            )}
          </div>
        </section>

        <section className="install-step-card wide">
          <strong>3 执行安装</strong>
          <div className="command-stack">
            {commands.map((command, index) => (
              <div className="command-row" key={command}>
                <div>
                  <span>{index === 0 ? '安装命令' : '验证命令'}</span>
                  <code>{command}</code>
                </div>
                <button type="button" onClick={() => onCopyCommand(command)}>
                  <Copy size={14} />
                  {copiedCommand === command ? '已复制' : '复制'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="install-step-card wide">
          <strong>4 验证更新</strong>
          <div className="install-verify-actions">
            <button type="button" onClick={onCheckInstall} disabled={busy === 'check'}>
              <ShieldCheck size={14} />
              {busy === 'check' ? '检测中...' : '检测是否已安装'}
            </button>
            <span>{checkResult?.nextAction ?? '安装完成后点击检测，或等待星域自动发现新 skill。'}</span>
          </div>
          {checkResult ? (
            <div className="install-check-list" data-installed={checkResult.installed}>
              {checkResult.matches.map((match) => (
                <div key={match.skillFile}>
                  <b>{match.exists ? '已找到' : '未找到'}</b>
                  <span>{match.label}</span>
                  <code>{match.skillFile}</code>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function WorkflowPanel({
  insight,
  skillsById,
  selectedSkillId,
  visible,
  restoreButton,
  pinned,
  position,
  zIndex,
  onPositionChange,
  onSelectStep,
  onActivate,
  onMinimize,
  onTogglePinned,
  onClose,
  onShow
}: {
  insight: Insight | undefined;
  skillsById: Map<string, SkillNode>;
  selectedSkillId: string | null;
  visible: boolean;
  restoreButton: boolean;
  pinned: boolean;
  position?: PanelPosition;
  zIndex?: number;
  onPositionChange: (position: PanelPosition) => void;
  onSelectStep: (skillId: string) => void;
  onActivate: () => void;
  onMinimize: () => void;
  onTogglePinned: () => void;
  onClose: () => void;
  onShow: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const steps = workflowSteps(insight, skillsById);
  const completeness = workflowCompleteness(steps);

  if (!insight || !steps.length) return null;

  if (!visible) {
    return restoreButton ? (
      <button className="workflow-restore" type="button" onClick={onShow}>
        <Compass size={15} />
        显示工作流
      </button>
    ) : null;
  }

  return (
    <section
      className="workflow-panel"
      data-pinned={pinned}
      ref={panelRef}
      aria-label="航线工作流"
      style={panelStyle(position, true, zIndex)}
      onPointerDownCapture={onActivate}
    >
      <div className="workflow-head window-heading" onPointerDown={(event) => startPanelDrag(event, panelRef, pinned, onPositionChange)}>
        <div>
          <span className="workflow-kicker">
            <Move size={15} />
            航线工作流
          </span>
          <h2>{insight.title}</h2>
          <p>{insight.rationale}</p>
        </div>
        <div className="workflow-head-actions">
          <WindowControls pinned={pinned} onTogglePinned={onTogglePinned} onMinimize={onMinimize} onHide={onClose} hideLabel="关闭航线工作流" />
        </div>
      </div>

      <div className="workflow-completeness">
        <strong>航线完整度 {completeness.percent}%</strong>
        <span>已覆盖：{completeness.covered.map((item) => item.label).join('、') || '暂无'}</span>
        <span>可能缺：{completeness.missing.map((item) => item.label).join('、') || '无明显缺口'}</span>
      </div>

      <div className="workflow-steps">
        {steps.map((step, index) => (
          <button
            className="workflow-step"
            data-active={step.skill.id === selectedSkillId}
            key={`${insight.id}-${step.skill.id}`}
            type="button"
            onClick={() => onSelectStep(step.skill.id)}
            style={{ '--step-color': step.skill.color } as CSSProperties}
          >
            <span className="step-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="step-skill">
              <Play size={13} />
              {step.skill.displayName}
            </span>
            <span className="step-purpose">{step.purpose}</span>
            <span className="step-outcome">
              <CheckCircle2 size={13} />
              {step.outcome}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ResearchMissionPanel({
  response,
  skillsById,
  busy,
  pinned,
  position,
  zIndex,
  onPositionChange,
  onActivate,
  onMinimize,
  onTogglePinned,
  onHide,
  onSave,
  onDelete,
  onSetActive,
  onSelectSkill,
  onSelectRoute
}: {
  response: ResearchMissionResponse | null;
  skillsById: Map<string, SkillNode>;
  busy: boolean;
  pinned: boolean;
  position?: PanelPosition;
  zIndex?: number;
  onPositionChange: (position: PanelPosition) => void;
  onActivate: () => void;
  onMinimize: () => void;
  onTogglePinned: () => void;
  onHide: () => void;
  onSave: (project: Partial<ResearchProject>) => void;
  onDelete: (projectId: string) => void;
  onSetActive: (projectId: string) => void;
  onSelectSkill: (skillId: string) => void;
  onSelectRoute: (skillIds: string[]) => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const activeProject = response?.activeProject;
  const [draft, setDraft] = useState<Partial<ResearchProject>>(() => activeProject ?? emptyResearchProject());
  const [keywordsText, setKeywordsText] = useState(arrayToLines(activeProject?.keywords));
  const [papersText, setPapersText] = useState(arrayToLines(activeProject?.papers));

  useEffect(() => {
    const next = activeProject ?? emptyResearchProject();
    setDraft(next);
    setKeywordsText(arrayToLines(next.keywords));
    setPapersText(arrayToLines(next.papers));
  }, [activeProject?.id, activeProject?.updatedAt]);

  const analysis = response?.analysis ?? null;
  const activeRoute = analysis?.routes[0];

  function updateDraft<K extends keyof ResearchProject>(key: K, value: ResearchProject[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submitProject() {
    onSave({
      ...draft,
      keywords: linesToArray(keywordsText),
      papers: linesToArray(papersText)
    });
  }

  return (
    <section
      className="research-panel"
      data-pinned={pinned}
      ref={panelRef}
      aria-label="科研任务模式"
      style={panelStyle(position, false, zIndex)}
      onPointerDownCapture={onActivate}
    >
      <div className="research-head window-heading" onPointerDown={(event) => startPanelDrag(event, panelRef, pinned, onPositionChange)}>
        <span className="heading-title">
          <Compass size={18} />
          <span>科研任务</span>
        </span>
        <WindowControls pinned={pinned} onTogglePinned={onTogglePinned} onMinimize={onMinimize} onHide={onHide} hideLabel="隐藏科研任务窗口" />
      </div>

      <div className="research-layout">
        <section className="research-editor">
          <div className="research-toolbar">
            <select
              value={activeProject?.id ?? ''}
              onChange={(event) => onSetActive(event.target.value)}
              disabled={!response?.projects.length || busy}
              aria-label="选择科研项目"
            >
              {response?.projects.length ? response.projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              )) : <option value="">尚未创建项目</option>}
            </select>
            <button type="button" onClick={() => {
              setDraft(emptyResearchProject());
              setKeywordsText('');
              setPapersText('');
            }}>
              新项目
            </button>
          </div>

          <label>
            项目名称
            <input value={draft.name ?? ''} onChange={(event) => updateDraft('name', event.target.value)} placeholder="例如：数字岩心重建新方法" />
          </label>
          <label>
            研究方向
            <input value={draft.direction ?? ''} onChange={(event) => updateDraft('direction', event.target.value)} placeholder="领域、问题或对象" />
          </label>
          <div className="research-form-row">
            <div className="research-stage-field">
              <span>当前阶段</span>
              <div className="research-stage-grid" role="listbox" aria-label="当前阶段">
                {(response?.stageOptions ?? [{ id: 'ideation' as ResearchStage, label: '选题构思' }]).map((stage) => (
                  <button
                    key={stage.id}
                    type="button"
                    data-active={(draft.stage ?? 'ideation') === stage.id}
                    onClick={() => updateDraft('stage', stage.id)}
                    role="option"
                    aria-selected={(draft.stage ?? 'ideation') === stage.id}
                  >
                    {stage.label}
                  </button>
                ))}
              </div>
            </div>
            <label>
              目标会议/期刊
              <input value={draft.targetVenue ?? ''} onChange={(event) => updateDraft('targetVenue', event.target.value)} placeholder="可留空" />
            </label>
          </div>
          <label>
            关键词
            <textarea value={keywordsText} onChange={(event) => setKeywordsText(event.target.value)} placeholder="一行一个，或用逗号分隔" />
          </label>
          <label>
            相关论文
            <textarea value={papersText} onChange={(event) => setPapersText(event.target.value)} placeholder="标题、DOI、arXiv ID 或备注" />
          </label>
          <label>
            实验目录
            <input value={draft.experimentPath ?? ''} onChange={(event) => updateDraft('experimentPath', event.target.value)} placeholder="可选：本地实验目录或日志路径" />
          </label>
          <label>
            当前问题
            <textarea value={draft.currentQuestion ?? ''} onChange={(event) => updateDraft('currentQuestion', event.target.value)} placeholder="现在最想推进或卡住的问题" />
          </label>
          <div className="research-actions">
            <button type="button" onClick={submitProject} disabled={busy || !(draft.name ?? '').trim()}>
              {busy ? '保存中...' : '保存并分析'}
            </button>
            {activeProject ? (
              <button type="button" onClick={() => onDelete(activeProject.id)} disabled={busy}>
                删除
              </button>
            ) : null}
          </div>
        </section>

        <section className="research-insights">
          <div className="research-summary">
            <span>{stageLabel(response, activeProject?.stage)}</span>
            <h2>{activeProject?.name ?? '创建一个科研项目'}</h2>
            <p>{analysis?.summary ?? '填写项目档案后，Skill Universe 会基于本地规则生成项目航线、缺口和下一步行动。'}</p>
            <small>{response?.meta.privacy ?? '不需要 API key；项目档案只保存在本项目目录。'}</small>
          </div>

          {activeRoute ? (
            <article className="research-route-card">
              <div>
                <strong>{activeRoute.title}</strong>
                <span>完整度 {activeRoute.completeness}%</span>
              </div>
              <p>{activeRoute.rationale}</p>
              <div className="research-route-steps">
                {activeRoute.steps.map((step, index) => (
                  <button key={step.skillId} type="button" onClick={() => onSelectSkill(step.skillId)}>
                    <b>{String(index + 1).padStart(2, '0')}</b>
                    <span>{step.name}</span>
                    <small>{step.purpose}</small>
                  </button>
                ))}
              </div>
              <button className="research-route-open" type="button" onClick={() => onSelectRoute(activeRoute.skillIds)}>
                打开这条科研航线
              </button>
            </article>
          ) : null}

          <div className="research-section-grid">
            <section>
              <h3>项目缺口</h3>
              <div className="research-gap-list">
                {analysis?.gaps.length ? analysis.gaps.map((gap) => (
                  <article key={gap.id} data-severity={gap.severity}>
                    <strong>{gap.label}</strong>
                    <p>{gap.reason}</p>
                    <small>{gap.action}</small>
                    <div>
                      {gap.skillIds.slice(0, 3).map((skillId) => {
                        const skill = skillsById.get(skillId);
                        return skill ? (
                          <button key={skillId} type="button" onClick={() => onSelectSkill(skillId)}>{skill.displayName}</button>
                        ) : null;
                      })}
                    </div>
                  </article>
                )) : <p className="muted">暂无明显项目缺口。</p>}
              </div>
            </section>

            <section>
              <h3>下一步行动</h3>
              <div className="research-next-list">
                {analysis?.nextActions.map((action) => (
                  <button key={action.id} type="button" onClick={() => action.skillIds[0] && onSelectSkill(action.skillIds[0])}>
                    <strong>{action.title}</strong>
                    <span>{action.detail}</span>
                  </button>
                )) ?? <p className="muted">保存项目后生成行动建议。</p>}
              </div>
            </section>
          </div>

          <section className="research-evidence">
            <h3>证据链</h3>
            <div>
              {analysis?.evidence.map((claim) => (
                <article key={claim.id} data-status={claim.status}>
                  <span>{claim.status}</span>
                  <strong>{claim.text}</strong>
                  <p>{claim.evidence}</p>
                  {claim.notes ? <small>{claim.notes}</small> : null}
                </article>
              )) ?? <p className="muted">保存项目后生成证据链提示。</p>}
            </div>
          </section>
        </section>
      </div>
    </section>
  );
}

function SkillChangeBanner({
  notice,
  busy,
  onApply,
  onOpenComparison,
  onDismiss
}: {
  notice: SkillChangeNotice;
  busy: boolean;
  onApply: () => void;
  onOpenComparison: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="change-banner" aria-label="Skill 目录变化提示">
      <div>
        <strong>{changeNoticeTitle(notice)}</strong>
        <p>{notice.comparison?.summary ?? changeNoticeDetail(notice)}</p>
      </div>
      <div className="change-actions">
        {notice.comparison ? (
          <button type="button" onClick={onOpenComparison} disabled={busy}>
            查看对比
          </button>
        ) : null}
        <button type="button" onClick={onApply} disabled={busy}>
          {busy ? '更新中' : '更新星域'}
        </button>
        <button type="button" onClick={onDismiss} disabled={busy}>
          稍后
        </button>
      </div>
    </section>
  );
}

function NewSkillComparisonPanel({
  notice,
  universe,
  skillsById,
  onApply,
  onSelectSkill,
  onSelectWorkflow,
  onClose
}: {
  notice: SkillChangeNotice;
  universe: SkillUniverseResponse;
  skillsById: Map<string, SkillNode>;
  onApply: () => void;
  onSelectSkill: (skillId: string) => void;
  onSelectWorkflow: (workflowId: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState<PanelPosition | undefined>();
  const comparison = notice.comparison;
  if (!comparison) return null;
  const firstKnownNewSkill = comparison.newSkillIds.find((id) => skillsById.has(id));
  const knownWorkflow = comparison.workflowIds.find((id) => universe.insights.some((insight) => insight.id === id));

  return (
    <section className="comparison-panel" role="dialog" aria-label="新 skill 对比报告" ref={panelRef} style={panelStyle(position, true)}>
      <div className="comparison-head window-heading" onPointerDown={(event) => startPanelDrag(event, panelRef, false, setPosition)}>
        <div>
          <span className="workflow-kicker">
            <Sparkles size={15} />
            新 skill 对比报告
          </span>
          <h2>{changeNoticeTitle(notice)}</h2>
          <p>{comparison.summary}</p>
        </div>
        <button className="workflow-close" type="button" onClick={onClose} aria-label="关闭新 skill 对比报告">×</button>
      </div>
      <div className="comparison-grid">
        <article>
          <strong>补上的空白区</strong>
          <p>{comparison.filledGapIds.length ? comparison.filledGapIds.join('、') : '暂未命中特定空白区，但仍可能扩展现有星区。'}</p>
        </article>
        <article>
          <strong>相似本地 skill</strong>
          <p>{comparison.similarSkillIds.length ? comparison.similarSkillIds.map((id) => skillsById.get(id)?.displayName ?? id).join('、') : '没有发现明显重复项。'}</p>
        </article>
        <article>
          <strong>可接入航线</strong>
          <p>{comparison.workflowIds.length ? comparison.workflowIds.join('、') : '暂未匹配已有航线。'}</p>
        </article>
      </div>
      <div className="comparison-actions">
        <button type="button" onClick={onApply}>更新星域</button>
        <button type="button" onClick={() => firstKnownNewSkill ? onSelectSkill(firstKnownNewSkill) : onApply()}>查看详情</button>
        <button type="button" onClick={() => knownWorkflow ? onSelectWorkflow(knownWorkflow) : onApply()}>加入航线</button>
      </div>
    </section>
  );
}

function TimelinePanel({
  events,
  pinned,
  position,
  zIndex,
  onPositionChange,
  onActivate,
  onMinimize,
  onTogglePinned,
  onHide,
  onClear
}: {
  events: SkillUniverseTimelineEvent[];
  pinned: boolean;
  position?: PanelPosition;
  zIndex?: number;
  onPositionChange: (position: PanelPosition) => void;
  onActivate: () => void;
  onMinimize: () => void;
  onTogglePinned: () => void;
  onHide: () => void;
  onClear: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [filter, setFilter] = useState<'all' | SkillUniverseTimelineEvent['type']>('all');
  const filtered = filter === 'all' ? events : events.filter((event) => event.type === filter);
  const eventTypes = [...new Set(events.map((event) => event.type))];

  return (
    <section className="timeline-panel" data-pinned={pinned} ref={panelRef} aria-label="Skill 时间轴" style={panelStyle(position, false, zIndex)} onPointerDownCapture={onActivate}>
      <div className="timeline-head window-heading" onPointerDown={(event) => startPanelDrag(event, panelRef, pinned, onPositionChange)}>
        <span className="heading-title">
          <History size={18} />
          <span>时间轴</span>
        </span>
        <WindowControls pinned={pinned} onTogglePinned={onTogglePinned} onMinimize={onMinimize} onHide={onHide} hideLabel="隐藏时间轴窗口" />
      </div>
      <div className="timeline-tools">
        <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="时间轴类型筛选">
          <option value="all">全部事件</option>
          {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <button type="button" onClick={onClear}>清空</button>
      </div>
      <VirtualList
        items={filtered}
        itemHeight={132}
        height={Math.min(380, Math.max(180, window.innerHeight - 260))}
        className="timeline-list virtual-list"
        empty={<p className="muted">还没有记录。</p>}
        renderItem={(event) => (
          <article key={event.id}>
            <span>{event.type}</span>
            <strong>{event.title}</strong>
            <p>{event.detail}</p>
            <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
          </article>
        )}
      />
    </section>
  );
}

function parseCommandQuery(query: string) {
  const filters: Record<string, string> = {};
  const free: string[] = [];
  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    const match = token.match(/^([a-zA-Z]+):(.+)$/);
    if (match) filters[match[1].toLowerCase()] = match[2].toLowerCase();
    else free.push(token);
  }
  return {
    text: free.join(' ').toLowerCase(),
    filters
  };
}

function CommandPalette({
  open,
  universe,
  recommendations,
  researchMission,
  tags,
  onClose,
  onSelectSkill,
  onSelectCluster,
  onSelectMission,
  onOpenResearchProject,
  onCreateInstallPlan,
  onUpdateTags
}: {
  open: boolean;
  universe: SkillUniverseResponse;
  recommendations: SkillRecommendationResponse | null;
  researchMission: ResearchMissionResponse | null;
  tags: SkillTagMap;
  onClose: () => void;
  onSelectSkill: (skillId: string) => void;
  onSelectCluster: (clusterId: string) => void;
  onSelectMission: (insight: Insight) => void;
  onOpenResearchProject: (projectId: string) => void;
  onCreateInstallPlan: (candidate: SkillCandidate) => void;
  onUpdateTags: (skillId: string, tags: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const results = useMemo(() => {
    const parsed = parseCommandQuery(query);
    const skillsById = new Map(universe.skills.map((skill) => [skill.id, skill]));
    const grouped: Array<{
      label: string;
      items: Array<{
      id: string;
      type: 'skill' | 'candidate' | 'cluster' | 'mission' | 'tag' | 'health' | 'project';
      title: string;
      subtitle: string;
      actionLabel: string;
      run: () => void;
      actions?: Array<{ label: string; run: () => void }>;
      }>;
    }> = [
      { label: '本地 skill', items: [] },
      { label: '航线', items: [] },
      { label: '星区', items: [] },
      { label: '推荐候选', items: [] },
      { label: '科研项目', items: [] },
      { label: '标签', items: [] },
      { label: '健康问题', items: [] }
    ];
    const add = (label: string, item: (typeof grouped)[number]['items'][number]) => {
      grouped.find((group) => group.label === label)?.items.push(item);
    };

    function matches(text: string) {
      return !parsed.text || text.toLowerCase().includes(parsed.text);
    }

    function skillMatchesFilters(skill: SkillNode) {
      const skillTags = tags[skill.id] ?? [];
      const clusterLabel = clusterName(universe.clusters, skill.clusterId).toLowerCase();
      const domainText = [...skill.domains, clusterLabel].join(' ').toLowerCase();
      const has = parsed.filters.has;
      if (parsed.filters.tag && !skillTags.some((tag) => tag.toLowerCase().includes(parsed.filters.tag))) return false;
      if (parsed.filters.health && skill.health.level !== parsed.filters.health) return false;
      if (parsed.filters.domain && !domainText.includes(parsed.filters.domain)) return false;
      if (parsed.filters.source && skill.source !== parsed.filters.source) return false;
      if (has) {
        const ok =
          (['script', 'scripts'].includes(has) && skill.resources.scripts.length > 0) ||
          (['reference', 'references'].includes(has) && skill.resources.references.length > 0) ||
          (['asset', 'assets'].includes(has) && skill.resources.assets.length > 0) ||
          (['agent', 'agents'].includes(has) && skill.resources.agents) ||
          (['resource', 'resources'].includes(has) && resourceCount(skill) > 0);
        if (!ok) return false;
      }
      return true;
    }

    for (const skill of universe.skills) {
      const tagText = (tags[skill.id] ?? []).join(' ');
      const text = [
        skill.name,
        skill.displayName,
        skill.description,
        skill.domains.join(' '),
        skill.triggerTerms.join(' '),
        skill.health.issues.join(' '),
        tagText
      ].join(' ');
      if (!skillMatchesFilters(skill) || !matches(text)) continue;
      add('本地 skill', {
        id: `skill-${skill.id}`,
        type: 'skill',
        title: skill.displayName,
        subtitle: `${clusterName(universe.clusters, skill.clusterId)} · 健康 ${skill.health.score}${tagText ? ` · ${tagText}` : ''}`,
        actionLabel: '定位星球',
        run: () => onSelectSkill(skill.id),
        actions: [
          { label: '打开详情', run: () => onSelectSkill(skill.id) },
          {
            label: '加常用',
            run: () => onUpdateTags(skill.id, [...new Set([...(tags[skill.id] ?? []), '常用'])])
          }
        ]
      });

      if (skill.health.issues.length && (!parsed.filters.health || skill.health.level === parsed.filters.health)) {
        add('健康问题', {
          id: `health-${skill.id}`,
          type: 'health',
          title: `${skill.displayName} · ${skill.health.level}`,
          subtitle: skill.health.issues.slice(0, 2).join('；') || '健康分偏低',
          actionLabel: '查看详情',
          run: () => onSelectSkill(skill.id)
        });
      }
    }

    for (const cluster of universe.clusters) {
      if (parsed.filters.domain && !`${cluster.id} ${cluster.label}`.toLowerCase().includes(parsed.filters.domain)) continue;
      if (!matches(`${cluster.label} ${cluster.description}`)) continue;
      add('星区', {
        id: `cluster-${cluster.id}`,
        type: 'cluster',
        title: cluster.label,
        subtitle: `${cluster.skillIds.length} 个 skill`,
        actionLabel: '打开星区',
        run: () => onSelectCluster(cluster.id)
      });
    }

    for (const insight of universe.insights) {
      const text = `${insight.title} ${insight.rationale} ${skillNames(insight.skillIds, skillsById)}`;
      if (!matches(text)) continue;
      add('航线', {
        id: `mission-${insight.id}`,
        type: 'mission',
        title: insight.title,
        subtitle: insight.rationale,
        actionLabel: '打开航线',
        run: () => onSelectMission(insight)
      });
    }

    for (const candidate of recommendations?.candidates ?? []) {
      if (parsed.filters.source && parsed.filters.source !== 'clawhub') continue;
      if (parsed.filters.tag || parsed.filters.health || parsed.filters.has) continue;
      if (parsed.filters.domain && !candidate.gapLabel.toLowerCase().includes(parsed.filters.domain)) continue;
      if (!matches(`${candidate.name} ${candidate.slug} ${candidate.summary} ${candidate.gapLabel}`)) continue;
      add('推荐候选', {
        id: `candidate-${candidate.slug}`,
        type: 'candidate',
        title: candidate.name,
        subtitle: `${candidate.gapLabel} · ${candidate.stars} stars · ${candidate.downloads} 下载`,
        actionLabel: '安装方案',
        run: () => onCreateInstallPlan(candidate)
      });
    }

    for (const project of researchMission?.projects ?? []) {
      const text = [
        project.name,
        project.direction,
        project.targetVenue,
        project.currentQuestion,
        project.keywords.join(' '),
        project.papers.join(' ')
      ].join(' ');
      if (parsed.filters.source || parsed.filters.tag || parsed.filters.health || parsed.filters.has) continue;
      if (parsed.filters.domain && !project.direction.toLowerCase().includes(parsed.filters.domain)) continue;
      if (!matches(text)) continue;
      add('科研项目', {
        id: `project-${project.id}`,
        type: 'project',
        title: project.name,
        subtitle: `${stageLabel(researchMission, project.stage)} · ${project.keywords.slice(0, 3).join('、') || '暂无关键词'}`,
        actionLabel: '打开项目',
        run: () => onOpenResearchProject(project.id)
      });
    }

    const tagSet = new Set(Object.values(tags).flat());
    for (const tag of tagSet) {
      if (parsed.filters.tag && !tag.toLowerCase().includes(parsed.filters.tag)) continue;
      if (!matches(tag)) continue;
      const count = Object.values(tags).filter((skillTags) => skillTags.includes(tag)).length;
      add('标签', {
        id: `tag-${tag}`,
        type: 'tag',
        title: tag,
        subtitle: `${count} 个 skill 使用这个标签`,
        actionLabel: '搜索标签',
        run: () => setQuery(`tag:${tag}`)
      });
    }

    return grouped
      .map((group) => ({ ...group, items: group.items.slice(0, 18) }))
      .filter((group) => group.items.length > 0);
  }, [onCreateInstallPlan, onOpenResearchProject, onSelectCluster, onSelectMission, onSelectSkill, onUpdateTags, query, recommendations, researchMission, tags, universe]);

  const firstResult = results[0]?.items[0];

  if (!open) return null;

  return (
    <div className="command-backdrop" role="dialog" aria-label="Skill 搜索与命令面板">
      <section className="command-palette">
        <div className="command-search">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
              if (event.key === 'Enter' && firstResult) {
                firstResult.run();
                onClose();
              }
            }}
            placeholder="搜索 skill，或输入 tag:常用 health:risk source:plugin has:script"
          />
          <button type="button" onClick={onClose}>关闭</button>
        </div>
        <div className="command-group-list">
          {results.length ? results.map((group) => (
            <section className="command-group" key={group.label}>
              <h3>{group.label}</h3>
              {group.items.map((item) => (
                <div className="command-result-row" key={item.id}>
                  <button
                    type="button"
                    className="command-result"
                    onClick={() => {
                      item.run();
                      onClose();
                    }}
                  >
                    <span>
                      <b>{item.title}</b>
                      <small>{item.subtitle}</small>
                    </span>
                    <em>{item.actionLabel}</em>
                  </button>
                  {item.actions?.length ? (
                    <div className="command-result-actions">
                      {item.actions.map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          onClick={() => {
                            action.run();
                            onClose();
                          }}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </section>
          )) : <p className="muted">没有匹配结果。</p>}
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [universe, setUniverse] = useState<SkillUniverseResponse | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [activeClusterIds, setActiveClusterIds] = useState<Set<string>>(new Set());
  const [activeInsightId, setActiveInsightId] = useState<string | null>(null);
  const [projectRouteSkillIds, setProjectRouteSkillIds] = useState<string[]>([]);
  const [layout, setLayout] = useState<SkillUniverseLayoutState>(() => loadLayoutState());
  const [layoutSnapshots, setLayoutSnapshots] = useState<LayoutSnapshot[]>(() => loadLayoutSnapshots());
  const [skillTags, setSkillTags] = useState<SkillTagMap>(() => loadSkillTags());
  const [timeline, setTimeline] = useState<SkillUniverseTimelineEvent[]>(() => loadTimeline());
  const [recommendations, setRecommendations] = useState<SkillRecommendationResponse | null>(null);
  const [researchMission, setResearchMission] = useState<ResearchMissionResponse | null>(null);
  const [installPlan, setInstallPlan] = useState<InstallPlan | null>(null);
  const [selectedInstallCandidate, setSelectedInstallCandidate] = useState<SkillCandidate | null>(null);
  const [installCheckResult, setInstallCheckResult] = useState<InstallCheckResult | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [recommendationBusy, setRecommendationBusy] = useState<'load' | 'refresh' | 'plan' | 'check' | null>(null);
  const [deepAudits, setDeepAudits] = useState<Record<string, DeepAuditReport>>({});
  const [deepAuditBusySlug, setDeepAuditBusySlug] = useState<string | null>(null);
  const [skillChangeNotice, setSkillChangeNotice] = useState<SkillChangeNotice | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [focusVersion, setFocusVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'refresh' | 'embedding' | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [message, setMessage] = useState<string>('');
  const layoutSaveTimer = useRef<number | null>(null);
  const timelineSaveTimer = useRef<number | null>(null);

  function recordEvent(type: SkillUniverseTimelineEvent['type'], title: string, detail: string) {
    setTimeline((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type,
        title,
        detail,
        createdAt: new Date().toISOString()
      },
      ...current
    ].slice(0, 200));
  }

  function updatePanelVisibility(panel: PanelId, value: boolean | ((current: boolean) => boolean)) {
    setLayout((current) => {
      const nextVisible = typeof value === 'function' ? value(current.visible[panel]) : value;
      return {
        ...current,
        activeSnapshotId: undefined,
        visible: {
          ...current.visible,
          [panel]: nextVisible
        },
        minimized: {
          ...current.minimized,
          [panel]: false
        },
        zOrder: nextVisible ? frontPanelZOrder(current.zOrder, panel) : current.zOrder
      };
    });
  }

  function togglePanel(panel: PanelId) {
    const opening = !layout.visible[panel] || Boolean(layout.minimized[panel]);
    if (panel === 'recommendations' && opening && !recommendations && !recommendationBusy) {
      void loadRecommendations(false);
    }
    if (panel === 'researchMission' && opening && !researchMission && !projectBusy) {
      void loadResearchMission();
    }
    setLayout((current) => {
      const shouldOpen = !current.visible[panel] || Boolean(current.minimized[panel]);
      return {
        ...current,
        activeSnapshotId: undefined,
        visible: { ...current.visible, [panel]: shouldOpen },
        minimized: { ...current.minimized, [panel]: false },
        zOrder: shouldOpen ? frontPanelZOrder(current.zOrder, panel) : current.zOrder
      };
    });
  }

  function updatePanelPinned(panel: PanelId) {
    setLayout((current) => ({
      ...current,
      pinned: { ...current.pinned, [panel]: !current.pinned[panel] }
    }));
  }

  function updatePanelPosition(panel: PanelId, position: PanelPosition) {
    setLayout((current) => ({
      ...current,
      positions: { ...current.positions, [panel]: position }
    }));
  }

  function bringPanelToFront(panel: PanelId) {
    setLayout((current) => ({
      ...current,
      zOrder: frontPanelZOrder(current.zOrder, panel)
    }));
  }

  function minimizePanel(panel: PanelId) {
    setLayout((current) => ({
      ...current,
      activeSnapshotId: undefined,
      visible: { ...current.visible, [panel]: true },
      minimized: { ...current.minimized, [panel]: true },
      zOrder: frontPanelZOrder(current.zOrder, panel)
    }));
  }

  function restorePanel(panel: PanelId) {
    if (panel === 'recommendations' && !recommendations && !recommendationBusy) {
      void loadRecommendations(false);
    }
    if (panel === 'researchMission' && !researchMission && !projectBusy) {
      void loadResearchMission();
    }
    setLayout((current) => ({
      ...current,
      activeSnapshotId: undefined,
      visible: { ...current.visible, [panel]: true },
      minimized: { ...current.minimized, [panel]: false },
      zOrder: frontPanelZOrder(current.zOrder, panel)
    }));
  }

  function hidePanel(panel: PanelId) {
    setLayout((current) => ({
      ...current,
      activeSnapshotId: undefined,
      visible: { ...current.visible, [panel]: false },
      minimized: { ...current.minimized, [panel]: false }
    }));
  }

  function hideAllPanels() {
    setLayout((current) => ({
      ...current,
      activeSnapshotId: undefined,
      lastVisible: current.visible,
      visible: allPanelsVisible(false),
      minimized: {}
    }));
    recordEvent('layout', '隐藏全部面板', '已保存隐藏前的面板组合，可从面板菜单恢复。');
  }

  function restoreLastPanels() {
    setLayout((current) => ({
      ...current,
      activeSnapshotId: undefined,
      visible: current.lastVisible ?? DEFAULT_LAYOUT.visible,
      minimized: {}
    }));
    recordEvent('layout', '恢复上次面板', '已恢复隐藏前的面板显隐组合。');
  }

  function applyPreset(preset: LayoutPreset) {
    const next = {
      ...PRESET_LAYOUTS[preset],
      performanceMode: layout.performanceMode,
      activeSnapshotId: undefined,
      visible: {
        ...PRESET_LAYOUTS[preset].visible,
        installConsole: preset === 'install' ? Boolean(selectedInstallCandidate) : PRESET_LAYOUTS[preset].visible.installConsole
      }
    };
    setLayout(next);
    recordEvent('layout', `切换到${PRESET_LABELS[preset]}`, '布局显隐、固定状态和窗口坐标已应用。');
  }

  function resetLayout() {
    setLayout(DEFAULT_LAYOUT);
    if (universe) setActiveClusterIds(new Set(universe.clusters.map((cluster) => cluster.id)));
    setShowComparison(false);
    recordEvent('layout', '恢复默认布局', '恢复默认坐标、显隐、固定状态和星区筛选。');
  }

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const payload = await fetchSkills();
      setUniverse(payload);
      setActiveClusterIds(new Set(payload.clusters.map((cluster) => cluster.id)));
      void loadResearchMission(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadResearchMission(showMessage = false) {
    setProjectBusy(true);
    try {
      const payload = await fetchResearchProjects();
      setResearchMission(payload);
      if (showMessage) setMessage(payload.activeProject ? '科研任务已更新' : '科研任务模式已打开');
    } catch (error) {
      if (showMessage) setMessage(error instanceof Error ? error.message : '科研任务加载失败');
    } finally {
      setProjectBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (layoutSaveTimer.current) window.clearTimeout(layoutSaveTimer.current);
    layoutSaveTimer.current = window.setTimeout(() => {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
      layoutSaveTimer.current = null;
    }, 180);
    return () => {
      if (layoutSaveTimer.current) window.clearTimeout(layoutSaveTimer.current);
    };
  }, [layout]);

  useEffect(() => {
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(layoutSnapshots.slice(0, 24)));
  }, [layoutSnapshots]);

  useEffect(() => {
    window.localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(skillTags));
  }, [skillTags]);

  useEffect(() => {
    if (timelineSaveTimer.current) window.clearTimeout(timelineSaveTimer.current);
    timelineSaveTimer.current = window.setTimeout(() => {
      window.localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(timeline.slice(0, 200)));
      timelineSaveTimer.current = null;
    }, 280);
    return () => {
      if (timelineSaveTimer.current) window.clearTimeout(timelineSaveTimer.current);
    };
  }, [timeline]);

  useEffect(() => {
    const events = new EventSource('/api/skill-events');

    function handleSkillChange(event: MessageEvent) {
      try {
        const notice = JSON.parse(event.data) as SkillChangeNotice;
        setSkillChangeNotice(notice);
        setShowComparison(Boolean(notice.comparison));
        recordEvent('skill-change', changeNoticeTitle(notice), notice.comparison?.summary ?? changeNoticeDetail(notice));
      } catch {
        setMessage('检测到 skill 变化，但事件数据无法解析');
      }
    }

    function handleWatchError(event: MessageEvent) {
      try {
        const payload = JSON.parse(event.data) as { error?: string };
        setMessage(payload.error ?? 'skill 目录监听出错');
      } catch {
        setMessage('skill 目录监听出错');
      }
    }

    events.addEventListener('skill-change', handleSkillChange);
    events.addEventListener('watch-error', handleWatchError);
    events.onerror = () => {
      setMessage('skill 目录监听暂时断开，刷新页面后会自动重连');
    };

    return () => {
      events.removeEventListener('skill-change', handleSkillChange);
      events.removeEventListener('watch-error', handleWatchError);
      events.close();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
      if (event.key === 'Escape') {
        document.querySelectorAll('.toolbar-menu[open]').forEach((element) => element.removeAttribute('open'));
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    function closeMenus(event: PointerEvent) {
      if ((event.target as HTMLElement | null)?.closest('.toolbar-menu')) return;
      document.querySelectorAll('.toolbar-menu[open]').forEach((element) => element.removeAttribute('open'));
    }
    window.addEventListener('pointerdown', closeMenus);
    return () => window.removeEventListener('pointerdown', closeMenus);
  }, []);

  const skillsById = useMemo(() => {
    return new Map((universe?.skills ?? []).map((skill) => [skill.id, skill]));
  }, [universe]);

  const selectedSkill = selectedSkillId ? skillsById.get(selectedSkillId) : undefined;
  const activeInsight = useMemo(
    () => universe?.insights.find((insight) => insight.id === activeInsightId),
    [activeInsightId, universe]
  );
  const activeRouteSkillIds = useMemo(() => activeInsight?.skillIds ?? projectRouteSkillIds, [activeInsight, projectRouteSkillIds]);

  function focusSkill(skillId: string) {
    const skill = skillsById.get(skillId);
    setSelectedSkillId(skillId);
    setFocusVersion((value) => value + 1);
    updatePanelVisibility('details', true);
    if (skill) {
      setActiveClusterIds((current) => new Set(current).add(skill.clusterId));
    }
  }

  function updateSkillTags(skillId: string, tags: string[]) {
    setSkillTags((current) => ({
      ...current,
      [skillId]: [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
    }));
  }

  function setPerformanceMode(mode: PerformanceMode) {
    setLayout((current) => ({ ...current, performanceMode: mode, activeSnapshotId: undefined }));
    recordEvent('layout', `切换性能模式：${PERFORMANCE_LABELS[mode]}`, '性能偏好已保存到浏览器本地。');
  }

  function saveLayoutSnapshot() {
    const now = new Date().toISOString();
    const name = window.prompt('给当前布局快照起个名字', `布局 ${layoutSnapshots.length + 1}`);
    if (!name?.trim()) return;
    const snapshot: LayoutSnapshot = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
      layoutState: { ...layout, activeSnapshotId: undefined }
    };
    setLayoutSnapshots((current) => [snapshot, ...current].slice(0, 24));
    setLayout((current) => ({ ...current, activeSnapshotId: snapshot.id }));
    recordEvent('layout', `保存布局快照：${snapshot.name}`, '面板显隐、坐标、固定状态和性能模式已保存。');
  }

  function applyLayoutSnapshot(snapshotId: string) {
    const snapshot = layoutSnapshots.find((item) => item.id === snapshotId);
    if (!snapshot) return;
    setLayout({ ...mergeLayout(snapshot.layoutState), activeSnapshotId: snapshot.id });
    recordEvent('layout', `应用布局快照：${snapshot.name}`, '已恢复这个快照里的面板布局和性能模式。');
  }

  function renameLayoutSnapshot(snapshotId: string) {
    const snapshot = layoutSnapshots.find((item) => item.id === snapshotId);
    if (!snapshot) return;
    const name = window.prompt('重命名布局快照', snapshot.name);
    if (!name?.trim()) return;
    setLayoutSnapshots((current) => current.map((item) => item.id === snapshotId ? { ...item, name: name.trim(), updatedAt: new Date().toISOString() } : item));
  }

  function deleteLayoutSnapshot(snapshotId: string) {
    setLayoutSnapshots((current) => current.filter((item) => item.id !== snapshotId));
    setLayout((current) => current.activeSnapshotId === snapshotId ? { ...current, activeSnapshotId: undefined } : current);
    recordEvent('layout', '删除布局快照', '已从浏览器本地删除该快照。');
  }

  function selectMission(insight: Insight) {
    setActiveInsightId(insight.id);
    setProjectRouteSkillIds([]);
    updatePanelVisibility('workflow', true);
    const firstSkill = insight.skillIds.find((id) => skillsById.has(id));
    if (firstSkill) focusSkill(firstSkill);
    setActiveClusterIds((current) => {
      const next = new Set(current);
      insight.skillIds.forEach((id) => {
        const skill = skillsById.get(id);
        if (skill) next.add(skill.clusterId);
      });
      return next;
    });
  }

  function selectProjectRoute(skillIds: string[]) {
    const validIds = skillIds.filter((id) => skillsById.has(id));
    setActiveInsightId(null);
    setProjectRouteSkillIds(validIds);
    updatePanelVisibility('researchMission', true);
    if (validIds[0]) focusSkill(validIds[0]);
    setActiveClusterIds((current) => {
      const next = new Set(current);
      validIds.forEach((id) => {
        const skill = skillsById.get(id);
        if (skill) next.add(skill.clusterId);
      });
      return next;
    });
    setMessage(validIds.length ? '科研航线已在星域中高亮' : '这条科研航线还没有匹配到本地 skill');
  }

  async function onSaveResearchProject(project: Partial<ResearchProject>) {
    setProjectBusy(true);
    setMessage('');
    try {
      const payload = await saveResearchProject(project);
      setResearchMission(payload);
      setMessage('科研项目已保存并重新分析');
      recordEvent('project', `保存科研项目：${payload.activeProject?.name ?? project.name ?? '未命名项目'}`, payload.analysis?.summary ?? '项目档案已更新。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '科研项目保存失败');
    } finally {
      setProjectBusy(false);
    }
  }

  async function onDeleteResearchProject(projectId: string) {
    if (!window.confirm('删除这个科研项目档案？不会影响本地 skills。')) return;
    setProjectBusy(true);
    setMessage('');
    try {
      const payload = await deleteResearchProject(projectId);
      setResearchMission(payload);
      setMessage('科研项目已删除');
      recordEvent('project', '删除科研项目', `已删除项目 ${projectId}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '科研项目删除失败');
    } finally {
      setProjectBusy(false);
    }
  }

  async function onSetActiveResearchProject(projectId: string) {
    if (!projectId) return;
    setProjectBusy(true);
    try {
      const payload = await setActiveResearchProject(projectId);
      setResearchMission(payload);
      setMessage(`已切换科研项目：${payload.activeProject?.name ?? projectId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '科研项目切换失败');
    } finally {
      setProjectBusy(false);
    }
  }

  async function onRefresh() {
    setBusy('refresh');
    setMessage('');
    try {
      const payload = await refreshSkills();
      setUniverse(payload);
      setActiveClusterIds(new Set(payload.clusters.map((cluster) => cluster.id)));
      setRecommendations(null);
      void loadResearchMission(false);
      setInstallPlan(null);
      setSelectedInstallCandidate(null);
      updatePanelVisibility('installConsole', false);
      setInstallCheckResult(null);
      setMessage('扫描已刷新');
      recordEvent('refresh', '手动刷新星域', `当前 ${payload.skills.length} 个 skill。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '刷新失败');
    } finally {
      setBusy(null);
    }
  }

  async function applyDetectedSkillChange() {
    setBusy('refresh');
    setMessage('');
    try {
      const payload =
        universe?.meta.apiKeyConfigured
          ? await refreshSkills()
          : await recomputeEmbeddings();
      setUniverse(payload);
      setActiveClusterIds(new Set(payload.clusters.map((cluster) => cluster.id)));
      setSkillChangeNotice(null);
      setShowComparison(false);
      setRecommendations(null);
      setInstallPlan(null);
      setSelectedInstallCandidate(null);
      updatePanelVisibility('installConsole', false);
      setInstallCheckResult(null);
      setMessage(
        universe?.meta.apiKeyConfigured
          ? '星域已更新；需要时可手动重算语义'
          : '星域已更新，并已使用本地语义重算'
      );
      recordEvent('refresh', '应用目录变化', `刷新后 ${payload.skills.length} 个 skill。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新星域失败');
    } finally {
      setBusy(null);
    }
  }

  async function onRecompute() {
    setBusy('embedding');
    setMessage('');
    try {
      const payload = await recomputeEmbeddings();
      setUniverse(payload);
      setRecommendations(null);
      setInstallPlan(null);
      setSelectedInstallCandidate(null);
      updatePanelVisibility('installConsole', false);
      setInstallCheckResult(null);
      setMessage(`语义已更新：${payload.recompute.model}，${payload.recompute.updated} 个重算，${payload.recompute.reused} 个复用`);
      recordEvent('semantic', '语义重算', `${payload.recompute.updated} 个重算，${payload.recompute.reused} 个复用。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '语义更新失败');
    } finally {
      setBusy(null);
    }
  }

  function toggleCluster(clusterId: string) {
    setActiveClusterIds((current) => {
      const next = new Set(current);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  }

  async function loadRecommendations(refresh = false) {
    setRecommendationBusy(refresh ? 'refresh' : 'load');
    setMessage('');
    try {
      const payload = refresh ? await refreshRecommendations() : await fetchRecommendations();
      setRecommendations(payload);
      setInstallPlan(null);
      setSelectedInstallCandidate(null);
      updatePanelVisibility('installConsole', false);
      setInstallCheckResult(null);
      setMessage(
        payload.status === 'online'
          ? `推荐雷达已更新：${payload.candidates.length} 个候选`
          : '推荐雷达离线可用：ClawHub 暂不可达，已显示缓存或离线候选'
      );
      recordEvent('recommendation', refresh ? '刷新推荐雷达' : '打开推荐雷达', `${payload.candidates.length} 个候选，${payload.gaps.length} 个空白区。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '推荐雷达加载失败');
    } finally {
      setRecommendationBusy(null);
    }
  }

  async function onCreateInstallPlan(candidate: SkillCandidate) {
    setSelectedInstallCandidate(candidate);
    updatePanelVisibility('installConsole', true);
    updatePanelVisibility('recommendations', true);
    setInstallCheckResult(null);
    setCopiedCommand(null);
    if (installPlan?.slug === candidate.slug) {
      setMessage('安装方案已打开，不会自动安装');
      return;
    }
    setRecommendationBusy('plan');
    setMessage('');
    try {
      const payload = await createInstallPlan(candidate.slug);
      setInstallPlan(payload);
      setMessage('安装方案已生成，不会自动安装');
      recordEvent('install-plan', `生成安装方案：${candidate.name}`, `${candidate.slug}，${candidate.stars} stars，${candidate.downloads} 下载。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '安装方案生成失败');
    } finally {
      setRecommendationBusy(null);
    }
  }

  async function onDeepAuditCandidate(candidate: SkillCandidate) {
    setDeepAuditBusySlug(candidate.slug);
    setMessage('');
    try {
      const report = await deepAuditCandidate(candidate.slug);
      setDeepAudits((current) => ({ ...current, [candidate.slug]: report }));
      setMessage('深度审查已完成');
      recordEvent('deep-audit', `深度审查：${candidate.name}`, `${report.summary} ${candidate.stars} stars，${candidate.downloads} 下载。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '深度审查失败');
    } finally {
      setDeepAuditBusySlug(null);
    }
  }

  async function copyInstallCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(command);
      setMessage('安装命令已复制');
      window.setTimeout(() => setCopiedCommand((current) => (current === command ? null : current)), 1800);
    } catch {
      setMessage('复制失败，请手动选择命令复制');
    }
  }

  async function onCheckInstallStatus() {
    if (!selectedInstallCandidate) return;
    setRecommendationBusy('check');
    setMessage('');
    try {
      const payload = await checkInstallStatus(selectedInstallCandidate.slug);
      setInstallCheckResult(payload);
      setMessage(payload.installed ? '已检测到 skill，可更新星域' : '还没有检测到安装文件');
      recordEvent('install-check', payload.installed ? '安装检测成功' : '安装检测未命中', `${payload.packageSlug}：${payload.nextAction}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '安装检测失败');
    } finally {
      setRecommendationBusy(null);
    }
  }

  if (loading) {
    return (
      <main className="shell loading-screen">
        <div className="loading-mark">
          <Sparkles size={32} />
          <span>正在点亮星域</span>
        </div>
      </main>
    );
  }

  if (!universe) {
    return (
      <main className="shell loading-screen">
        <div className="error-box">
          <Search size={28} />
          <h1>没有载入 skill 数据</h1>
          <p>{message}</p>
          <button type="button" onClick={() => void load()}>
            重试
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className="shell"
      data-missions-visible={layout.visible.missions}
      data-layout-preset={layout.preset}
      data-performance-mode={layout.performanceMode}
    >
      <SkillUniverse
        activeClusterIds={activeClusterIds}
        activeRouteSkillIds={activeRouteSkillIds}
        focusVersion={focusVersion}
        performanceMode={layout.performanceMode}
        selectedSkillId={selectedSkillId}
        universe={universe}
        onSelectSkill={focusSkill}
      />

      <header className="topbar">
        <div>
          <span className="app-mark">Codex</span>
          <h1>Skill Universe</h1>
          <p className="topbar-mode">{PRESET_LABELS[layout.preset]} · {PERFORMANCE_LABELS[layout.performanceMode]}</p>
        </div>
        <PanelLauncher
          layout={layout}
          snapshots={layoutSnapshots}
          activeWorkflow={Boolean(activeInsight)}
          hasInstallCandidate={Boolean(selectedInstallCandidate)}
          onTogglePanel={togglePanel}
          onApplyPreset={applyPreset}
          onSetPerformanceMode={setPerformanceMode}
          onSaveSnapshot={saveLayoutSnapshot}
          onApplySnapshot={applyLayoutSnapshot}
          onRenameSnapshot={renameLayoutSnapshot}
          onDeleteSnapshot={deleteLayoutSnapshot}
          onResetLayout={resetLayout}
          onHideAllPanels={hideAllPanels}
          onRestoreLastPanels={restoreLastPanels}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        />
        <StatusPill universe={universe} />
        <div className="top-actions">
          <button type="button" onClick={() => void onRefresh()} disabled={busy !== null}>
            <RefreshCw size={16} className={busy === 'refresh' ? 'spin' : ''} />
            刷新
          </button>
          <details className="toolbar-menu more-menu" data-menu="more">
            <summary>
              <SlidersHorizontal size={14} />
              <span>更多</span>
            </summary>
            <div className="toolbar-popover more-popover">
              <button type="button" onClick={() => void onRecompute()} disabled={busy !== null}>
                <BrainCircuit size={16} className={busy === 'embedding' ? 'spin' : ''} />
                重算语义
              </button>
              <button type="button" onClick={() => setCommandPaletteOpen(true)}>
                <Search size={16} />
                打开命令面板
              </button>
            </div>
          </details>
        </div>
      </header>

      <MiniPanelBar layout={layout} onRestore={restorePanel} />

      {skillChangeNotice ? (
        <SkillChangeBanner
          notice={skillChangeNotice}
          busy={busy === 'refresh'}
          onApply={() => void applyDetectedSkillChange()}
          onOpenComparison={() => setShowComparison(true)}
          onDismiss={() => {
            setSkillChangeNotice(null);
            setShowComparison(false);
          }}
        />
      ) : null}

      {showComparison && skillChangeNotice?.comparison ? (
        <NewSkillComparisonPanel
          notice={skillChangeNotice}
          universe={universe}
          skillsById={skillsById}
          onApply={() => void applyDetectedSkillChange()}
          onSelectSkill={(skillId) => {
            focusSkill(skillId);
          }}
          onSelectWorkflow={(workflowId) => {
            const insight = universe.insights.find((item) => item.id === workflowId);
            if (insight) selectMission(insight);
          }}
          onClose={() => setShowComparison(false)}
        />
      ) : null}

      {layout.visible.clusters && !layout.minimized.clusters ? (
        <ClusterDock
          clusters={universe.clusters}
          activeClusterIds={activeClusterIds}
          pinned={layout.pinned.clusters}
          position={layout.positions.clusters}
          zIndex={layout.zOrder.clusters}
          onPositionChange={(position) => updatePanelPosition('clusters', position)}
          onToggle={toggleCluster}
          onActivate={() => bringPanelToFront('clusters')}
          onMinimize={() => minimizePanel('clusters')}
          onTogglePinned={() => updatePanelPinned('clusters')}
          onHide={() => hidePanel('clusters')}
        />
      ) : null}

      {layout.visible.recommendations && !layout.minimized.recommendations ? (
        <RecommendationRadar
          recommendations={recommendations}
          skillsById={skillsById}
          activePlanSlug={selectedInstallCandidate?.slug ?? null}
          deepAudits={deepAudits}
          deepAuditBusySlug={deepAuditBusySlug}
          busy={recommendationBusy !== null}
          pinned={layout.pinned.recommendations}
          position={layout.positions.recommendations}
          zIndex={layout.zOrder.recommendations}
          onPositionChange={(position) => updatePanelPosition('recommendations', position)}
          onRefresh={() => void loadRecommendations(true)}
          onCreateInstallPlan={(candidate) => void onCreateInstallPlan(candidate)}
          onDeepAudit={(candidate) => void onDeepAuditCandidate(candidate)}
          onActivate={() => bringPanelToFront('recommendations')}
          onMinimize={() => minimizePanel('recommendations')}
          onTogglePinned={() => updatePanelPinned('recommendations')}
          onHide={() => hidePanel('recommendations')}
        />
      ) : null}

      {layout.visible.researchMission && !layout.minimized.researchMission ? (
        <ResearchMissionPanel
          response={researchMission}
          skillsById={skillsById}
          busy={projectBusy}
          pinned={layout.pinned.researchMission}
          position={layout.positions.researchMission}
          zIndex={layout.zOrder.researchMission}
          onPositionChange={(position) => updatePanelPosition('researchMission', position)}
          onActivate={() => bringPanelToFront('researchMission')}
          onMinimize={() => minimizePanel('researchMission')}
          onTogglePinned={() => updatePanelPinned('researchMission')}
          onHide={() => hidePanel('researchMission')}
          onSave={(project) => void onSaveResearchProject(project)}
          onDelete={(projectId) => void onDeleteResearchProject(projectId)}
          onSetActive={(projectId) => void onSetActiveResearchProject(projectId)}
          onSelectSkill={focusSkill}
          onSelectRoute={selectProjectRoute}
        />
      ) : null}

      {layout.visible.installConsole && !layout.minimized.installConsole && selectedInstallCandidate ? (
        <InstallConsole
          candidate={selectedInstallCandidate}
          plan={installPlan}
          checkResult={installCheckResult}
          busy={recommendationBusy === 'plan' || recommendationBusy === 'check' ? recommendationBusy : null}
          copiedCommand={copiedCommand}
          pinned={layout.pinned.installConsole}
          position={layout.positions.installConsole}
          zIndex={layout.zOrder.installConsole}
          onPositionChange={(position) => updatePanelPosition('installConsole', position)}
          onCopyCommand={(command) => void copyInstallCommand(command)}
          onCheckInstall={() => void onCheckInstallStatus()}
          onActivate={() => bringPanelToFront('installConsole')}
          onMinimize={() => minimizePanel('installConsole')}
          onTogglePinned={() => updatePanelPinned('installConsole')}
          onClose={() => hidePanel('installConsole')}
        />
      ) : null}

      {layout.visible.details && !layout.minimized.details ? (
        <SkillDetail
          selected={selectedSkill}
          skillsById={skillsById}
          universe={universe}
          tags={selectedSkillId ? skillTags[selectedSkillId] ?? [] : []}
          pinned={layout.pinned.details}
          position={layout.positions.details}
          zIndex={layout.zOrder.details}
          onPositionChange={(position) => updatePanelPosition('details', position)}
          onUpdateTags={updateSkillTags}
          onSelectSkill={focusSkill}
          onActivate={() => bringPanelToFront('details')}
          onMinimize={() => minimizePanel('details')}
          onTogglePinned={() => updatePanelPinned('details')}
          onHide={() => hidePanel('details')}
        />
      ) : null}

      <WorkflowPanel
        insight={activeInsight}
        selectedSkillId={selectedSkillId}
        visible={layout.visible.workflow && !layout.minimized.workflow}
        restoreButton={(layout.preset === 'research' || layout.preset === 'install') && !layout.minimized.workflow}
        pinned={layout.pinned.workflow}
        position={layout.positions.workflow}
        zIndex={layout.zOrder.workflow}
        skillsById={skillsById}
        onPositionChange={(position) => updatePanelPosition('workflow', position)}
        onSelectStep={focusSkill}
        onActivate={() => bringPanelToFront('workflow')}
        onMinimize={() => minimizePanel('workflow')}
        onTogglePinned={() => updatePanelPinned('workflow')}
        onClose={() => setActiveInsightId(null)}
        onShow={() => updatePanelVisibility('workflow', true)}
      />

      {layout.visible.missions && !layout.minimized.missions ? (
        <MissionDeck
          activeInsightId={activeInsightId}
          insights={universe.insights}
          skillsById={skillsById}
          pinned={layout.pinned.missions}
          position={layout.positions.missions}
          zIndex={layout.zOrder.missions}
          onPositionChange={(position) => updatePanelPosition('missions', position)}
          onSelectMission={selectMission}
          onActivate={() => bringPanelToFront('missions')}
          onMinimize={() => minimizePanel('missions')}
          onTogglePinned={() => updatePanelPinned('missions')}
          onHide={() => hidePanel('missions')}
        />
      ) : null}

      {layout.visible.timeline && !layout.minimized.timeline ? (
        <TimelinePanel
          events={timeline}
          pinned={layout.pinned.timeline}
          position={layout.positions.timeline}
          zIndex={layout.zOrder.timeline}
          onPositionChange={(position) => updatePanelPosition('timeline', position)}
          onActivate={() => bringPanelToFront('timeline')}
          onMinimize={() => minimizePanel('timeline')}
          onTogglePinned={() => updatePanelPinned('timeline')}
          onHide={() => hidePanel('timeline')}
          onClear={() => {
            setTimeline([]);
            setMessage('时间轴已清空');
          }}
        />
      ) : null}

      <CommandPalette
        open={commandPaletteOpen}
        universe={universe}
        recommendations={recommendations}
        researchMission={researchMission}
        tags={skillTags}
        onClose={() => setCommandPaletteOpen(false)}
        onSelectSkill={focusSkill}
        onSelectCluster={(clusterId) => {
          setActiveClusterIds((current) => new Set(current).add(clusterId));
          updatePanelVisibility('clusters', true);
        }}
        onSelectMission={selectMission}
        onOpenResearchProject={(projectId) => {
          void onSetActiveResearchProject(projectId);
          updatePanelVisibility('researchMission', true);
        }}
        onCreateInstallPlan={(candidate) => void onCreateInstallPlan(candidate)}
        onUpdateTags={updateSkillTags}
      />

      {message ? <div className="toast">{message}</div> : null}
    </main>
  );
}
