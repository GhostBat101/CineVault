/**
 * File Purpose: Lore notes workspace organizing world rules, relics, factions, and managing local AI continuity audits.
 * Communication Matrix: Rendered in DirectorSuite.tsx; invokes useAISummary hook and persists to SQLite/localStorage.
 */

import React, { useState, useEffect, useRef } from 'react';
import { LoreNote, Media } from '../../types';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Markdown } from '../common/Markdown';
import { Plus, Sparkles, BookOpen, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useAISummary } from '../../hooks/useAISummary';
import { api, isTauri } from '../../services/api';

interface LoreNotesViewProps {
  media: Media | null;
}

const CATEGORIES = [
  'World Rules',
  'Relics & Tech',
  'Factions & Organizations',
  'Timeline Events',
  'Magic & Lore',
] as const;

const LORE_CONTEXT_BUDGET = 4000;

function loadJsonArray<T>(key: string): T[] {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T[]) : [];
  } catch {
    return [];
  }
}

export const LoreNotesView: React.FC<LoreNotesViewProps> = ({ media }) => {
  const storageKey = media ? `cinevault_lore_notes_${media.id}` : 'cinevault_lore_notes_global';

  const [notes, setNotes] = useState<LoreNote[]>(() => loadJsonArray<LoreNote>(storageKey));
  const loadedKeyRef = useRef<string>(storageKey);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<LoreNote | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<string>('World Rules');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');

  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditScenePrompt, setAuditScenePrompt] = useState('');
  const {
    summary: auditResult,
    isGenerating: isAuditing,
    error: auditError,
    generateSummary: runAudit,
  } = useAISummary();

  useEffect(() => {
    let isCurrent = true;
    const loadData = async () => {
      if (media && isTauri()) {
        try {
          const dbNotes = await api.getLoreNotes(media.id);
          if (isCurrent && Array.isArray(dbNotes) && dbNotes.length > 0) {
            setNotes(dbNotes);
            loadedKeyRef.current = storageKey;
            return;
          }
        } catch {
        }
      }
      if (isCurrent) {
        setNotes(loadJsonArray<LoreNote>(storageKey));
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
      localStorage.setItem(storageKey, JSON.stringify(notes));
    } catch (e) {
      console.warn('Failed to persist lore notes:', e);
    }
    if (media && isTauri()) {
      api.saveLoreNotes(media.id, notes).catch(() => {});
    }
  }, [notes, storageKey, media]);

  const filteredNotes =
    selectedCategory === 'all' ? notes : notes.filter((n) => n.category === selectedCategory);

  const handleCreateNote = () => {
    if (!newTitle.trim() || !newContent.trim()) return;

    const tags = [
      ...new Set(
        newTags
          .split(',')
          .map((t) => t.trim().replace(/^#+/, ''))
          .filter(Boolean)
      ),
    ];

    if (editingNote) {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === editingNote.id
            ? {
                ...n,
                category: newCategory,
                title: newTitle.trim(),
                contentMarkdown: newContent.trim(),
                tags,
                updatedAt: new Date().toISOString(),
              }
            : n
        )
      );
    } else {
      const nowIso = new Date().toISOString();
      const newNote: LoreNote = {
        id: `lore_${crypto.randomUUID()}`,
        mediaId: media?.id || 'default',
        category: newCategory,
        title: newTitle.trim(),
        contentMarkdown: newContent.trim(),
        tags,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setNotes((prev) => [newNote, ...prev]);
    }

    setNewTitle('');
    setNewContent('');
    setNewTags('');
    setEditingNote(null);
    setIsAddNoteOpen(false);
  };

  const handleEditNote = (note: LoreNote) => {
    setEditingNote(note);
    setNewTitle(note.title);
    setNewCategory(note.category);
    setNewContent(note.contentMarkdown);
    setNewTags((note.tags || []).join(', '));
    setIsAddNoteOpen(true);
  };

  const handleDeleteNote = (note: LoreNote) => {
    if (!window.confirm(`Delete lore note "${note.title}"? This cannot be undone.`)) return;
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
  };

  const handleRunContinuityAudit = () => {
    if (!auditScenePrompt.trim()) return;
    const assembled = notes
      .map((n) => `[${n.category}] ${n.title}: ${n.contentMarkdown}`)
      .join('\n\n');
    const loreContext =
      assembled.length > LORE_CONTEXT_BUDGET
        ? `${assembled.slice(0, LORE_CONTEXT_BUDGET)}\n[truncated]`
        : assembled;

    const prompt = `Perform a screenplay continuity audit.\n\nTitle: ${media?.title || 'Untitled Project'}\n\nEstablished Lore Rules:\n${loreContext || 'None specified.'}\n\nProposed Scene / Draft Action:\n${auditScenePrompt}\n\nCheck for plot holes, world rule violations, and logical contradictions.`;
    runAudit({
      prompt,
      title: media?.title,
      genres: media?.genres,
      synopsis: media?.synopsis,
      mediaType: media?.mediaType,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        className="glass-panel"
        style={{
          padding: '16px 20px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h2 style={{ fontSize: 'var(--text-h1)', fontWeight: 600 }}>Lore & Continuity Notes</h2>
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
              {notes.length} Lore Entries
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Document world mechanics, relics, factions, and run automated AI Plot Hole &amp; Continuity Audits.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            size="sm"
            icon={<Sparkles size={14} />}
            onClick={() => setIsAuditModalOpen(true)}
          >
            AI Continuity Audit
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => {
              setEditingNote(null);
              setNewTitle('');
              setNewCategory('World Rules');
              setNewContent('');
              setNewTags('');
              setIsAddNoteOpen(true);
            }}
          >
            New Lore Note
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {(['all', ...CATEGORIES] as string[]).map((cat) => {
          const count = cat === 'all' ? notes.length : notes.filter((n) => n.category === cat).length;
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              aria-pressed={isActive}
              style={{
                padding: '5px 12px',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border-subtle)'}`,
                backgroundColor: isActive ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontWeight: isActive ? 600 : 400,
                transition: 'all var(--transition-fast)',
              }}
            >
              {cat === 'all' ? 'All Categories' : cat} ({count})
            </button>
          );
        })}
      </div>

      {filteredNotes.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--border-medium)',
          }}
        >
          <BookOpen size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            {notes.length === 0 ? 'No Lore Notes Recorded' : `No "${selectedCategory}" Notes`}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', maxWidth: '420px', margin: '0 auto 16px auto' }}>
            {notes.length === 0
              ? 'Record world mechanics, faction histories, technology limits, and relic rules to maintain narrative continuity.'
              : `${notes.length} note(s) exist in other categories - switch filters or create one here.`}
          </p>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setIsAddNoteOpen(true)}>
            {notes.length === 0 ? 'Record First Lore Note' : 'Create Note in This Category'}
          </Button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredNotes.map((note) => (
            <div
              key={note.id}
              className="glass-panel"
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span
                    className="cv-kicker"
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--accent)',
                      backgroundColor: 'var(--accent-subtle)',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-xs)',
                    }}
                  >
                    {note.category}
                  </span>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      className="lore-action-btn"
                      onClick={() => handleEditNote(note)}
                      aria-label={`Edit "${note.title}"`}
                      title="Edit note"
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '22px',
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      className="lore-action-btn"
                      onClick={() => handleDeleteNote(note)}
                      aria-label={`Delete "${note.title}"`}
                      title="Delete note"
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '22px',
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  {note.title}
                </h3>

                <Markdown
                  source={note.contentMarkdown}
                  style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}
                />
              </div>

              {note.tags?.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                  {note.tags.map((tag, tagIndex) => (
                    <span
                      key={`${tag}_${tagIndex}`}
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        backgroundColor: 'var(--bg-tertiary)',
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-full)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={isAddNoteOpen}
        onClose={() => {
          setIsAddNoteOpen(false);
          setEditingNote(null);
        }}
        title={editingNote ? `Edit Lore Note: ${editingNote.title}` : 'Create New Lore Note'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Note Title *
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Hyperspace Jump Limitations, The Artifact Curse"
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Category
            </label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              aria-label="Note category"
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Lore Content & Rules (Markdown Supported) *
            </label>
            <textarea
              rows={5}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Define specific constraints, rules, biological laws, or faction motives..."
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                resize: 'vertical',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              placeholder="e.g. Physics, Defense, Secret"
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsAddNoteOpen(false);
                setEditingNote(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateNote} disabled={!newTitle.trim() || !newContent.trim()}>
              {editingNote ? 'Save Changes' : 'Save Lore Note'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        title="Local AI Screenplay Continuity & Plot Hole Audit"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Paste Scene Draft or Proposed Plot Action
            </label>
            <textarea
              rows={4}
              value={auditScenePrompt}
              onChange={(e) => setAuditScenePrompt(e.target.value)}
              placeholder="Paste your scene draft or dramatic sequence to audit against your recorded lore rules..."
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                resize: 'vertical',
              }}
            />
          </div>

          <Button
            variant="primary"
            size="sm"
            icon={<Sparkles size={14} />}
            onClick={handleRunContinuityAudit}
            disabled={isAuditing || !auditScenePrompt.trim()}
          >
            {isAuditing ? 'Auditing Against Lore Rules...' : 'Run Continuity Check'}
          </Button>

          {auditError && (
            <div
              role="alert"
              style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid var(--status-danger)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--status-danger)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              <span>{auditError}</span>
            </div>
          )}

          {auditResult && (
            <div
              className="glass-panel cv-border-glow"
              style={{
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                userSelect: 'text',
              }}
            >
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)', marginBottom: '6px' }}>
                AI Continuity Findings:
              </h4>
              <Markdown
                source={auditResult}
                style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
