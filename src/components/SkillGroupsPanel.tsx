import { Layers3, Minus, Pin, PinOff, RefreshCw, Trash2, X } from 'lucide-react';
import { useRef } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { PanelPosition, SkillGroup, SkillNode } from '../types';

interface SkillGroupsPanelProps {
  groups: SkillGroup[];
  skillsById: Map<string, SkillNode>;
  busy: boolean;
  pinned: boolean;
  position?: PanelPosition;
  zIndex?: number;
  onSelectSkill: (skillId: string) => void;
  onDeleteGroup: (groupId: string) => void;
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

export function SkillGroupsPanel({
  busy,
  groups,
  onActivate,
  onDeleteGroup,
  onHide,
  onMinimize,
  onPositionChange,
  onRefresh,
  onSelectSkill,
  onTogglePinned,
  pinned,
  position,
  skillsById,
  zIndex
}: SkillGroupsPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);

  return (
    <section
      className="skill-groups-panel"
      data-pinned={pinned}
      ref={panelRef}
      style={panelStyle(position, zIndex)}
      onPointerDownCapture={onActivate}
      aria-label="Skill Groups"
    >
      <div className="skill-groups-head window-heading" onPointerDown={(event) => startDrag(event, panelRef, onPositionChange)}>
        <span className="heading-title">
          <Layers3 size={18} />
          <span>Skill Groups</span>
        </span>
        <div className="window-controls">
          <button type="button" onClick={onRefresh} disabled={busy} title="Refresh groups">
            <RefreshCw size={14} className={busy ? 'spin' : ''} />
          </button>
          <button type="button" onClick={onTogglePinned} title={pinned ? 'Unpin' : 'Pin'}>
            {pinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button type="button" onClick={onMinimize} title="Minimize">
            <Minus size={14} />
          </button>
          <button type="button" onClick={onHide} title="Hide">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="skill-groups-body">
        {groups.length ? groups.map((group) => (
          <article className="skill-group-card" key={group.id}>
            <div className="skill-group-title">
              <div>
                <strong>{group.name}</strong>
                <p>{group.purpose}</p>
              </div>
              <button type="button" onClick={() => onDeleteGroup(group.id)} title="Delete group">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="skill-group-members">
              {group.members.map((member) => {
                const skill = skillsById.get(member.skillId);
                return (
                  <button key={member.skillId} type="button" onClick={() => onSelectSkill(member.skillId)}>
                    <b>{member.order}. {skill?.displayName ?? member.skillId}</b>
                    <span>{member.role}</span>
                    <small>{member.reason}</small>
                  </button>
                );
              })}
            </div>
            {group.defaultPrompt ? (
              <div className="skill-group-prompt">
                <span>{group.defaultPrompt}</span>
                <button type="button" onClick={() => void navigator.clipboard.writeText(group.defaultPrompt)}>
                  Copy
                </button>
              </div>
            ) : null}
          </article>
        )) : (
          <p className="muted">
            No saved groups yet. Run AI Skill Doctor on a skill, generate a group, then save it here.
          </p>
        )}
      </div>
    </section>
  );
}
