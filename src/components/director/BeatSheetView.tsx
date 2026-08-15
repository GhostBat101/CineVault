import React, { useState } from 'react';
import { BeatSheet, Beat, Media } from '../../types';
import { BeatCard } from './BeatCard';
import { Button } from '../common/Button';
import { Sparkles, Download, Clock } from 'lucide-react';
import { useAISummary } from '../../hooks/useAISummary';

interface BeatSheetViewProps {
  media: Media | null;
  beatSheet?: BeatSheet;
  onSaveBeatSheet?: (sheet: BeatSheet) => void;
}

const DEFAULT_SAVE_THE_CAT_BEATS: Beat[] = [
  { id: 'b1', name: 'Opening Image', act: 'Act 1', percentage: 1, order: 1, description: 'A snapshot of the protagonist’s current flawed world before the adventure.', content: '', isCompleted: false },
  { id: 'b2', name: 'Theme Stated', act: 'Act 1', percentage: 5, order: 2, description: 'What the story is truly about underneath the external plot.', content: '', isCompleted: false },
  { id: 'b3', name: 'Set-Up', act: 'Act 1', percentage: 10, order: 3, description: 'Expand on the protagonist’s status quo, flaws, and stakes of inaction.', content: '', isCompleted: false },
  { id: 'b4', name: 'Catalyst (Inciting Incident)', act: 'Act 1', percentage: 12, order: 4, description: 'Life-changing disruption that shakes the protagonist’s status quo.', content: '', isCompleted: false },
  { id: 'b5', name: 'Debate', act: 'Act 1', percentage: 20, order: 5, description: 'The protagonist hesitates or questions whether to embark on the journey.', content: '', isCompleted: false },
  { id: 'b6', name: 'Break into Two', act: 'Act 1', percentage: 25, order: 6, description: 'The protagonist crosses the threshold into the upside-down world of Act 2.', content: '', isCompleted: false },
  { id: 'b7', name: 'B Story (Love / Mentor)', act: 'Act 2', percentage: 30, order: 7, description: 'Introduction of the secondary relationship carrying the thematic truth.', content: '', isCompleted: false },
  { id: 'b8', name: 'Fun and Games (Promise of the Premise)', act: 'Act 2', percentage: 40, order: 8, description: 'The trailer moments and exploration of the new world/rules.', content: '', isCompleted: false },
  { id: 'b9', name: 'Midpoint', act: 'Act 2', percentage: 50, order: 9, description: 'False victory or false defeat; the stakes raise drastically.', content: '', isCompleted: false },
  { id: 'b10', name: 'Bad Guys Close In', act: 'Act 2', percentage: 65, order: 10, description: 'Internal doubts and external pressures mount against the team.', content: '', isCompleted: false },
  { id: 'b11', name: 'All Is Lost (Whiff of Death)', act: 'Act 2', percentage: 75, order: 11, description: 'Rock bottom moment where all previous strategies fail.', content: '', isCompleted: false },
  { id: 'b12', name: 'Dark Night of the Soul', act: 'Act 2', percentage: 80, order: 12, description: 'Deep despair giving birth to the ultimate epiphany/thematic realization.', content: '', isCompleted: false },
  { id: 'b13', name: 'Break into Three', act: 'Act 2', percentage: 85, order: 13, description: 'The protagonist acts on their epiphany and formulates a new plan.', content: '', isCompleted: false },
  { id: 'b14', name: 'Finale', act: 'Act 3', percentage: 95, order: 14, description: 'The new synthesized truth is put to the test; climactic confrontation.', content: '', isCompleted: false },
  { id: 'b15', name: 'Final Image', act: 'Act 3', percentage: 100, order: 15, description: 'Visual proof of the internal and external transformation.', content: '', isCompleted: false },
];

