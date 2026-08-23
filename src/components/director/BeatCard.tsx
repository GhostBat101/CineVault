/**
 * director/BeatCard.tsx
 * ─────────────────────────────────────────────────────────────
 * WHAT: One collapsible Save-the-Cat! beat row: a plain header flex row with
 *       TWO sibling controls - the numbered completion toggle button and a
 *       real expand/collapse button (.beat-header) wrapping the act badge,
 *       name, description, timestamp estimate, and chevron - plus an expanded
 *       scene workspace (textarea + per-beat "AI Beat Brainstorm" trigger).
 *
 * COMPLETION RULES:
 *   - The numbered square is an explicit TOGGLE (manual control).
 *   - Committing text also auto-completes a previously-empty beat once it has
 *     meaningful content (>10 chars); emptying content clears completion.
 *     Manual toggles otherwise win over the heuristic.
 *
 * RESYNC CONTRACT: local textarea state follows EXTERNAL content updates
 *       (e.g. "Insert into beat" from the AI panel / persistence reload) but
 *       never clobbers uncommitted local typing: external values are adopted
 *       only while the local draft still equals the previous prop value.
 *
 * USES:    types/index.ts (Beat); design tokens --act-2, --shadow-1,
 *          --status-success glow (Phase 3 uplift).
 * USED BY: director/BeatSheetView.tsx (memoized; callbacks arrive stable).
 * NOTE:    Hover feedback for the expand button lives in index.css
 *          (.beat-header:hover) - no JS hover handlers here by policy.
 */
import { useState, useRef, useEffect, memo } from 'react';
import { Beat } from '../../types';
import { Sparkles, ChevronDown, ChevronUp, CheckCircle, Clock } from 'lucide-react';

interface BeatCardProps {
  /** Beat entity rendered by this card. */
  beat: Beat;
  /** Commit any change to this beat upward. */
  onUpdateBeat: (updatedBeat: Beat) => void;
  /** Runtime used to translate beat percentages into minute estimates. */
  totalRuntimeMinutes?: number;
  /** Fire the per-beat AI brainstorm (handled by the sheet view). */
  onGenerateAISuggestion?: (beat: Beat) => void;
  /** Toggle manual completion (explicit user control). */
  onToggleCompleted?: (beat: Beat) => void;
}

