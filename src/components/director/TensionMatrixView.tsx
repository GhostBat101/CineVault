import React, { useState, useEffect } from 'react';
import { Character, RelationshipLink, Media } from '../../types';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { UserPlus, Users } from 'lucide-react';

interface TensionMatrixViewProps {
  media: Media | null;
}

export const TensionMatrixView: React.FC<TensionMatrixViewProps> = ({
  media,
}) => {
  const storageKey = media ? `cinevault_characters_${media.id}` : 'cinevault_characters_global';
  const relStorageKey = media ? `cinevault_relationships_${media.id}` : 'cinevault_relationships_global';

  const [characters, setCharacters] = useState<Character[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [relationships, setRelationships] = useState<RelationshipLink[]>(() => {
    try {
      const stored = localStorage.getItem(relStorageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(characters));
    } catch (e) {
      console.warn('Failed to persist characters:', e);
    }
  }, [characters, storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(relStorageKey, JSON.stringify(relationships));
    } catch (e) {
      console.warn('Failed to persist relationships:', e);
    }
  }, [relationships, relStorageKey]);

  // Edit Relationship Modal State
  const [editingLink, setEditingLink] = useState<{ c1: Character; c2: Character; link?: RelationshipLink } | null>(null);
  const [modalTension, setModalTension] = useState<number>(5);
  const [modalType, setModalType] = useState<string>('Complex');
  const [modalNotes, setModalNotes] = useState<string>('');

  // Add Character Modal State
  const [isAddCharOpen, setIsAddCharOpen] = useState(false);
  const [newCharName, setNewCharName] = useState('');
  const [newCharRole, setNewCharRole] = useState<'protagonist' | 'antagonist' | 'deuteragonist' | 'supporting' | 'cameo'>('supporting');
  const [newCharMotivation, setNewCharMotivation] = useState('');

  const getRelationship = (id1: string, id2: string): RelationshipLink | undefined => {
    return relationships.find(
      (r) => (r.sourceCharacterId === id1 && r.targetCharacterId === id2) ||
             (r.sourceCharacterId === id2 && r.targetCharacterId === id1)
    );
  };

  const getTensionColor = (score: number) => {
    if (score >= 9) return 'rgba(239, 68, 68, 0.85)'; // Red
    if (score >= 7) return 'rgba(249, 115, 22, 0.85)'; // Orange
    if (score >= 4) return 'rgba(245, 158, 11, 0.75)'; // Amber
    return 'rgba(16, 185, 129, 0.75)'; // Green
  };

  const handleCellClick = (c1: Character, c2: Character) => {
    if (c1.id === c2.id) return;
    const existing = getRelationship(c1.id, c2.id);
    setEditingLink({ c1, c2, link: existing });
    setModalTension(existing?.tensionScore || 5);
    setModalType(existing?.relationshipType || 'Allies / Shared Goal');
    setModalNotes(existing?.notes || '');
  };

  const handleSaveRelationship = () => {
    if (!editingLink) return;
    const { c1, c2 } = editingLink;

    const newLink: RelationshipLink = {
      sourceCharacterId: c1.id,
      targetCharacterId: c2.id,
      relationshipType: modalType,
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

  const handleAddCharacter = () => {
    if (!newCharName.trim()) return;
    const newChar: Character = {
      id: `char_${Date.now()}`,
      mediaId: media?.id || 'default',
      name: newCharName.trim(),
      roleType: newCharRole,
      motivation: newCharMotivation.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCharacters((prev) => [...prev, newChar]);
    setNewCharName('');
    setNewCharMotivation('');
    setIsAddCharOpen(false);
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
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Character Dynamic Tension Matrix</h2>
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
          onClick={() => setIsAddCharOpen(true)}
        >
          Add Character
        </Button>
      </div>

      {/* Legend Bar */}
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
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'rgba(16, 185, 129, 0.75)' }} />
          <span>1-3 (Allies / Low Friction)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'rgba(245, 158, 11, 0.75)' }} />
          <span>4-6 (Complex / Ambiguous)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'rgba(249, 115, 22, 0.85)' }} />
          <span>7-8 (Rivals / High Stakes)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'rgba(239, 68, 68, 0.85)' }} />
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
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', maxWidth: '400px', margin: '0 auto 16px auto' }}>
            Add the protagonist, antagonist, and supporting cast to generate the dynamic $N \times N$ friction heatmap.
          </p>
          <Button variant="primary" size="sm" icon={<UserPlus size={14} />} onClick={() => setIsAddCharOpen(true)}>
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
                  </td>

                  {characters.map((colChar) => {
                    const isSelf = rowChar.id === colChar.id;
                    const rel = getRelationship(rowChar.id, colChar.id);

                    if (isSelf) {
                      return (
                        <td
                          key={colChar.id}
                          style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                            borderRadius: 'var(--radius-sm)',
                            textAlign: 'center',
                            color: 'var(--text-muted)',
                            fontSize: '12px',
                          }}
                        >
                          —
                        </td>
                      );
                    }

                    return (
                      <td
                        key={colChar.id}
                        onClick={() => handleCellClick(rowChar, colChar)}
                        style={{
                          backgroundColor: rel ? getTensionColor(rel.tensionScore) : 'var(--bg-tertiary)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '10px 8px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)',
                          userSelect: 'none',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.03)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        {rel ? (
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
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
        title={editingLink ? `Tension: ${editingLink.c1.name} ↔ ${editingLink.c2.name}` : ''}
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
                outline: 'none',
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
                outline: 'none',
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

      {/* Add Character Modal */}
      <Modal
        isOpen={isAddCharOpen}
        onClose={() => setIsAddCharOpen(false)}
        title="Add Character to Narrative Cast"
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
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Narrative Role
            </label>
            <select
              value={newCharRole}
              onChange={(e: any) => setNewCharRole(e.target.value)}
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
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button variant="secondary" size="sm" onClick={() => setIsAddCharOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAddCharacter} disabled={!newCharName.trim()}>
              Add to Cast
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
