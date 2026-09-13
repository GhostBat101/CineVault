/**
 * File Purpose: Cinematography cues workspace managing scene color palettes, lens choices, aspect ratios, and lighting styles.
 * Communication Matrix: Rendered in DirectorSuite.tsx; persists to SQLite via api.ts with localStorage fallback.
 */

import React, { useState, useEffect, useRef } from 'react';
import { CinematographyCue, Media } from '../../types';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { api, isTauri } from '../../services/api';
import { Camera, Plus, Pencil, Trash2, Palette } from 'lucide-react';

interface CinematographyCuesViewProps {
  media: Media | null;
}

interface PalettePreset {
  name: string;
  dominant: string;
  accent: string;
  shadow: string;
}

const ASPECT_RATIOS = [
  '2.39:1 (Anamorphic Widescreen)',
  '1.85:1 (Flat Standard)',
  '1.43:1 (IMAX 70mm)',
  '16:9 (1.78:1 Television)',
  '4:3 (1.33:1 Academy Ratio)',
  '2.00:1 (Univisium)',
];

const LENS_CHOICES = [
  '24mm Wide Angle',
  '35mm Master Prime',
  '50mm Standard Prime',
  '85mm Portrait Telephoto',
  '135mm Compression Telephoto',
  'Anamorphic 40mm 2x Squeeze',
];

const LIGHTING_STYLES = [
  'Chiaroscuro / High Contrast',
  'Rembrandt Lighting',
  'Naturalistic / Available Light',
  'Motivated Practical Neon',
  'Silhouette / Heavy Backlight',
  'Diffusion / Golden Hour Soft',
];

const PALETTE_PRESETS: PalettePreset[] = [
  { name: 'Obsidian Noir', dominant: '#0a0a0f', accent: '#d4af37', shadow: '#050508' },
  { name: 'Cyber Neon', dominant: '#0d1117', accent: '#00ffcc', shadow: '#050811' },
  { name: 'Crimson Velvet', dominant: '#1a0505', accent: '#e63946', shadow: '#0d0202' },
  { name: 'Golden Hour', dominant: '#261b11', accent: '#f4a261', shadow: '#140c06' },
  { name: 'Emerald Shadow', dominant: '#071811', accent: '#2a9d8f', shadow: '#030d09' },
];

function loadStoredCues(key: string): CinematographyCue[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CinematographyCue[]) : [];
  } catch {
    return [];
  }
}

