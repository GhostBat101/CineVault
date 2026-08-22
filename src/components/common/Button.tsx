/**
 * Button.tsx
 *
 * WHAT:
 *   CineVault's standard button: accent/secondary/ghost/danger variants in three
 *   sizes, optional leading icon slot, and a built-in loading state (spinner span
 *   animated by the global `spin` keyframes). Purely inline-styled against CSS
 *   custom properties defined in src/index.css.
 *
 * USES:
 *   - react (ButtonHTMLAttributes for native prop passthrough)
 *   - CSS custom properties from src/index.css:
 *       --accent, --accent-subtle, --bg-primary, --bg-tertiary,
 *       --border-medium, --status-danger, --radius-sm, --transition-fast,
 *       --font-sans
 *   - @keyframes `spin` from src/index.css (loading spinner).
 *   - Focus indication: relies on the UA default outline (no `outline: 'none'`
 *     is set anywhere) plus the recommended global rule below, which the
 *     integrator should paste into index.css:
 *       *:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
 *
 * USED BY:
 *   - src/components/deck/IngestModal.tsx
 *   - src/components/deck/MediaDetailModal.tsx
 *   - src/components/vault/ModelVaultView.tsx
 *   - src/components/settings/SettingsView.tsx
 *   - src/components/director/BeatSheetView.tsx
 *   - src/components/director/LoreNotesView.tsx
 *   - src/components/director/TensionMatrixView.tsx
 *
 * KEY PROPS:
 *   - variant?:  'primary' | 'secondary' | 'ghost' | 'danger' (default 'primary').
 *                ghost/danger are reserved for upcoming destructive/quiet actions.
 *   - size?:     'sm' | 'md' | 'lg' controlling padding/font-size/height (default 'md').
 *   - icon?:     Optional ReactNode rendered before the label (hidden while loading).
 *   - isLoading?: When true, shows an animated spinner span and disables clicks.
 *   - disabled?: Native disabled; also implied by isLoading.
 *   - type?:     Native button type. Defaults to 'button' so buttons inside
 *                <form> elements never submit accidentally (opt in via type="submit").
 *   - ...rest:   Any other native <button> attribute (onClick, style, aria-*, etc.).
 */

import React, { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

/** Variant/style union accepted by `variant`. */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** Size union accepted by `size`. */
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style preset. */
  variant?: ButtonVariant;
  /** Sizing preset. */
  size?: ButtonSize;
  /** Leading icon node (replaced by a spinner while loading). */
  icon?: React.ReactNode;
  /** Shows spinner + disables interaction. */
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  isLoading = false,
  type,
  style,
  disabled,
  ...props
}) => {
  const isDisabled = disabled || isLoading;

  /** Colour/border treatment per variant. */
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          // Gradient CTA ("accent-strong" recipe) with a machined top edge.
          background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
          color: 'var(--bg-primary)',
          border: '1px solid transparent',
          fontWeight: 600,
          boxShadow: 'var(--shadow-1), var(--highlight-inset)',
        };
      case 'secondary':
        return {
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-medium)',
          fontWeight: 500,
        };
      case 'ghost':
        return {
          background: 'transparent',
          color: 'var(--text-secondary)',
          border: '1px solid transparent',
          fontWeight: 500,
        };
      case 'danger':
        return {
          background: 'var(--status-danger)',
          color: '#ffffff',
          border: '1px solid var(--status-danger)',
          fontWeight: 600,
        };
    }
  };

  /** Padding / font-size / fixed height per size. */
  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return { padding: '4px 10px', fontSize: '12px', height: '28px' };
      case 'md':
        return { padding: '8px 16px', fontSize: '13px', height: '36px' };
      case 'lg':
        return { padding: '12px 24px', fontSize: '15px', height: '44px' };
    }
  };

  return (
    <button
      // Default to type="button": prevents accidental form submits when this
      // component is used inside <form> without an explicit type.
      type={type ?? 'button'}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      className="cv-btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        borderRadius: 'var(--radius-sm)',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all var(--transition-fast)',
        fontFamily: 'var(--font-sans)',
        ...getVariantStyles(),
        ...getSizeStyles(),
        ...style,
      }}
      {...props}
    >
      {isLoading ? (
        // Real spinner glyph animated by the global `spin` keyframes.
        <Loader2
          size={14}
          aria-hidden="true"
          style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
        />
      ) : (
        icon && (
          <span aria-hidden="true">{icon}</span>
        )
      )}
      {children}
    </button>
  );
};
