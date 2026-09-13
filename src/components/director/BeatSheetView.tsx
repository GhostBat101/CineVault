/**
 * File Purpose: Multi-framework narrative beat sheet editor providing structural beat templates, timing math, export utilities, and AI assistance.
 * Communication Matrix: Rendered in DirectorSuite.tsx; integrates with BeatCard.tsx, useAISummary.ts, and stores to localStorage/SQLite.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Beat, Media } from '../../types';
import { BeatCard } from './BeatCard';
import { Button } from '../common/Button';
import { Markdown } from '../common/Markdown';
import { Sparkles, Download, Clock, FileText, Loader2, AlertTriangle } from 'lucide-react';
import { useAISummary } from '../../hooks/useAISummary';
import { api, isTauri } from '../../services/api';

interface BeatSheetViewProps {
  media: Media | null;
}

type Framework = 'save-the-cat' | 'three-act' | 'dan-harmon' | 'heros-journey';

interface PersistedBeatSheet {
  version: 1;
  framework?: Framework;
  beats: Beat[];
  totalRuntimeMinutes: number;
}

type AITarget = { kind: 'sheet'; label: string } | { kind: 'beat'; label: string; beatId: string } | null;

const FRAMEWORKS: Array<{ id: Framework; label: string }> = [
  { id: 'save-the-cat', label: 'Save the Cat! (15 Beats)' },
  { id: 'three-act', label: 'Classic Three-Act (8 Beats)' },
  { id: 'dan-harmon', label: 'Dan Harmon Story Circle (8 Beats)' },
  { id: 'heros-journey', label: "Hero's Journey (12 Beats)" },
];

const DEFAULT_SAVE_THE_CAT_BEATS: Array<Omit<Beat, 'content' | 'isCompleted'>> = [
  { id: 'b1', name: 'Opening Image', act: 'Act 1', percentage: 1, order: 1, description: 'A snapshot of the protagonist’s current flawed world before the adventure.' },
  { id: 'b2', name: 'Theme Stated', act: 'Act 1', percentage: 5, order: 2, description: 'What the story is truly about underneath the external plot.' },
  { id: 'b3', name: 'Set-Up', act: 'Act 1', percentage: 10, order: 3, description: 'Expand on the protagonist’s status quo, flaws, and stakes of inaction.' },
  { id: 'b4', name: 'Catalyst (Inciting Incident)', act: 'Act 1', percentage: 12, order: 4, description: 'Life-changing disruption that shakes the protagonist’s status quo.' },
  { id: 'b5', name: 'Debate', act: 'Act 1', percentage: 20, order: 5, description: 'The protagonist hesitates or questions whether to embark on the journey.' },
  { id: 'b6', name: 'Break into Two', act: 'Act 1', percentage: 25, order: 6, description: 'The protagonist crosses the threshold into the upside-down world of Act 2.' },
  { id: 'b7', name: 'B Story (Love / Mentor)', act: 'Act 2', percentage: 30, order: 7, description: 'Introduction of the secondary relationship carrying the thematic truth.' },
  { id: 'b8', name: 'Fun and Games (Promise of the Premise)', act: 'Act 2', percentage: 40, order: 8, description: 'The trailer moments and exploration of the new world/rules.' },
  { id: 'b9', name: 'Midpoint', act: 'Act 2', percentage: 50, order: 9, description: 'False victory or false defeat; the stakes raise drastically.' },
  { id: 'b10', name: 'Bad Guys Close In', act: 'Act 2', percentage: 65, order: 10, description: 'Internal doubts and external pressures mount against the team.' },
  { id: 'b11', name: 'All Is Lost (Whiff of Death)', act: 'Act 2', percentage: 75, order: 11, description: 'Rock bottom moment where all previous strategies fail.' },
  { id: 'b12', name: 'Dark Night of the Soul', act: 'Act 2', percentage: 80, order: 12, description: 'Deep despair giving birth to the ultimate epiphany/thematic realization.' },
  { id: 'b13', name: 'Break into Three', act: 'Act 2', percentage: 85, order: 13, description: 'The protagonist acts on their epiphany and formulates a new plan.' },
  { id: 'b14', name: 'Finale', act: 'Act 3', percentage: 95, order: 14, description: 'The new synthesized truth is put to the test; climactic confrontation.' },
  { id: 'b15', name: 'Final Image', act: 'Act 3', percentage: 100, order: 15, description: 'Visual proof of the internal and external transformation.' },
];

const THREE_ACT_BEATS: Array<Omit<Beat, 'content' | 'isCompleted'>> = [
  { id: 't1', name: 'Exposition & Status Quo', act: 'Act 1', percentage: 10, order: 1, description: 'Establish protagonist status quo and ordinary world.' },
  { id: 't2', name: 'Inciting Incident', act: 'Act 1', percentage: 15, order: 2, description: 'The event that sets the story in motion.' },
  { id: 't3', name: 'Plot Point 1', act: 'Act 1', percentage: 25, order: 3, description: 'Commitment to the quest / crossing the threshold into Act 2.' },
  { id: 't4', name: 'Rising Action', act: 'Act 2', percentage: 40, order: 4, description: 'Obstacles and trials compound.' },
  { id: 't5', name: 'Midpoint Reversal', act: 'Act 2', percentage: 50, order: 5, description: 'A massive shift in perspective or stakes.' },
  { id: 't6', name: 'Plot Point 2 (Crisis)', act: 'Act 2', percentage: 75, order: 6, description: 'The major crisis preceding the climax.' },
  { id: 't7', name: 'Climax', act: 'Act 3', percentage: 90, order: 7, description: 'Ultimate confrontation between protagonist and opposing forces.' },
  { id: 't8', name: 'Resolution', act: 'Act 3', percentage: 100, order: 8, description: 'Denouement and restoration of balance.' },
];

const DAN_HARMON_BEATS: Array<Omit<Beat, 'content' | 'isCompleted'>> = [
  { id: 'dh1', name: 'You', act: 'Act 1', percentage: 0, order: 1, description: 'A character exists in their zone of comfort; the status quo is established.' },
  { id: 'dh2', name: 'Need', act: 'Act 1', percentage: 12, order: 2, description: 'Something unsettles the comfort zone; the character wants or needs something.' },
  { id: 'dh3', name: 'Go', act: 'Act 2', percentage: 25, order: 3, description: 'The character crosses into the unfamiliar situation, committing to change.' },
  { id: 'dh4', name: 'Search', act: 'Act 2', percentage: 37, order: 4, description: 'Adapting to the unfamiliar world; trials reveal what the character lacks.' },
  { id: 'dh5', name: 'Find', act: 'Act 2', percentage: 50, order: 5, description: 'The character gets what they wanted - at a cost they did not expect.' },
  { id: 'dh6', name: 'Take', act: 'Act 3', percentage: 62, order: 6, description: 'The price is paid; the character loses what mattered most to gain their goal.' },
  { id: 'dh7', name: 'Return', act: 'Act 3', percentage: 87, order: 7, description: 'The character returns to the familiar situation, forever changed by the journey.' },
  { id: 'dh8', name: 'Change', act: 'Act 3', percentage: 100, order: 8, description: 'The transformation is proven; the character - and their world - is new.' },
];

const HEROES_JOURNEY_BEATS: Array<Omit<Beat, 'content' | 'isCompleted'>> = [
  { id: 'hj1', name: 'Ordinary World', act: 'Act 1', percentage: 8, order: 1, description: "The hero's normal life and inner flaw are established before the adventure." },
  { id: 'hj2', name: 'Call to Adventure', act: 'Act 1', percentage: 17, order: 2, description: 'A challenge or invitation disrupts the ordinary world.' },
  { id: 'hj3', name: 'Refusal of the Call', act: 'Act 1', percentage: 25, order: 3, description: 'The hero hesitates, revealing fears and the stakes of leaving.' },
  { id: 'hj4', name: 'Meeting the Mentor', act: 'Act 1', percentage: 33, order: 4, description: 'A guide grants the confidence, training, or gift needed to begin.' },
  { id: 'hj5', name: 'Crossing the Threshold', act: 'Act 2', percentage: 42, order: 5, description: 'The hero commits to the special world; no turning back.' },
  { id: 'hj6', name: 'Tests, Allies & Enemies', act: 'Act 2', percentage: 50, order: 6, description: 'The rules of the new world are learned through trials and alliances.' },
  { id: 'hj7', name: 'Approach to the Inmost Cave', act: 'Act 2', percentage: 58, order: 7, description: 'Preparation for the central ordeal; tension peaks before the descent.' },
  { id: 'hj8', name: 'The Ordeal', act: 'Act 2', percentage: 67, order: 8, description: 'The hero faces death or greatest fear and is reborn stronger.' },
  { id: 'hj9', name: 'Reward (Seizing the Sword)', act: 'Act 2', percentage: 75, order: 9, description: 'The prize of survival is claimed - but danger lingers.' },
  { id: 'hj10', name: 'The Road Back', act: 'Act 3', percentage: 83, order: 10, description: 'The chase back to the ordinary world; consequences pursue the hero.' },
  { id: 'hj11', name: 'Resurrection', act: 'Act 3', percentage: 92, order: 11, description: 'The final test purifies the hero; the true climax of transformation.' },
  { id: 'hj12', name: 'Return with the Elixir', act: 'Act 3', percentage: 100, order: 12, description: 'The hero returns home bearing something that restores the world.' },
];

function createDefaultBeats(framework: Framework): Beat[] {
  let templates = DEFAULT_SAVE_THE_CAT_BEATS;
  if (framework === 'three-act') {
    templates = THREE_ACT_BEATS;
  } else if (framework === 'dan-harmon') {
    templates = DAN_HARMON_BEATS;
  } else if (framework === 'heros-journey') {
    templates = HEROES_JOURNEY_BEATS;
  }
  return templates.map((template) => ({
    ...template,
    content: '',
    isCompleted: false,
  }));
}

function loadPersistedSheet(key: string): PersistedBeatSheet | null {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as PersistedBeatSheet;
    if (!Array.isArray(parsed.beats) || parsed.beats.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const BeatSheetView: React.FC<BeatSheetViewProps> = ({ media }) => {
  const storageKey = media ? `cinevault_beats_${media.id}` : 'cinevault_beats_global';

  const initialSheet = loadPersistedSheet(storageKey);
  const initialFramework = initialSheet?.framework ?? 'save-the-cat';
  const [framework, setFramework] = useState<Framework>(initialFramework);
  const [beats, setBeats] = useState<Beat[]>(
    initialSheet ? initialSheet.beats : createDefaultBeats(initialFramework)
  );
  const [totalRuntimeMinutes, setTotalRuntimeMinutes] = useState<number>(
    initialSheet?.totalRuntimeMinutes ?? (media?.runtimeMinutes || 110)
  );
  const loadedKeyRef = useRef<string>(storageKey);

  const [runtimeDraft, setRuntimeDraft] = useState<string>(String(totalRuntimeMinutes));
  const [activeFilterAct, setActiveFilterAct] = useState<string>('all');
  const { isGenerating, summary: aiSummary, error: aiError, generateSummary, clearError } = useAISummary();
  const [aiTarget, setAiTarget] = useState<AITarget>(null);

  useEffect(() => {
    let isCurrent = true;
    const loadData = async () => {
      if (media && isTauri()) {
        try {
          const dbSheet = await api.getBeatSheet(media.id);
          if (isCurrent && dbSheet && Array.isArray(dbSheet.beats) && dbSheet.beats.length > 0) {
            const sheetFramework = (dbSheet.framework as Framework) || 'save-the-cat';
            setFramework(sheetFramework);
            setBeats(dbSheet.beats as any);
            const runtime = media.runtimeMinutes || 110;
            setTotalRuntimeMinutes(runtime);
            setRuntimeDraft(String(runtime));
            loadedKeyRef.current = storageKey;
            return;
          }
        } catch {
        }
      }
      if (isCurrent) {
        const sheet = loadPersistedSheet(storageKey);
        const sheetFramework = sheet?.framework ?? 'save-the-cat';
        setFramework(sheetFramework);
        setBeats(sheet ? sheet.beats : createDefaultBeats(sheetFramework));
        const runtime = sheet?.totalRuntimeMinutes ?? (media?.runtimeMinutes || 110);
        setTotalRuntimeMinutes(runtime);
        setRuntimeDraft(String(runtime));
        loadedKeyRef.current = storageKey;
      }
    };
    loadData();
    return () => {
      isCurrent = false;
    };
  }, [storageKey, media]);

  useEffect(() => {
    if (loadedKeyRef.current !== storageKey) return;
    try {
      const payload: PersistedBeatSheet = { version: 1, framework, beats, totalRuntimeMinutes };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to persist beat sheet:', e);
    }

    if (media && isTauri()) {
      api.saveBeatSheet({
        id: `sheet_${media.id}`,
        mediaId: media.id,
        framework: framework as any,
        title: `${media.title || 'Feature'} Beat Sheet`,
        beats: beats as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }, [beats, totalRuntimeMinutes, framework, storageKey, media]);

  const completedCount = beats.filter((b) => b.isCompleted).length;
  const progressPercent = beats.length > 0 ? Math.round((completedCount / beats.length) * 100) : 0;

  const commitRuntimeDraft = () => {
    const parsed = Number(runtimeDraft);
    const valid = Number.isFinite(parsed) && parsed >= 30 && parsed <= 360 ? Math.round(parsed) : totalRuntimeMinutes;
    setTotalRuntimeMinutes(valid);
    setRuntimeDraft(String(valid));
  };

  const handleUpdateBeat = (updatedBeat: Beat) => {
    setBeats((prev) => prev.map((b) => (b.id === updatedBeat.id ? updatedBeat : b)));
  };

  const handleGenerateAllBeatsAI = () => {
    const title = media?.title || 'Original Feature';
    const synopsis = media?.synopsis || 'An escalating narrative canvas.';
    const frameworkLabel = FRAMEWORKS.find((f) => f.id === framework)?.label ?? framework;
    clearError();
    setAiTarget({ kind: 'sheet', label: 'Full Sheet Structure Breakdown' });
    generateSummary({
      prompt: `Generate a complete ${frameworkLabel} beat breakdown for "${title}". Synopsis: ${synopsis}`,
      title: media?.title,
      genres: media?.genres,
      synopsis: media?.synopsis,
      mediaType: media?.mediaType,
    });
  };

  const handleBeatBrainstorm = (beat: Beat) => {
    clearError();
    setAiTarget({ kind: 'beat', label: `"${beat.name}" Brainstorm`, beatId: beat.id });
    generateSummary({
      prompt: `Suggest a creative, high-stakes scene concept for the "${beat.name}" beat (${beat.description}) in film "${media?.title || 'Story'}".`,
      title: media?.title,
      genres: media?.genres,
      synopsis: media?.synopsis,
      mediaType: media?.mediaType,
    });
  };

  const handleInsertIntoBeat = () => {
    if (!aiSummary || !aiTarget || aiTarget.kind !== 'beat') return;
    const target = beats.find((b) => b.id === aiTarget.beatId);
    if (!target) return;
    handleUpdateBeat({
      ...target,
      content: target.content ? `${target.content}\n\n${aiSummary}` : aiSummary,
      isCompleted: true,
    });
    setAiTarget(null);
  };

  const filteredBeats =
    activeFilterAct === 'all' ? beats : beats.filter((b) => b.act === activeFilterAct);

  const countForAct = (act: string) =>
    act === 'all' ? beats.length : beats.filter((b) => b.act === act).length;

  const handleFrameworkChange = (next: Framework) => {
    if (next === framework) return;
    setFramework(next);
    setBeats(createDefaultBeats(next));
    setActiveFilterAct('all');
  };

  const downloadFile = (content: string, mime: string, extension: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = (media?.title || 'untitled').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    a.href = url;
    a.download = `beat_sheet_${safeTitle}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    downloadFile(
      JSON.stringify({ framework, beats, totalRuntimeMinutes }, null, 2),
      'application/json',
      'json'
    );
  };

  const handleExportMarkdown = () => {
    const titleLine = `# Beat Sheet - ${media?.title || 'Untitled'} (${FRAMEWORKS.find((f) => f.id === framework)?.label ?? framework})`;
    const acts = ['Act 1', 'Act 2', 'Act 3'];
    const sections = acts
      .map((act) => {
        const actBeats = beats.filter((b) => b.act === act);
        if (actBeats.length === 0) return '';
        const body = actBeats
          .map((b) => {
            const minute = Math.round((b.percentage / 100) * totalRuntimeMinutes);
            const check = b.isCompleted ? 'x' : ' ';
            const note = b.content.trim() || `_${b.description}_`;
            return `- [${check}] **${b.name}** (~${minute} min, ${b.percentage}%)\n  ${note.replace(/\r?\n/g, '\n  ')}`;
          })
          .join('\n');
        return `## ${act}\n\n${body}`;
      })
      .filter(Boolean)
      .join('\n\n');
    downloadFile(`${titleLine}\n\n${sections}\n`, 'text/markdown;charset=utf-8', 'md');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 'var(--text-h1)', fontWeight: 600 }}>
              {FRAMEWORKS.find((f) => f.id === framework)?.label ?? 'Beat Engine'}
            </h2>
            <span
              className="cv-kicker"
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--accent-subtle)',
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {beats.length} Canonical Beats
            </span>

            <select
              value={framework}
              onChange={(e) => handleFrameworkChange(e.target.value as Framework)}
              aria-label="Structural framework"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-xs)',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {FRAMEWORKS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {media ? `Narrative Structure for: ${media.title}` : 'Universal Narrative Structure Canvas'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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
              value={runtimeDraft}
              onChange={(e) => setRuntimeDraft(e.target.value)}
              onBlur={commitRuntimeDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRuntimeDraft();
              }}
              aria-label="Target runtime in minutes"
              style={{
                width: '48px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontWeight: 600,
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

          <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={handleExportJson}>
            Export JSON
          </Button>

          <Button variant="secondary" size="sm" icon={<FileText size={14} />} onClick={handleExportMarkdown}>
            Export Markdown
          </Button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
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
                borderRadius: 'var(--radius-full)',
                background: 'linear-gradient(90deg, var(--accent), var(--accent-hover))',
                transition: 'width var(--transition-fast)',
              }}
            />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {completedCount} / {beats.length} ({progressPercent}%)
          </span>
        </div>

        <div role="tablist" aria-label="Filter beats by act" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Beats' },
            { id: 'Act 1', label: 'Act 1' },
            { id: 'Act 2', label: 'Act 2' },
            { id: 'Act 3', label: 'Act 3' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilterAct(tab.id)}
              aria-pressed={activeFilterAct === tab.id}
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
              {tab.label} ({countForAct(tab.id)})
            </button>
          ))}
        </div>
      </div>

      {(isGenerating || aiSummary || aiError) && (
        <div
          className="glass-panel cv-border-glow"
          style={{
            padding: '16px',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: aiTarget ? '8px' : undefined }}>
            <Sparkles size={14} color="var(--accent)" />
            <strong style={{ fontSize: '12px', color: 'var(--accent)' }}>
              AI {aiTarget?.label ?? 'Output'}
            </strong>
            {!aiTarget && !isGenerating && !aiSummary && !aiError && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ready</span>
            )}
          </div>

          {isGenerating ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Generating...
            </div>
          ) : aiError ? (
            <div role="alert" style={{ fontSize: '12px', color: 'var(--status-danger)', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              <span>{aiError}</span>
            </div>
          ) : aiSummary ? (
            <>
              <Markdown
                source={aiSummary}
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  maxHeight: '220px',
                  overflowY: 'auto',
                }}
              />
              {aiTarget?.kind === 'beat' && (
                <div style={{ marginTop: '10px' }}>
                  <Button variant="secondary" size="sm" icon={<Download size={12} />} onClick={handleInsertIntoBeat}>
                    Insert into "{beats.find((b) => b.id === aiTarget.beatId)?.name}" Workspace
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredBeats.map((beat) => (
          <BeatCard
            key={`${beat.id}`}
            beat={beat}
            totalRuntimeMinutes={totalRuntimeMinutes}
            onUpdateBeat={handleUpdateBeat}
            onToggleCompleted={(b) => handleUpdateBeat({ ...b, isCompleted: !b.isCompleted })}
            onGenerateAISuggestion={handleBeatBrainstorm}
          />
        ))}
      </div>
    </div>
  );
};
