import React, { useState } from 'react';
import { LoreNote, Media } from '../../types';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Plus, Sparkles, ShieldCheck } from 'lucide-react';
import { useAISummary } from '../../hooks/useAISummary';

interface LoreNotesViewProps {
  media: Media | null;
}

const DEFAULT_LORE_NOTES: LoreNote[] = [
  {
    id: 'l1',
    mediaId: 'default',
    category: 'World Rules',
    title: 'The Kick & Dream Instability',
    contentMarkdown: 'A sudden fall or immersion in water disrupts inner-ear balance to wake the dreamer.\nSedatives at level 3 prevent normal waking and risk trapping dying minds in Limbo for decades of perceived time.',
    tags: ['Mechanics', 'Limbo', 'Dream Layers'],
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'l2',
    mediaId: 'default',
    category: 'Relics & Tech',
    title: 'Totems & Subconscious Defense',
    contentMarkdown: 'Small custom objects with unique weight or balance known only to the owner (e.g., loaded die, weighted chess piece, spinning top) allowing one to test whether they are inside someone else’s dream.',
    tags: ['Totem', 'Subconscious'],
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'l3',
    mediaId: 'default',
    category: 'Factions & Organizations',
    title: 'Cobol Engineering & Saito’s Syndicate',
    contentMarkdown: 'Global corporate espionage competitors seeking total dominance over military and energy patents through extraction and inception.',
    tags: ['Espionage', 'Syndicate'],
    createdAt: '',
    updatedAt: '',
  },
];

export const LoreNotesView: React.FC<LoreNotesViewProps> = ({
  media,
}) => {
  const [notes, setNotes] = useState<LoreNote[]>(DEFAULT_LORE_NOTES);
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
  const { isGenerating, summary: auditSummary, generateSummary } = useAISummary();

  const categories = ['World Rules', 'Relics & Tech', 'Factions & Organizations', 'Timeline Events', 'Magic & Lore'];

  const filteredNotes = selectedCategory === 'all'
    ? notes
    : notes.filter((n) => n.category === selectedCategory);

  const handleAddNote = () => {
    if (!newTitle.trim()) return;
    const newNote: LoreNote = {
      id: `lore_${Date.now()}`,
      mediaId: media?.id || 'default',
      category: newCategory,
      title: newTitle,
      contentMarkdown: newContent,
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

  const handleRunAudit = () => {
    if (!auditScenePrompt.trim()) return;
    const establishedRules = notes.map((n) => `[${n.category}] ${n.title}: ${n.contentMarkdown}`).join('\n');
    generateSummary(
      `Perform a strict Lore Continuity & Plot Hole Audit for the proposed scene.\nEstablished World Lore & Rules:\n${establishedRules}\n\nProposed Scene Action:\n${auditScenePrompt}`,
      0.4
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Info */}
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
            Document world mechanics, relics, factions, and run automated AI Plot Hole & Continuity Audits.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
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

      {/* Category Filter Chips */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setSelectedCategory('all')}
          style={{
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            border: 'none',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            background: selectedCategory === 'all' ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: selectedCategory === 'all' ? 'var(--bg-primary)' : 'var(--text-secondary)',
            transition: 'all var(--transition-fast)',
          }}
        >
          All Categories ({notes.length})
        </button>

        {categories.map((cat) => {
          const count = notes.filter((n) => n.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                border: 'none',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                background: selectedCategory === cat ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: selectedCategory === cat ? 'var(--bg-primary)' : 'var(--text-secondary)',
                transition: 'all var(--transition-fast)',
              }}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Notes Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: 'var(--accent)',
                    backgroundColor: 'var(--accent-subtle)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-xs)',
                  }}
                >
                  {note.category}
                </span>
              </div>

              <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                {note.title}
              </h4>

              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                {note.contentMarkdown}
              </p>
            </div>

            {/* Tags */}
            {note.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                {note.tags.map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      backgroundColor: 'var(--bg-tertiary)',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-xs)',
                    }}
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Note Modal */}
      <Modal
        isOpen={isAddNoteOpen}
        onClose={() => setIsAddNoteOpen(false)}
        title="Add Lore & Continuity Entry"
        subtitle="Log world mechanics, factions, artifacts, or timeline axioms"
        maxWidth="520px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Note Title
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Dream Time Dilation Factor"
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
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
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Tags (comma separated)
              </label>
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="Mechanics, Rules"
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
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Lore Content (Markdown Supported)
            </label>
            <textarea
              rows={4}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Explain the in-universe rule or historical backstory in detail..."
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </div>

          <Button variant="primary" onClick={handleAddNote} disabled={!newTitle.trim()}>
            Save Lore Note
          </Button>
        </div>
      </Modal>

      {/* AI Continuity Audit Modal */}
      <Modal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        title="Local AI Continuity & Plot Hole Audit"
        subtitle="Cross-examine proposed scene actions against all established lore rules and character motivations"
        maxWidth="620px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Proposed Scene Action / Event
            </label>
            <textarea
              rows={3}
              value={auditScenePrompt}
              onChange={(e) => setAuditScenePrompt(e.target.value)}
              placeholder="e.g. Cobb shoots Mal in the level 3 snow fortress, but then uses his totem to wake himself up without a kick..."
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </div>

          <Button
            variant="primary"
            onClick={handleRunAudit}
            isLoading={isGenerating}
            disabled={!auditScenePrompt.trim()}
            icon={<Sparkles size={14} />}
          >
            Run Local Continuity Audit
          </Button>

          {/* Audit Results View */}
          {auditSummary && (
            <div
              className="glass-panel"
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--accent)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)', marginBottom: '8px' }}>
                <ShieldCheck size={16} />
                <strong style={{ fontSize: '13px' }}>Continuity Audit Report</strong>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                {auditSummary}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
