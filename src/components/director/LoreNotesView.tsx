/**
 * director/LoreNotesView.tsx
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * WHAT: Lore & continuity workspace: category-filtered note cards plus a
 *       creation modal and the Local AI Continuity Audit modal that checks a
 *       pasted scene draft against all recorded lore.
 *
 * PERSISTENCE CONTRACT (load-before-save):
 *   Notes live under `cinevault_lore_notes_<mediaId>` (or `_global` when no
 *   title is active). State hydrates for the CURRENT key before any write;
 *   writes are suppressed until `loadedKeyRef` matches the active key. This -
 *   combined with the parent remount key - prevents writing title A's notes
 *   into title B's storage on title switch.
 *
 * USES:    types/index.ts, common/{Button,Modal}.tsx, hooks/useAISummary.ts.
 * USED BY: DirectorSuite.tsx (rendered keyed by media id).
 */
import React, { useState, useEffect, useRef } from 'react';
import { LoreNote, Media } from '../../types';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Markdown } from '../common/Markdown';
import { Plus, Sparkles, BookOpen, Pencil, Trash2 } from 'lucide-react';
import { useAISummary } from '../../hooks/useAISummary';

interface LoreNotesViewProps {
  /** Active media entity; null stores under the `_global` key. */
  media: Media | null;
}

/** Canonical note categories offered by the filter pills + create form. */
const CATEGORIES = [
  'World Rules',
  'Relics & Tech',
  'Factions & Organizations',
  'Timeline Events',
  'Magic & Lore',
] as const;

/** Read a JSON array out of localStorage with defensive failure handling. */
function loadJsonArray<T>(key: string): T[] {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T[]) : [];
  } catch {
    return [];
  }
}

export const LoreNotesView: React.FC<LoreNotesViewProps> = ({
  media,
}) => {
  /** Storage key derived from the active title (or global fallback). */
  const storageKey = media ? `cinevault_lore_notes_${media.id}` : 'cinevault_lore_notes_global';

  /** Notes currently in state (hydrated from `storageKey`). */
  const [notes, setNotes] = useState<LoreNote[]>(() => loadJsonArray<LoreNote>(storageKey));
  /**
   * The storage key whose data is CURRENTLY loaded into state. Writes are
   * suppressed while this differs from `storageKey` (load-before-save).
   */
  const loadedKeyRef = useRef<string>(storageKey);

  // Hydrate state whenever the active title (and therefore key) changes.
  useEffect(() => {
    setNotes(loadJsonArray<LoreNote>(storageKey));
    loadedKeyRef.current = storageKey;
  }, [storageKey]);

  // Persist ONLY once the owning key matches the loaded one.
  useEffect(() => {
    if (loadedKeyRef.current !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(notes));
    } catch (e) {
      console.warn('Failed to persist lore notes:', e);
    }
  }, [notes, storageKey]);

  /** Selected category filter ('all' shows everything). */
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  /** Whether the create/edit-note modal is open. */
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  /** Note currently being edited; null means the modal creates a new note. */
  const [editingNote, setEditingNote] = useState<LoreNote | null>(null);

  // New Note Form State
  /** Draft note title. */
  const [newTitle, setNewTitle] = useState('');
  /** Draft note category. */
  const [newCategory, setNewCategory] = useState<string>('World Rules');
  /** Draft markdown content. */
  const [newContent, setNewContent] = useState('');
  /** Draft comma-separated tags string. */
  const [newTags, setNewTags] = useState('');

  // AI Continuity Audit State
  /** Whether the audit modal is open. */
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  /** Pasted scene draft to audit against the recorded lore. */
  const [auditScenePrompt, setAuditScenePrompt] = useState('');
  const {
    summary: auditResult,
    isGenerating: isAuditing,
    error: auditError,
    generateSummary: runAudit,
  } = useAISummary();

  /** Notes visible under the current category filter. */
  const filteredNotes =
    selectedCategory === 'all' ? notes : notes.filter((n) => n.category === selectedCategory);

  /** Create a new note (UUID id) or persist edits to an existing one. */
  const handleCreateNote = () => {
    if (!newTitle.trim() || !newContent.trim()) return;

    const tags = [...new Set(newTags.split(',').map((t) => t.trim()).filter(Boolean))];

    if (editingNote) {
      // Update-in-place preserving identity + creation timestamp.
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

  /** Open the modal pre-filled with the note's values in edit mode. */
  const handleEditNote = (note: LoreNote) => {
    setEditingNote(note);
    setNewTitle(note.title);
    setNewCategory(note.category);
    setNewContent(note.contentMarkdown);
    setNewTags(note.tags.join(', '));
    setIsAddNoteOpen(true);
  };

  /** Delete a note after explicit user confirmation. */
  const handleDeleteNote = (note: LoreNote) => {
    if (!window.confirm(`Delete lore note "${note.title}"? This cannot be undone.`)) return;
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
  };

  /** Run the AI continuity audit against ALL notes for the current title. */
  const handleRunContinuityAudit = () => {
    if (!auditScenePrompt.trim()) return;
    const loreContext = notes
      .map((n) => `[${n.category}] ${n.title}: ${n.contentMarkdown}`)
      .join('\n\n');

    const prompt = `Perform a screenplay continuity audit.\n\nEstablished Lore Rules:\n${loreContext || 'None specified.'}\n\nProposed Scene / Draft Action:\n${auditScenePrompt}\n\nCheck for plot holes, world rule violations, and logical contradictions.`;
    runAudit(prompt);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Info */}
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
              // Ensure CREATE mode (never inherit a stale editing target).
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

      {/* Category Filter Pills */}
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

      {/* Notes Grid or Empty State - copy distinguishes "no notes" vs "filter empty" */}
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

                  {/* Card Actions: edit / delete */}
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

                {/* Markdown-rendered content (safe subset renderer, no raw HTML) */}
                <Markdown
                  source={note.contentMarkdown}
                  style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}
                />
              </div>

              {note.tags && note.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                  {note.tags.map((tag, tagIndex) => (
                    <span
                      // Index suffix avoids duplicate keys when legacy data repeats tags
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
              )}
            </div>
          ))}
        </div>
      )}

      {/* New / Edit Lore Note Modal */}
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

      {/* AI Continuity Audit Modal */}
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
              }}
            >
              âš ï¸ {auditError}
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
