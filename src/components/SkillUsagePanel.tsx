import { BarChart3, Minus, Pin, PinOff, Plus, RefreshCw, RotateCcw, X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { PanelPosition, SkillNode, SkillUsageItem } from '../types';

interface SkillUsagePanelProps {
  skills: SkillNode[];
  usageItems: SkillUsageItem[];
  busy: boolean;
  pinned: boolean;
  position?: PanelPosition;
  zIndex?: number;
  onSelectSkill: (skillId: string) => void;
  onRecordSkill: (skillId: string) => void;
  onResetSkill: (skillId: string) => void;
  onRefresh: () => void;
  onActivate: () => void;
  onMinimize: () => void;
  onTogglePinned: () => void;
  onHide: () => void;
  onPositionChange: (position: PanelPosition) => void;
}

function panelStyle(position?: PanelPosition, zIndex?: number): CSSProperties | undefined {
  if (!position && !zIndex) return undefined;
  const style: CSSProperties = {};
  if (position) {
    style.left = position.x;
    style.top = position.y;
    style.right = 'auto';
    style.bottom = 'auto';
  }
  if (zIndex) style.zIndex = zIndex;
  return style;
}

function startDrag(
  event: ReactPointerEvent<HTMLElement>,
  panelRef: { current: HTMLElement | null },
  onPositionChange: (position: PanelPosition) => void
) {
  if ((event.target as HTMLElement).closest('button,a,input,select')) return;
  const panel = panelRef.current;
  if (!panel) return;
  const rect = panel.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;

  function move(pointerEvent: PointerEvent) {
    onPositionChange({
      x: Math.max(12, Math.min(window.innerWidth - rect.width - 12, pointerEvent.clientX - offsetX)),
      y: Math.max(12, Math.min(window.innerHeight - 80, pointerEvent.clientY - offsetY))
    });
  }

  function stop() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
  }

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
}

export function SkillUsagePanel({
  busy,
  onActivate,
  onHide,
  onMinimize,
  onPositionChange,
  onRecordSkill,
  onRefresh,
  onResetSkill,
  onSelectSkill,
  onTogglePinned,
  pinned,
  position,
  skills,
  usageItems,
  zIndex
}: SkillUsagePanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const counts = useMemo(() => new Map(usageItems.map((item) => [item.skillId, item])), [usageItems]);
  const rows = useMemo(() => skills
    .map((skill) => ({ skill, usage: counts.get(skill.id) ?? null }))
    .sort((left, right) => (right.usage?.count ?? 0) - (left.usage?.count ?? 0) || left.skill.displayName.localeCompare(right.skill.displayName)),
  [counts, skills]);
  const maxCount = Math.max(1, ...rows.map((row) => row.usage?.count ?? 0));
  const usedCount = rows.filter((row) => (row.usage?.count ?? 0) > 0).length;
  const totalUses = rows.reduce((sum, row) => sum + (row.usage?.count ?? 0), 0);

  return (
    <section
      className="skill-usage-panel"
      data-pinned={pinned}
      ref={panelRef}
      style={panelStyle(position, zIndex)}
      onPointerDownCapture={onActivate}
      aria-label="Skill usage histogram"
    >
      <div className="skill-usage-head window-heading" onPointerDown={(event) => startDrag(event, panelRef, onPositionChange)}>
        <span className="heading-title">
          <BarChart3 size={18} />
          <span>使用量直方图</span>
        </span>
        <div className="window-controls">
          <button type="button" onClick={onRefresh} disabled={busy} title="刷新使用量">
            <RefreshCw size={14} className={busy ? 'spin' : ''} />
          </button>
          <button type="button" onClick={onTogglePinned} title={pinned ? '取消固定' : '固定'}>
            {pinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button type="button" onClick={onMinimize} title="最小化">
            <Minus size={14} />
          </button>
          <button type="button" onClick={onHide} title="隐藏">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="skill-usage-summary">
        <span><b>{totalUses}</b>总使用</span>
        <span><b>{usedCount}</b>已记录 skill</span>
        <span><b>{skills.length}</b>总 skill</span>
      </div>

      <div className="skill-usage-body">
        {rows.map(({ skill, usage }) => {
          const count = usage?.count ?? 0;
          const width = `${Math.max(count ? 4 : 0, Math.round((count / maxCount) * 100))}%`;
          return (
            <article className="usage-bar-row" key={skill.id} data-empty={count === 0}>
              <button type="button" className="usage-skill-name" onClick={() => onSelectSkill(skill.id)}>
                <b>{skill.displayName}</b>
                <small>{usage?.lastUsedAt ? `最近：${new Date(usage.lastUsedAt).toLocaleString()}` : '尚未记录'}</small>
              </button>
              <div className="usage-bar-track" aria-hidden="true">
                <span style={{ width }} />
              </div>
              <strong>{count}</strong>
              <div className="usage-row-actions">
                <button type="button" onClick={() => onRecordSkill(skill.id)} title="记录一次使用">
                  <Plus size={13} />
                </button>
                <button type="button" onClick={() => onResetSkill(skill.id)} title="清零这个 skill">
                  <RotateCcw size={13} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
