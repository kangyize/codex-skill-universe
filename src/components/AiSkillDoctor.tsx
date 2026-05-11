import { BrainCircuit, Copy, Layers3, Sparkles } from 'lucide-react';
import type { AiSkillAnalysis, AiStatus, SkillGroupSuggestion, SkillNode } from '../types';

interface AiSkillDoctorProps {
  skill: SkillNode;
  status: AiStatus | null;
  analysis: AiSkillAnalysis | null;
  groupSuggestion: SkillGroupSuggestion | null;
  busy: boolean;
  groupBusy: boolean;
  onAnalyze: (skillId: string) => void;
  onSuggestGroup: (skillId: string) => void;
  onSaveGroup: (group: SkillGroupSuggestion) => void;
}

function effortLabel(value: string) {
  if (value === 'small') return 'small';
  if (value === 'medium') return 'medium';
  return 'large';
}

export function AiSkillDoctor({
  analysis,
  busy,
  groupBusy,
  groupSuggestion,
  onAnalyze,
  onSaveGroup,
  onSuggestGroup,
  skill,
  status
}: AiSkillDoctorProps) {
  const enabled = Boolean(status?.enabled);

  return (
    <section className="detail-section ai-doctor-section">
      <div className="ai-doctor-head">
        <h3>
          <BrainCircuit size={15} />
          AI Skill Doctor
        </h3>
        <button type="button" onClick={() => onAnalyze(skill.id)} disabled={!enabled || busy}>
          <Sparkles size={14} className={busy ? 'spin' : ''} />
          {analysis ? 'Recheck' : 'AI Check'}
        </button>
      </div>

      {!enabled ? (
        <p className="muted">
          Configure OPENAI_API_KEY to enable AI analysis. Local scanning and health scoring still work without it.
        </p>
      ) : null}

      {analysis ? (
        <div className="ai-analysis-card" data-verdict={analysis.verdict}>
          <div className="ai-score-row">
            <b>{analysis.score}</b>
            <span>{analysis.title}</span>
            <small>{analysis.model}</small>
          </div>
          <p>{analysis.summary}</p>

          <div className="ai-mini-grid">
            <section>
              <strong>Issues</strong>
              {analysis.issues.length ? analysis.issues.map((issue) => (
                <article key={`${issue.severity}-${issue.title}`} data-severity={issue.severity}>
                  <b>{issue.title}</b>
                  <span>{issue.detail}</span>
                </article>
              )) : <span>No blocking issue found.</span>}
            </section>

            <section>
              <strong>Fixes</strong>
              {analysis.fixes.length ? analysis.fixes.map((fix) => (
                <article key={`${fix.effort}-${fix.title}`}>
                  <b>{fix.title}</b>
                  <small>{effortLabel(fix.effort)}</small>
                  <span>{fix.detail}</span>
                </article>
              )) : <span>No fix suggested.</span>}
            </section>
          </div>

          <div className="ai-suggestion-block">
            <strong>Suggested description</strong>
            <p>{analysis.suggestedDescription}</p>
          </div>

          <div className="ai-token-list">
            {analysis.triggerTerms.map((term) => <span key={term}>{term}</span>)}
          </div>

          <div className="ai-doctor-actions">
            <button type="button" onClick={() => void navigator.clipboard.writeText(analysis.suggestedDescription)}>
              <Copy size={14} />
              Copy description
            </button>
            <button type="button" onClick={() => onSuggestGroup(skill.id)} disabled={groupBusy}>
              <Layers3 size={14} className={groupBusy ? 'spin' : ''} />
              Suggest Skill Group
            </button>
          </div>

          {groupSuggestion ? (
            <div className="ai-group-preview">
              <strong>{groupSuggestion.name}</strong>
              <p>{groupSuggestion.purpose}</p>
              <ol>
                {groupSuggestion.members.map((member) => (
                  <li key={member.skillId}>
                    <b>{member.order}. {member.role}</b>
                    <span>{member.reason}</span>
                  </li>
                ))}
              </ol>
              {groupSuggestion.warnings.length ? <small>{groupSuggestion.warnings.join(' | ')}</small> : null}
              <button type="button" onClick={() => onSaveGroup(groupSuggestion)}>Save Skill Group</button>
            </div>
          ) : null}

          <small className="ai-privacy-note">{analysis.privacy}</small>
        </div>
      ) : null}
    </section>
  );
}
