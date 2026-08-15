import React, { useState } from 'react';
import { Beat } from '../../types';
import { Sparkles, ChevronDown, ChevronUp, CheckCircle, Clock } from 'lucide-react';

interface BeatCardProps {
  beat: Beat;
  onUpdateBeat: (updatedBeat: Beat) => void;
  totalRuntimeMinutes?: number;
  onGenerateAISuggestion?: (beat: Beat) => void;
}

export const BeatCard: React.FC<BeatCardProps> = ({
  beat,
  onUpdateBeat,
  totalRuntimeMinutes = 110,
  onGenerateAISuggestion,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [content, setContent] = useState(beat.content);

  // Compute minute / page timestamp from standard percentage
  const calculatedMinute = Math.round((beat.percentage / 100) * totalRuntimeMinutes);

  const handleBlur = () => {
    if (content !== beat.content) {
      onUpdateBeat({
        ...beat,
        content,
        isCompleted: content.trim().length > 10,
      });
    }
  };

  const getActBadgeColor = (act: string) => {
    switch (act) {
      case 'Act 1': return 'var(--accent)';
      case 'Act 2': return '#38bdf8';
      case 'Act 3': return 'var(--status-success)';
      default: return 'var(--text-muted)';
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
      {/* Beat Header Bar */}
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Order & Checkbox */}
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: 'var(--radius-xs)',
              backgroundColor: beat.isCompleted ? 'var(--status-success)' : 'var(--bg-tertiary)',
              color: beat.isCompleted ? '#ffffff' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            {beat.isCompleted ? <CheckCircle size={14} /> : beat.order}
          </div>

          {/* Act Badge & Name */}
          <div>
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
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {beat.name}
              </h4>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {beat.description}
            </p>
          </div>
        </div>

        {/* Timestamp & Expand Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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

          <button
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
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
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateAISuggestion(beat);
                }}
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
              outline: 'none',
              resize: 'vertical',
            }}
          />
        </div>
      )}
    </div>
  );
};
