/**
 * director/TensionMatrixView.tsx
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * WHAT: Character Relationship Tension Matrix - an NÃ—N clickable grid where
 *       each cell opens a modal to set a 1-10 tension score, a relationship
 *       label, and subtext notes between two characters. Cast is managed via
 *       the "Add Character" modal.
 *
 * PERSISTENCE CONTRACT (load-before-save):
 *   Characters/relationships live in per-media localStorage keys
 *   (`cinevault_characters_<mediaId>` / `cinevault_relationships_<mediaId>`,
 *   falling back to `_global` when no title is active). State is hydrated for
 *   the CURRENT key before any write may happen; writes are skipped until
 *   `loadedKeyRef` matches the active key. This - combined with the parent
 *   remount key - prevents writing title A's data into title B's storage.
 *
 * USES:    types/index.ts, common/{Button,Modal}.tsx.
 * USED BY: DirectorSuite.tsx (rendered keyed by media id).
 */
import React, { useState, useEffect, useRef } from 'react';
import { Character, RelationshipLink, Media } from '../../types';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { UserPlus, Users, Pencil, Trash2 } from 'lucide-react';

interface TensionMatrixViewProps {
  /** Active media entity; null stores under the `_global` keys. */
  media: Media | null;
}

/** Shared inline style for the tiny edit/delete icon buttons in cast cells. */
const CHARACTER_ACTION_BTN_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-xs)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '22px',
  height: '20px',
  padding: 0,
};

/** Read a JSON array out of localStorage with defensive failure handling. */
function loadJsonArray<T>(key: string): T[] {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T[]) : [];
  } catch {
    return [];
  }
}

