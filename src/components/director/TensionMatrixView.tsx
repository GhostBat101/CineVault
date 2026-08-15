import React, { useState } from 'react';
import { Character, RelationshipLink, Media } from '../../types';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { UserPlus } from 'lucide-react';

interface TensionMatrixViewProps {
  media: Media | null;
}

const DEFAULT_CHARACTERS: Character[] = [
  { id: 'c1', mediaId: 'default', name: 'Dominic Cobb', roleType: 'protagonist', motivation: 'Return home to his children', secretBackstory: 'Guilt over Mal’s death and projection in the subconscious', createdAt: '', updatedAt: '' },
  { id: 'c2', mediaId: 'default', name: 'Mal Cobb', roleType: 'antagonist', motivation: 'Trapping Cobb in Limbo forever', secretBackstory: 'Cobb implanted the inception idea that led to her suicide', createdAt: '', updatedAt: '' },
  { id: 'c3', mediaId: 'default', name: 'Ariadne', roleType: 'deuteragonist', motivation: 'Designing subconscious architecture and saving Cobb', secretBackstory: 'The only architect who discovers Cobb’s secret projections', createdAt: '', updatedAt: '' },
  { id: 'c4', mediaId: 'default', name: 'Arthur', roleType: 'supporting', motivation: 'Executing flawless point-man logistics', secretBackstory: 'Pragmatic veteran who distrusts emotional variables', createdAt: '', updatedAt: '' },
  { id: 'c5', mediaId: 'default', name: 'Robert Fischer', roleType: 'supporting', motivation: 'Living up to his father’s impossible legacy', secretBackstory: 'Yearns for his dying father’s genuine approval', createdAt: '', updatedAt: '' },
];

const DEFAULT_RELATIONSHIPS: RelationshipLink[] = [
  { sourceCharacterId: 'c1', targetCharacterId: 'c2', relationshipType: 'Tragic Lovers / Hostile Projection', tensionScore: 10, notes: 'Extreme psychological danger in every dream layer.' },
  { sourceCharacterId: 'c1', targetCharacterId: 'c3', relationshipType: 'Mentor & Subconscious Anchor', tensionScore: 4, notes: 'Ariadne acts as Cobb’s moral mirror.' },
  { sourceCharacterId: 'c1', targetCharacterId: 'c4', relationshipType: 'Trusted Partners', tensionScore: 2, notes: 'Long-standing tactical partnership with slight friction over Mal.' },
  { sourceCharacterId: 'c1', targetCharacterId: 'c5', relationshipType: 'Inception Target & Manipulator', tensionScore: 8, notes: 'Cobb must deceive Fischer to plant the emotional catalyst.' },
  { sourceCharacterId: 'c2', targetCharacterId: 'c3', relationshipType: 'Subconscious Nemesis', tensionScore: 9, notes: 'Mal actively tries to murder Ariadne in the dream layers.' },
];