export const BeatCard = memo<BeatCardProps>(({
  beat,
  onUpdateBeat,
  totalRuntimeMinutes = 110,
  onGenerateAISuggestion,
  onToggleCompleted,
}) => {
  /** Whether the scene workspace below the header is visible. */
  const [isExpanded, setIsExpanded] = useState(false);
  /** Local textarea draft; committed to the parent on blur. */
  const [content, setContent] = useState(beat.content);
  /** Last content value seen from props - baseline for external-resync detection. */
  const prevPropContentRef = useRef(beat.content);

  // Adopt EXTERNAL content changes: cleanly when the user has no divergent
  // draft; otherwise APPEND the external addition to the local draft so an
  // "Insert into beat" landing mid-edit is never clobbered by the blur commit.
  useEffect(() => {
    const prevProp = prevPropContentRef.current;
    if (beat.content !== prevProp) {
      if (content === prevProp) {
        // Clean adoption - no uncommitted typing to protect.
        setContent(beat.content);
      } else if (beat.content.startsWith(prevProp)) {
        // External APPENDED text (the AI-insert pattern): graft the suffix
        // onto the local draft instead of discarding either side.
        const addition = beat.content.slice(prevProp.length);
        setContent((local) => local + addition);
      }
      // Divergent rewrite while dirty: keep the local draft; blur commits it.
    }
    prevPropContentRef.current = beat.content;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat.content]);

  // Minute/page timestamp estimated from the canonical percentage.
  const calculatedMinute = Math.round((beat.percentage / 100) * totalRuntimeMinutes);

  /**
   * Commit the draft on blur. Auto-completion heuristic: empty -> incomplete;
   * first meaningful entry (>10 chars) into a previously-empty beat ->
   * complete; otherwise preserve the manually-toggled value.
   */
  const handleBlur = () => {
    if (content === beat.content) return;
    const hadContent = Boolean(beat.content.trim());
    const hasContent = Boolean(content.trim());
    let isCompleted = beat.isCompleted;
    if (!hasContent) {
      isCompleted = false;
    } else if (!hadContent && content.trim().length > 10) {
      isCompleted = true;
    }
    onUpdateBeat({ ...beat, content, isCompleted });
  };

  /** Act badge color token per act label. */
  const getActBadgeColor = (act: string): string => {
    switch (act) {
      case 'Act 1':
        return 'var(--accent)';
      case 'Act 2':
        return 'var(--act-2)';
      case 'Act 3':
        return 'var(--status-success)';
      default:
        return 'var(--text-muted)';
    }
  };

  return (
    <div
      className="glass-panel"
      style={{
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${beat.isCompleted ? 'var(--border-medium)' : 'var(--border-subtle)'}`,
        backgroundColor: beat.isCompleted ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
        overflow: 'hidden',
        transition: 'all var(--transition-fast)',
      }}
    >
      {/* Beat Header Bar - a plain flex row holding TWO sibling controls so
          nested interactive elements never appear inside a <button>:
            1. the numbered completion toggle button, and
            2. the expand/collapse control - a REAL button carrying the
               .beat-header class (hover styling) that wraps the badge/name/
               description/timestamp/chevron content. */}
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          width: '100%',
        }}
      >
        {/* Sibling control 1: Order / Completion Toggle */}
        <button
          type="button"
          onClick={() => {
            if (onToggleCompleted) onToggleCompleted(beat);
          }}
          aria-label={
            beat.isCompleted
              ? `Mark "${beat.name}" as incomplete`
              : `Mark "${beat.name}" as complete`
          }
          title={beat.isCompleted ? 'Mark incomplete' : 'Mark complete'}
          style={{
            width: '24px',
            height: '24px',
            borderRadius: 'var(--radius-xs)',
            flexShrink: 0,
            backgroundColor: beat.isCompleted ? 'var(--status-success)' : 'var(--bg-primary)',
            color: beat.isCompleted ? '#ffffff' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            border: '1px solid var(--border-medium)',
            boxShadow: beat.isCompleted ? '0 0 12px -2px var(--status-success)' : 'var(--shadow-1)',
            cursor: 'pointer',
          }}
        >
          {beat.isCompleted ? <CheckCircle size={14} /> : beat.order}
        </button>

        {/* Sibling control 2: expand/collapse button wrapping all card info */}
        <button
          type="button"
          className="beat-header"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-label={`${beat.name} (${beat.act}). ${isExpanded ? 'Collapse' : 'Expand'} scene editor.`}
          style={{
            flex: 1,
            minWidth: 0,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            cursor: 'pointer',
            userSelect: 'none',
            background: 'transparent',
            border: 'none',
            textAlign: 'left',
            color: 'inherit',
            font: 'inherit',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  color: getActBadgeColor(beat.act),
                }}
              >
                {beat.act}
              </span>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {beat.name}
              </h4>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {beat.description}
            </p>
          </div>

          {/* Timestamp & Chevron */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                backgroundColor: 'var(--bg-primary)',
                padding: '3px 8px',
                borderRadius: 'var(--radius-xs)',
              }}
            >
              <Clock size={11} />
              <span>~{calculatedMinute} min ({beat.percentage}%)</span>
            </div>

            <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </div>
        </button>
      </div>

      {/* Expanded Scene Workspace */}
      {isExpanded && (
        <div
          style={{
            padding: '0 16px 16px 16px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
              Scene Beats & Dramatic Action
            </span>
            {onGenerateAISuggestion && (
              <button
                type="button"
                onClick={() => onGenerateAISuggestion(beat)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'var(--accent-subtle)',
                  color: 'var(--accent)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '3px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                <Sparkles size={11} />
                <span>AI Beat Brainstorm</span>
              </button>
            )}
          </div>

          <textarea
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={handleBlur}
            placeholder={`Detail the specific scene action, character conflicts, and stakes for ${beat.name}...`}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontFamily: 'var(--font-sans)',
              resize: 'vertical',
            }}
          />
        </div>
      )}
    </div>
  );
});

BeatCard.displayName = 'BeatCard';
