import React, { useState, useEffect } from 'react';
import { LoreNote, Media } from '../../types';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Plus, Sparkles, BookOpen } from 'lucide-react';
import { useAISummary } from '../../hooks/useAISummary';

interface LoreNotesViewProps {
  media: Media | null;
}

export const LoreNotesView: React.FC<LoreNotesViewProps> = ({
  media,
}) => {
  const storageKey = media ? `cinevault_lore_notes_${media.id}` : 'cinevault_lore_notes_global';

  const [notes, setNotes] = useState<LoreNote[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(notes));
    } catch (e) {
      console.warn('Failed to persist lore notes:', e);
    }
  }, [notes, storageKey]);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);

  // New Note Form State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('World Rules');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');

  // AI Continuity Audit State
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditScenePrompt, setAuditScenePrompt] = useState('');
  const { summary: auditResult, isGenerating: isAuditing, generateSummary: runAudit } = useAISummary();

  const categories = [
    'all',
    'World Rules',
    'Relics & Tech',
    'Factions & Organizations',
    'Timeline Events',
    'Magic & Lore',
  ];

  const filteredNotes = selectedCategory === 'all'
    ? notes
    : notes.filter((n) => n.category === selectedCategory);

  const handleCreateNote = () => {
    if (!newTitle.trim() || !newContent.trim()) return;

    const newNote: LoreNote = {
      id: `lore_${Date.now()}`,
      mediaId: media?.id || 'default',
      category: newCategory,
      title: newTitle.trim(),
      contentMarkdown: newContent.trim(),
      tags: newTags.split(',').map((t) => t.trim()).filter(Boolean),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setNotes((prev) => [newNote, ...prev]);
    setNewTitle('');
    setNewContent('');
    setNewTags('');
    setIsAddNoteOpen(false);
  };

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
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Lore & Continuity Notes</h2>
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
              {notes.length} Lore Entries
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Document world mechanics, relics, factions, and run automated AI Plot Hole &amp; Continuity Audits.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
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
            onClick={() => setIsAddNoteOpen(true)}
          >
            New Lore Note
          </Button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {categories.map((cat) => {
          const count = cat === 'all' ? notes.length : notes.filter((n) => n.category === cat).length;
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
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

      {/* Notes Grid or Empty State */}
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
            No Lore Notes Recorded
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', maxWidth: '420px', margin: '0 auto 16px auto' }}>
            Record world mechanics, faction histories, technology limits, and relic rules to maintain narrative continuity.
          </p>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setIsAddNoteOpen(true)}>
            Record First Lore Note
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
                </div>

                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  {note.title}
                </h3>

                <p
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {note.contentMarkdown}
                </p>
              </div>

              {note.tags && note.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        backgroundColor: 'var(--bg-tertiary)',
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-xs)',
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

      {/* New Lore Note Modal */}
      <Modal
        isOpen={isAddNoteOpen}
        onClose={() => setIsAddNoteOpen(false)}
        title="Create New Lore Note"
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
                outline: 'none',
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
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
              }}
            >
              <option value="World Rules">World Rules</option>
              <option value="Relics & Tech">Relics & Tech</option>
              <option value="Factions & Organizations">Factions & Organizations</option>
              <option value="Timeline Events">Timeline Events</option>
              <option value="Magic & Lore">Magic & Lore</option>
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
                outline: 'none',
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
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button variant="secondary" size="sm" onClick={() => setIsAddNoteOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateNote} disabled={!newTitle.trim() || !newContent.trim()}>
              Save Lore Note
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
                outline: 'none',
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

          {auditResult && (
            <div
              className="glass-panel"
              style={{
                padding: '14px',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-medium)',
              }}
            >
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)', marginBottom: '6px' }}>
                AI Continuity Findings:
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                {auditResult}
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