export const CinematographyCuesView: React.FC<CinematographyCuesViewProps> = ({ media }) => {
  const storageKey = media ? `cinevault_cinematography_${media.id}` : 'cinevault_cinematography_global';

  const [cues, setCues] = useState<CinematographyCue[]>(() => loadStoredCues(storageKey));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCue, setEditingCue] = useState<CinematographyCue | null>(null);

  const [sceneTitle, setSceneTitle] = useState('');
  const [dominantColor, setDominantColor] = useState('#0a0a0f');
  const [accentColor, setAccentColor] = useState('#d4af37');
  const [shadowColor, setShadowColor] = useState('#050508');
  const [lightingStyle, setLightingStyle] = useState(LIGHTING_STYLES[0]);
  const [lensChoice, setLensChoice] = useState(LENS_CHOICES[1]);
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0]);
  const [audioThemeNotes, setAudioThemeNotes] = useState('');

  const loadedKeyRef = useRef<string>(storageKey);

  useEffect(() => {
    let isCurrent = true;
    const loadData = async () => {
      if (media && isTauri()) {
        try {
          const dbCues = await api.getCinematographyCues(media.id);
          if (isCurrent && Array.isArray(dbCues) && dbCues.length > 0) {
            setCues(dbCues);
            loadedKeyRef.current = storageKey;
            return;
          }
        } catch {
        }
      }
      if (isCurrent) {
        setCues(loadStoredCues(storageKey));
        loadedKeyRef.current = storageKey;
      }
    };
    loadData();
    return () => {
      isCurrent = false;
    };
  }, [media, storageKey]);

  useEffect(() => {
    if (loadedKeyRef.current !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(cues));
    } catch {
    }

    if (media && isTauri()) {
      api.saveCinematographyCues(media.id, cues).catch(() => {});
    }
  }, [cues, media, storageKey]);

  const handleOpenCreateModal = () => {
    setEditingCue(null);
    setSceneTitle('');
    setDominantColor('#0a0a0f');
    setAccentColor('#d4af37');
    setShadowColor('#050508');
    setLightingStyle(LIGHTING_STYLES[0]);
    setLensChoice(LENS_CHOICES[1]);
    setAspectRatio(ASPECT_RATIOS[0]);
    setAudioThemeNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cue: CinematographyCue) => {
    setEditingCue(cue);
    setSceneTitle(cue.sceneTitle);
    setDominantColor(cue.colorPalette?.dominant || '#0a0a0f');
    setAccentColor(cue.colorPalette?.accent || '#d4af37');
    setShadowColor(cue.colorPalette?.shadow || '#050508');
    setLightingStyle(cue.lightingStyle || LIGHTING_STYLES[0]);
    setLensChoice(cue.lensChoice || LENS_CHOICES[1]);
    setAspectRatio(cue.aspectRatio || ASPECT_RATIOS[0]);
    setAudioThemeNotes(cue.audioThemeNotes || '');
    setIsModalOpen(true);
  };

  const handleApplyPreset = (preset: PalettePreset) => {
    setDominantColor(preset.dominant);
    setAccentColor(preset.accent);
    setShadowColor(preset.shadow);
  };

  const handleSaveCue = () => {
    if (!sceneTitle.trim()) return;

    if (editingCue) {
      setCues((prev) =>
        prev.map((c) =>
          c.id === editingCue.id
            ? {
                ...c,
                sceneTitle: sceneTitle.trim(),
                colorPalette: {
                  dominant: dominantColor,
                  accent: accentColor,
                  shadow: shadowColor,
                },
                lightingStyle,
                lensChoice,
                aspectRatio,
                audioThemeNotes: audioThemeNotes.trim() || undefined,
              }
            : c
        )
      );
    } else {
      const newCue: CinematographyCue = {
        id: `cue_${crypto.randomUUID()}`,
        mediaId: media?.id || 'default',
        sceneTitle: sceneTitle.trim(),
        colorPalette: {
          dominant: dominantColor,
          accent: accentColor,
          shadow: shadowColor,
        },
        lightingStyle,
        lensChoice,
        aspectRatio,
        audioThemeNotes: audioThemeNotes.trim() || undefined,
      };
      setCues((prev) => [...prev, newCue]);
    }

    setIsModalOpen(false);
    setEditingCue(null);
  };

  const handleDeleteCue = (cue: CinematographyCue) => {
    if (!window.confirm(`Delete cinematography cue "${cue.sceneTitle}"?`)) return;
    setCues((prev) => prev.filter((c) => c.id !== cue.id));
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
            <h2 style={{ fontSize: 'var(--text-h1)', fontWeight: 600 }}>Cinematography & Visual Cues</h2>
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
              {cues.length} Visual Cues
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Orchestrate color palettes, optical lenses, aspect ratios, and lighting schemes for key scenes.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={handleOpenCreateModal}
        >
          Add Scene Cue
        </Button>
      </div>

      {cues.length === 0 ? (
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
          <Camera size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            No Cinematography Cues Defined
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 16px auto' }}>
            Establish the visual grammar of your production with precise color temperature, focal lengths, and framing ratios.
          </p>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={handleOpenCreateModal}>
            Create First Scene Cue
          </Button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px',
          }}
        >
          {cues.map((cue) => (
            <div
              key={cue.id}
              className="glass-panel"
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                    {cue.sceneTitle}
                  </h3>
                  {cue.aspectRatio && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--accent)',
                        backgroundColor: 'var(--accent-subtle)',
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-xs)',
                      }}
                    >
                      {cue.aspectRatio}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(cue)}
                    aria-label={`Edit ${cue.sceneTitle}`}
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
                    onClick={() => handleDeleteCue(cue)}
                    aria-label={`Delete ${cue.sceneTitle}`}
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  COLOR PALETTE
                </div>
                <div
                  style={{
                    display: 'flex',
                    height: '28px',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    border: '1px solid var(--border-medium)',
                  }}
                >
                  <div
                    style={{ flex: 2, backgroundColor: cue.colorPalette?.dominant || '#0a0a0f' }}
                    title={`Dominant: ${cue.colorPalette?.dominant || '#0a0a0f'}`}
                  />
                  <div
                    style={{ flex: 1, backgroundColor: cue.colorPalette?.accent || '#d4af37' }}
                    title={`Accent: ${cue.colorPalette?.accent || '#d4af37'}`}
                  />
                  <div
                    style={{ flex: 1.5, backgroundColor: cue.colorPalette?.shadow || '#050508' }}
                    title={`Shadow: ${cue.colorPalette?.shadow || '#050508'}`}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  <span>Dom: {cue.colorPalette?.dominant || '#0a0a0f'}</span>
                  <span>Acc: {cue.colorPalette?.accent || '#d4af37'}</span>
                  <span>Shd: {cue.colorPalette?.shadow || '#050508'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '11px' }}>
                {cue.lensChoice && (
                  <span
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '2px 8px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Lens: {cue.lensChoice}
                  </span>
                )}
                {cue.lightingStyle && (
                  <span
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '2px 8px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Light: {cue.lightingStyle}
                  </span>
                )}
              </div>

              {cue.audioThemeNotes && (
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-tertiary)',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: '2px solid var(--accent)',
                  }}
                >
                  {cue.audioThemeNotes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCue ? `Edit Cue: ${editingCue.sceneTitle}` : 'New Cinematography Cue'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Scene Title / Cue Name *
            </label>
            <input
              type="text"
              value={sceneTitle}
              onChange={(e) => setSceneTitle(e.target.value)}
              placeholder="e.g. Desert Rooftop Chase, The Interrogation Chamber"
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
              Color Palette Presets
            </label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {PALETTE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 8px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  <Palette size={12} />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Dominant Color
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="color"
                  value={dominantColor}
                  onChange={(e) => setDominantColor(e.target.value)}
                  style={{
                    width: '32px',
                    height: '32px',
                    border: 'none',
                    borderRadius: 'var(--radius-xs)',
                    cursor: 'pointer',
                    backgroundColor: 'transparent',
                  }}
                />
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {dominantColor}
                </span>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Accent Color
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  style={{
                    width: '32px',
                    height: '32px',
                    border: 'none',
                    borderRadius: 'var(--radius-xs)',
                    cursor: 'pointer',
                    backgroundColor: 'transparent',
                  }}
                />
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {accentColor}
                </span>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Shadow Color
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="color"
                  value={shadowColor}
                  onChange={(e) => setShadowColor(e.target.value)}
                  style={{
                    width: '32px',
                    height: '32px',
                    border: 'none',
                    borderRadius: 'var(--radius-xs)',
                    cursor: 'pointer',
                    backgroundColor: 'transparent',
                  }}
                />
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {shadowColor}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Aspect Ratio
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                }}
              >
                {ASPECT_RATIOS.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Lens Choice
              </label>
              <select
                value={lensChoice}
                onChange={(e) => setLensChoice(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                }}
              >
                {LENS_CHOICES.map((lens) => (
                  <option key={lens} value={lens}>
                    {lens}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Lighting Style
              </label>
              <select
                value={lightingStyle}
                onChange={(e) => setLightingStyle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                }}
              >
                {LIGHTING_STYLES.map((light) => (
                  <option key={light} value={light}>
                    {light}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Audio & Tone Notes
            </label>
            <textarea
              rows={3}
              value={audioThemeNotes}
              onChange={(e) => setAudioThemeNotes(e.target.value)}
              placeholder="Low-frequency sub-bass drones, dry Foley, muted dialogue..."
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
            <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveCue} disabled={!sceneTitle.trim()}>
              {editingCue ? 'Save Changes' : 'Create Scene Cue'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