export const TensionMatrixView: React.FC<TensionMatrixViewProps> = ({
  media,
}) => {
  /** Storage keys derived from the active title (or global fallback). */
  const storageKey = media ? `cinevault_characters_${media.id}` : 'cinevault_characters_global';
  const relStorageKey = media ? `cinevault_relationships_${media.id}` : 'cinevault_relationships_global';

  /** Cast members currently in state (hydrated from `storageKey`). */
  const [characters, setCharacters] = useState<Character[]>(() => loadJsonArray<Character>(storageKey));
  /** Relationship edges currently in state (hydrated from `relStorageKey`). */
  const [relationships, setRelationships] = useState<RelationshipLink[]>(() => loadJsonArray<RelationshipLink>(relStorageKey));

  /**
   * Per-domain loaded keys: the characters and relationships stores hydrate
   * from DIFFERENT keys, so each persist effect must validate against ITS OWN
   * key (a single shared ref compared both domains against one string, which
   * silently disabled relationship persistence forever).
   */
  const loadedCharKeyRef = useRef<string>(storageKey);
  const loadedRelKeyRef = useRef<string>(relStorageKey);

  // Hydrate state whenever the active title (and therefore keys) change.
  useEffect(() => {
    setCharacters(loadJsonArray<Character>(storageKey));
    setRelationships(loadJsonArray<RelationshipLink>(relStorageKey));
    loadedCharKeyRef.current = storageKey;
    loadedRelKeyRef.current = relStorageKey;
    // relStorageKey always changes together with storageKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist characters ONLY once their owning key is the one loaded.
  useEffect(() => {
    if (loadedCharKeyRef.current !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(characters));
    } catch (e) {
      console.warn('Failed to persist characters:', e);
    }
  }, [characters, storageKey]);

  // Persist relationships ONLY once THEIR owning key is the one loaded.
  useEffect(() => {
    if (loadedRelKeyRef.current !== relStorageKey) return;
    try {
      localStorage.setItem(relStorageKey, JSON.stringify(relationships));
    } catch (e) {
      console.warn('Failed to persist relationships:', e);
    }
  }, [relationships, relStorageKey]);

  // Edit Relationship Modal State
  /** Pair being edited plus its existing link, if any. */
  const [editingLink, setEditingLink] = useState<{ c1: Character; c2: Character; link?: RelationshipLink } | null>(null);
  /** Draft tension score (1-10) inside the edit modal. */
  const [modalTension, setModalTension] = useState<number>(5);
  /** Draft relationship label inside the edit modal. */
  const [modalType, setModalType] = useState<string>('Complex');
  /** Draft subtext notes inside the edit modal. */
  const [modalNotes, setModalNotes] = useState<string>('');

  // Add / Edit Character Modal State
  /** Whether the character modal is open (create OR edit mode). */
  const [isAddCharOpen, setIsAddCharOpen] = useState(false);
  /** Character being edited; null means the modal creates a new one. */
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  /** Draft name for the new/edited character. */
  const [newCharName, setNewCharName] = useState('');
  /** Draft narrative role for the new/edited character. */
  const [newCharRole, setNewCharRole] = useState<'protagonist' | 'antagonist' | 'deuteragonist' | 'supporting' | 'cameo'>('supporting');
  /** Draft core desire/motivation for the new/edited character. */
  const [newCharMotivation, setNewCharMotivation] = useState('');

  /** Find the undirected link between two character ids, if present. */
  const getRelationship = (id1: string, id2: string): RelationshipLink | undefined => {
    return relationships.find(
      (r) => (r.sourceCharacterId === id1 && r.targetCharacterId === id2) ||
             (r.sourceCharacterId === id2 && r.targetCharacterId === id1)
    );
  };

  /** Map a tension score to its heatmap color bucket. Single source of truth
      for both cell fills and the legend below. */
  const getTensionColor = (score: number): string => {
    if (score >= 9) return 'rgba(239, 68, 68, 0.85)'; // Red
    if (score >= 7) return 'rgba(249, 115, 22, 0.85)'; // Orange
    if (score >= 4) return 'rgba(245, 158, 11, 0.75)'; // Amber
    return 'rgba(16, 185, 129, 0.75)'; // Green
  };

  /** Open the edit modal pre-filled with the pair's existing link (defaults consistent). */
  const handleCellClick = (c1: Character, c2: Character) => {
    if (c1.id === c2.id) return;
    const existing = getRelationship(c1.id, c2.id);
    setEditingLink({ c1, c2, link: existing });
    setModalTension(existing?.tensionScore || 5);
    setModalType(existing?.relationshipType || 'Complex');
    setModalNotes(existing?.notes || '');
  };

  /** Upsert the edited relationship edge (replaces any link between the pair). */
  const handleSaveRelationship = () => {
    if (!editingLink) return;
    const { c1, c2 } = editingLink;

    const newLink: RelationshipLink = {
      sourceCharacterId: c1.id,
      targetCharacterId: c2.id,
      relationshipType: modalType.trim() || 'Complex',
      tensionScore: modalTension,
      notes: modalNotes,
    };

    setRelationships((prev) => {
      const filtered = prev.filter(
        (r) =>
          !(
            (r.sourceCharacterId === c1.id && r.targetCharacterId === c2.id) ||
            (r.sourceCharacterId === c2.id && r.targetCharacterId === c1.id)
          )
      );
      return [...filtered, newLink];
    });

    setEditingLink(null);
  };

  /** Create a new cast member (UUID) or apply edits to an existing one. */
  const handleAddCharacter = () => {
    if (!newCharName.trim()) return;

    if (editingCharacter) {
      setCharacters((prev) =>
        prev.map((c) =>
          c.id === editingCharacter.id
            ? {
                ...c,
                name: newCharName.trim(),
                roleType: newCharRole,
                motivation: newCharMotivation.trim() || undefined,
                updatedAt: new Date().toISOString(),
              }
            : c
        )
      );
    } else {
      const nowIso = new Date().toISOString();
      const newChar: Character = {
        id: `char_${crypto.randomUUID()}`,
        mediaId: media?.id || 'default',
        name: newCharName.trim(),
        roleType: newCharRole,
        motivation: newCharMotivation.trim() || undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setCharacters((prev) => [...prev, newChar]);
    }

    setNewCharName('');
    setNewCharMotivation('');
    setEditingCharacter(null);
    setIsAddCharOpen(false);
  };

  /** Open the character modal pre-filled in EDIT mode. */
  const handleEditCharacter = (char: Character) => {
    setEditingCharacter(char);
    setNewCharName(char.name);
    setNewCharRole(char.roleType);
    setNewCharMotivation(char.motivation || '');
    setIsAddCharOpen(true);
  };

  /** Delete a character after confirmation, cascading their relationships. */
  const handleDeleteCharacter = (char: Character) => {
    if (!window.confirm(`Remove "${char.name}" from the cast? Their relationship links will also be deleted.`)) {
      return;
    }
    setCharacters((prev) => prev.filter((c) => c.id !== char.id));
    setRelationships((prev) =>
      prev.filter((r) => r.sourceCharacterId !== char.id && r.targetCharacterId !== char.id)
    );
  };

  /** Open the modal in guaranteed CREATE mode with cleared drafts. */
  const openAddCharacterModal = () => {
    setEditingCharacter(null);
    setNewCharName('');
    setNewCharMotivation('');
    setIsAddCharOpen(true);
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
            <h2 style={{ fontSize: 'var(--text-h1)', fontWeight: 600 }}>Character Dynamic Tension Matrix</h2>
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
              NxN Relational Grid
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Track relational subtext, betrayal arcs, and dramatic friction scores (1-10) across all characters.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={<UserPlus size={14} />}
          onClick={openAddCharacterModal}
        >
          Add Character
        </Button>
      </div>

      {/* Legend Bar - colors derive from getTensionColor (single source of truth) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: '12px',
          color: 'var(--text-muted)',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Tension Scale:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: getTensionColor(2) }} />
          <span>1-3 (Allies / Low Friction)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: getTensionColor(5) }} />
          <span>4-6 (Complex / Ambiguous)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: getTensionColor(7) }} />
          <span>7-8 (Rivals / High Stakes)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: getTensionColor(10) }} />
          <span>9-10 (Lethal Nemesis / Betrayal)</span>
        </div>
      </div>

      {/* Tension Matrix Table or Empty State */}
      {characters.length === 0 ? (
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
          <Users size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            No Characters Added Yet
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 16px auto' }}>
            Add the protagonist, antagonist, and supporting cast to generate the dynamic N Ã— N friction heatmap.
          </p>
          <Button variant="primary" size="sm" icon={<UserPlus size={14} />} onClick={openAddCharacterModal}>
            Add First Character
          </Button>
        </div>
      ) : (
        <div
          className="glass-panel"
          style={{
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-secondary)',
            overflowX: 'auto',
            padding: '16px',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px' }}>
            <thead>
              <tr>
                <th
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    minWidth: '180px',
                  }}
                >
                  Cast ({characters.length})
                </th>
                {characters.map((char) => (
                  <th
                    key={char.id}
                    style={{
                      padding: '10px 12px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      minWidth: '140px',
                    }}
                  >
                    <div>{char.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                      {char.roleType}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {characters.map((rowChar) => (
                <tr key={rowChar.id}>
                  <td
                    style={{
                      padding: '12px 16px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}
                  >
                    <div>{rowChar.name}</div>
                    {rowChar.motivation && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                        {rowChar.motivation}
                      </div>
                    )}
                    {/* Per-character actions: edit / delete (cascades links) */}
                    <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleEditCharacter(rowChar)}
                        aria-label={`Edit ${rowChar.name}`}
                        title={`Edit ${rowChar.name}`}
                        style={CHARACTER_ACTION_BTN_STYLE}
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCharacter(rowChar)}
                        aria-label={`Remove ${rowChar.name} from cast`}
                        title={`Remove ${rowChar.name}`}
                        style={CHARACTER_ACTION_BTN_STYLE}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>

                  {characters.map((colChar) => {
                    const isSelf = rowChar.id === colChar.id;
                    const rel = getRelationship(rowChar.id, colChar.id);

                    if (isSelf) {
                      return (
                        <td
                          key={colChar.id}
                          style={{
                            backgroundColor: 'var(--bg-raised)',
                            borderRadius: 'var(--radius-sm)',
                            textAlign: 'center',
                            color: 'var(--text-muted)',
                            fontSize: '12px',
                          }}
                        >
                          â€”
                        </td>
                      );
                    }

                    return (
                      <td
                        key={colChar.id}
                        onClick={() => handleCellClick(rowChar, colChar)}
                        role="button"
                        tabIndex={0}
                        aria-label={`${rowChar.name} and ${colChar.name}: ${rel ? `${rel.tensionScore}/10, ${rel.relationshipType}. Activate to edit.` : 'no relationship set. Activate to add.'}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleCellClick(rowChar, colChar);
                          }
                        }}
                        style={{
                          backgroundColor: rel ? getTensionColor(rel.tensionScore) : 'var(--bg-tertiary)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '10px 8px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'box-shadow var(--transition-fast)',
                          userSelect: 'none',
                        }}
                        // Glow-only hover: no transform, so rows never jitter.
                        onMouseEnter={(e) => {
                          e.currentTarget.style.boxShadow = 'var(--glow-accent)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        {rel ? (
                          <div>
                            <div
                              style={{
                                fontSize: '13px',
                                fontWeight: 700,
                                color: 'rgba(255, 255, 255, 0.96)',
                                textShadow: '0 1px 2px rgba(0, 0, 0, 0.55)',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {rel.tensionScore}/10
                            </div>
                            <div
                              style={{
                                fontSize: '10px',
                                color: 'rgba(255, 255, 255, 0.9)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '120px',
                                margin: '0 auto',
                              }}
                              title={rel.relationshipType}
                            >
                              {rel.relationshipType}
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+ Add</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Relationship Modal */}
      <Modal
        isOpen={Boolean(editingLink)}
        onClose={() => setEditingLink(null)}
        title={editingLink ? `Tension: ${editingLink.c1.name} â†” ${editingLink.c2.name}` : ''}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Friction / Tension Level</label>
              <span style={{ fontSize: '14px', fontWeight: 700, color: getTensionColor(modalTension) }}>
                {modalTension} / 10
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={modalTension}
              onChange={(e) => setModalTension(Number(e.target.value))}
              aria-label="Friction level"
              style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Dynamic / Relationship Label
            </label>
            <input
              type="text"
              value={modalType}
              onChange={(e) => setModalType(e.target.value)}
              placeholder="e.g. Rivals, Former Mentors, Tragic Lovers"
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
              Subtext & Dramatic Conflict Notes
            </label>
            <textarea
              rows={3}
              value={modalNotes}
              onChange={(e) => setModalNotes(e.target.value)}
              placeholder="What secret leverage, unsaid grievances, or underlying motives fuel their interactions?"
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button variant="secondary" size="sm" onClick={() => setEditingLink(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveRelationship}>
              Save Relationship
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add / Edit Character Modal */}
      <Modal
        isOpen={isAddCharOpen}
        onClose={() => {
          setIsAddCharOpen(false);
          setEditingCharacter(null);
        }}
        title={editingCharacter ? `Edit Character: ${editingCharacter.name}` : 'Add Character to Narrative Cast'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Character Name *
            </label>
            <input
              type="text"
              value={newCharName}
              onChange={(e) => setNewCharName(e.target.value)}
              placeholder="e.g. Sarah Connor, Tyler Durden"
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
              Narrative Role
            </label>
            <select
              value={newCharRole}
              onChange={(e) => setNewCharRole(e.target.value as typeof newCharRole)}
              aria-label="Narrative role"
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
              <option value="protagonist">Protagonist</option>
              <option value="antagonist">Antagonist</option>
              <option value="deuteragonist">Deuteragonist</option>
              <option value="supporting">Supporting</option>
              <option value="cameo">Cameo</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Core Desire / Motivation
            </label>
            <input
              type="text"
              value={newCharMotivation}
              onChange={(e) => setNewCharMotivation(e.target.value)}
              placeholder="e.g. Uncover the truth behind the project"
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
                setIsAddCharOpen(false);
                setEditingCharacter(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddCharacter}
              disabled={!newCharName.trim()}
            >
              {editingCharacter ? 'Save Character' : 'Add to Cast'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