export const TensionMatrixView: React.FC<TensionMatrixViewProps> = ({
  media,
}) => {
  const [characters, setCharacters] = useState<Character[]>(DEFAULT_CHARACTERS);
  const [relationships, setRelationships] = useState<RelationshipLink[]>(DEFAULT_RELATIONSHIPS);

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
    const link = getRelationship(c1.id, c2.id);
    setEditingLink({ c1, c2, link });
    setModalTension(link ? link.tensionScore : 5);
    setModalType(link ? link.relationshipType : 'Allies / Acquaintances');
    setModalNotes(link?.notes || '');
  };

  const handleSaveRelationship = () => {
    if (!editingLink) return;
    const { c1, c2 } = editingLink;
    const updated: RelationshipLink = {
      sourceCharacterId: c1.id,
      targetCharacterId: c2.id,
      relationshipType: modalType,
      tensionScore: modalTension,
      notes: modalNotes,
    };

    setRelationships((prev) => {
      const filtered = prev.filter(
        (r) => !(
          (r.sourceCharacterId === c1.id && r.targetCharacterId === c2.id) ||
          (r.sourceCharacterId === c2.id && r.targetCharacterId === c1.id)
        )
      );
      return [...filtered, updated];
    });
    setEditingLink(null);
  };

  const handleAddCharacter = () => {
    if (!newCharName.trim()) return;
    const newChar: Character = {
      id: `char_${Date.now()}`,
      mediaId: media?.id || 'default',
      name: newCharName,
      roleType: newCharRole,
      motivation: newCharMotivation,
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

      {/* Tension Heatmap Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', color: 'var(--text-muted)' }}>
        <span>Tension Scale:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'rgba(16, 185, 129, 0.85)' }} />
          <span>1-3 (Allies / Low Friction)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'rgba(245, 158, 11, 0.85)' }} />
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

      {/* NxN Relational Matrix Grid */}
      <div
        className="glass-panel"
        style={{
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          overflowX: 'auto',
          padding: '16px',
        }}
      >
        <table style={{ borderCollapse: 'separate', borderSpacing: '6px', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>
                Cast ({characters.length})
              </th>
              {characters.map((c) => (
                <th
                  key={c.id}
                  style={{
                    padding: '8px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    minWidth: '110px',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                    {c.roleType}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {characters.map((c1) => (
              <tr key={c1.id}>
                <td style={{ padding: '8px', fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                  <div>{c1.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                    {c1.motivation || 'No motivation logged'}
                  </div>
                </td>

                {characters.map((c2) => {
                  if (c1.id === c2.id) {
                    return (
                      <td
                        key={c2.id}
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          borderRadius: 'var(--radius-sm)',
                          textAlign: 'center',
                          color: 'var(--text-muted)',
                          fontSize: '11px',
                          padding: '12px 6px',
                        }}
                      >
                        —
                      </td>
                    );
                  }

                  const rel = getRelationship(c1.id, c2.id);
                  const score = rel ? rel.tensionScore : 0;

                  return (
                    <td
                      key={c2.id}
                      onClick={() => handleCellClick(c1, c2)}
                      style={{
                        backgroundColor: rel ? getTensionColor(score) : 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        textAlign: 'center',
                        cursor: 'pointer',
                        padding: '10px 8px',
                        transition: 'all var(--transition-fast)',
                        border: '1px solid transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.04)';
                        e.currentTarget.style.borderColor = 'var(--text-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.borderColor = 'transparent';
                      }}
                      title={rel ? `${rel.relationshipType}: ${rel.notes}` : 'Click to define relationship'}
                    >
                      {rel ? (
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                            {score}/10
                          </div>
                          <div style={{ fontSize: '10px', color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>
                            {rel.relationshipType}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+ Add</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Relationship Modal */}
      {editingLink && (
        <Modal
          isOpen={true}
          onClose={() => setEditingLink(null)}
          title={`Relationship: ${editingLink.c1.name} ⟷ ${editingLink.c2.name}`}
          subtitle="Configure dramatic tension score and psychological dynamic"
          maxWidth="500px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Dramatic Tension Score (1 - 10)
                </label>
                <span style={{ fontSize: '13px', fontWeight: 700, color: getTensionColor(modalTension) }}>
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
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Relationship Dynamic / Label
              </label>
              <input
                type="text"
                value={modalType}
                onChange={(e) => setModalType(e.target.value)}
                placeholder="e.g. Secret Betrayal, Unrequited Love, Rivals"
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
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Subtext & Scene Notes
              </label>
              <textarea
                rows={3}
                value={modalNotes}
                onChange={(e) => setModalNotes(e.target.value)}
                placeholder="Key secrets, historical grudges, or turning points in the narrative..."
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

            <Button variant="primary" onClick={handleSaveRelationship}>
              Save Relationship
            </Button>
          </div>
        </Modal>
      )}

      {/* Add Character Modal */}
      <Modal
        isOpen={isAddCharOpen}
        onClose={() => setIsAddCharOpen(false)}
        title="Add Character Profile"
        subtitle="Introduce a new narrative actor into the tension matrix"
        maxWidth="480px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Character Name
            </label>
            <input
              type="text"
              value={newCharName}
              onChange={(e) => setNewCharName(e.target.value)}
              placeholder="e.g. Detective Sarah Vance"
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
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Role Type
            </label>
            <select
              value={newCharRole}
              onChange={(e) => setNewCharRole(e.target.value as any)}
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
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Core Dramatic Motivation
            </label>
            <textarea
              rows={2}
              value={newCharMotivation}
              onChange={(e) => setNewCharMotivation(e.target.value)}
              placeholder="What does this character want more than anything else?"
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
            onClick={handleAddCharacter}
            disabled={!newCharName.trim()}
          >
            Add to Matrix
          </Button>
        </div>
      </Modal>
    </div>
  );
};