export const BeatSheetView: React.FC<BeatSheetViewProps> = ({
  media,
  beatSheet,
}) => {
  const [beats, setBeats] = useState<Beat[]>((beatSheet?.beats as any) || DEFAULT_SAVE_THE_CAT_BEATS);
  const [totalRuntimeMinutes, setTotalRuntimeMinutes] = useState<number>(media?.runtimeMinutes || 110);
  const [activeFilterAct, setActiveFilterAct] = useState<string>('all');
  const { isGenerating, generateSummary } = useAISummary();

  const completedCount = beats.filter((b) => b.isCompleted).length;
  const progressPercent = Math.round((completedCount / beats.length) * 100);

  const handleUpdateBeat = (updatedBeat: Beat) => {
    setBeats((prev) => prev.map((b) => (b.id === updatedBeat.id ? updatedBeat : b)));
  };

  const handleGenerateAllBeatsAI = () => {
    const title = media?.title || 'Original Feature';
    const synopsis = media?.synopsis || 'An escalating narrative canvas.';
    generateSummary(
      `Generate a complete Save the Cat! 15 beat breakdown for "${title}". Synopsis: ${synopsis}`,
      0.7
    );
  };

  const filteredBeats = activeFilterAct === 'all'
    ? beats
    : beats.filter((b) => b.act === activeFilterAct);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header Card */}
      <div
        className="glass-panel"
        style={{
          padding: '20px 24px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Save the Cat! 15 Beats Engine</h2>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--accent-subtle)',
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              15 Canonical Beats
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {media ? `Narrative Structure for: ${media.title}` : 'Universal 3-Act Structure Canvas'}
          </p>
        </div>

        {/* Runtime / Page Budget & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--bg-tertiary)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-medium)',
              fontSize: '12px',
            }}
          >
            <Clock size={14} color="var(--text-muted)" />
            <span style={{ color: 'var(--text-muted)' }}>Target Runtime:</span>
            <input
              type="number"
              min={30}
              max={360}
              value={totalRuntimeMinutes}
              onChange={(e) => setTotalRuntimeMinutes(Number(e.target.value) || 110)}
              style={{
                width: '48px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontWeight: 600,
                outline: 'none',
                fontFamily: 'var(--font-mono)',
              }}
            />
            <span style={{ color: 'var(--text-muted)' }}>min</span>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleGenerateAllBeatsAI}
            isLoading={isGenerating}
            icon={<Sparkles size={14} />}
          >
            AI Structure Assistant
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon={<Download size={14} />}
            onClick={() => {
              const exportJson = JSON.stringify({ beats, totalRuntimeMinutes }, null, 2);
              const blob = new Blob([exportJson], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `beat_sheet_${Date.now()}.json`;
              a.click();
            }}
          >
            Export Sheet
          </Button>
        </div>
      </div>

      {/* Progress & Act Filter Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* Progress Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, maxWidth: '400px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Completion:</span>
          <div
            style={{
              flex: 1,
              height: '6px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-full)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                backgroundColor: 'var(--accent)',
                transition: 'width var(--transition-fast)',
              }}
            />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {completedCount} / 15 ({progressPercent}%)
          </span>
        </div>

        {/* Act Filter Buttons */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { id: 'all', label: 'All Beats (15)' },
            { id: 'Act 1', label: 'Act 1 (1-6)' },
            { id: 'Act 2', label: 'Act 2 (7-13)' },
            { id: 'Act 3', label: 'Act 3 (14-15)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilterAct(tab.id)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                background: activeFilterAct === tab.id ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: activeFilterAct === tab.id ? 'var(--bg-primary)' : 'var(--text-secondary)',
                transition: 'all var(--transition-fast)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Beats List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredBeats.map((beat) => (
          <BeatCard
            key={beat.id}
            beat={beat}
            totalRuntimeMinutes={totalRuntimeMinutes}
            onUpdateBeat={handleUpdateBeat}
            onGenerateAISuggestion={(b) => {
              generateSummary(
                `Suggest a creative, high-stakes scene concept for the "${b.name}" beat (${b.description}) in film "${media?.title || 'Story'}".`
              );
            }}
          />
        ))}
      </div>
    </div>
  );
};
