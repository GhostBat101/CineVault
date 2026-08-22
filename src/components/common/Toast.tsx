/**
 * common/Toast.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT:
 *   A fully self-contained toast notification system for CineVault. It is a
 *   two-part module:
 *
 *     1. A module-level pub/sub event store (`subscribe` / `emit`) plus an
 *        imperative singleton `toast` that any code can call from anywhere -
 *        event handlers, catch blocks, plain functions - without props,
 *        context, or hooks.
 *
 *     2. `<ToastViewport />`, the sole renderer: it subscribes to the store on
 *        mount, buffers up to 4 visible toasts (oldest dropped), and portals
 *        them as fixed-position cards anchored above the HUD at the bottom
 *        right of the window.
 *
 * WHY SELF-MOUNTING (no provider/context exists in this codebase):
 *   App.tsx is owned by another Phase 3 workstream and renders nothing new,
 *   and no global React Context exists for cross-cutting UI concerns. To stay
 *   decoupled, importing this module triggers a one-time side effect that
 *   mounts <ToastViewport /> itself into document.body through its own React
 *   root (createRoot). The mount target id is checked first, so HMR or
 *   accidental double-imports can never spawn duplicate viewports. Result:
 *   any module only needs `import { toast } from '../common/Toast'` and toasts
 *   simply appear.
 *
 * USES:
 *   react (hooks), react-dom (createPortal), react-dom/client (createRoot).
 *   Design tokens: --bg-secondary, --border-medium, --radius-md, --shadow-4,
 *   --ease-enter, --status-success, --status-danger, --accent, --hud-height,
 *   --text-primary/--text-secondary, and the global @keyframes fade-rise
 *   declared in index.css.
 *
 * USED BY:
 *   settings/SettingsView.tsx (export/import failure reporting),
 *   vault/ModelVaultView.tsx (download + activation failure reporting).
 *   Nothing else needs to render <ToastViewport /> manually - see
 *   "WHY SELF-MOUNTING" above; rendering it again by hand would duplicate
 *   every notification.
 *
 * API (public exports):
 *   toast.success(message: string, title?: string): void
 *       Emit a success toast (green accent edge); auto-dismisses after
 *       TOAST_DURATION_MS = 4200ms.
 *   toast.error(message: string, title?: string): void
 *       Emit an error toast (red accent edge); lingers longer -
 *       ERROR_TOAST_DURATION_MS = 6500ms - because failures need reading time.
 *   toast.info(message: string, title?: string): void
 *       Emit a neutral info toast (accent-colored edge);
 *       auto-dismisses after TOAST_DURATION_MS.
 *   <ToastViewport />
 *       The portal renderer. Exported for completeness/testing ONLY - it is
 *       already live via the automatic module mount described above.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';

/** Severity of a toast record; drives the left-edge color and dismiss timing. */
export type ToastKind = 'success' | 'error' | 'info';

/** One toast flowing through the pub/sub bus and rendered as a card. */
export interface CineVaultToast {
  /** Unique id (crypto.randomUUID) used as React key + timer map key. */
  id: string;
  /** Severity; selects accent color (--status-success/-danger/--accent). */
  kind: ToastKind;
  /** Body copy shown under the optional bold title line. */
  message: string;
  /** Optional bold headline above the message. */
  title?: string;
}

/** Callback signature invoked for every emitted toast. */
type ToastListener = (toastRecord: CineVaultToast) => void;

/** Auto-dismiss delay (ms) for success/info toasts. */
const TOAST_DURATION_MS = 4200;
/** Auto-dismiss delay (ms) for error toasts - failures get extra reading time. */
const ERROR_TOAST_DURATION_MS = 6500;
/** Hard cap on simultaneously visible cards; oldest is silently dropped. */
const MAX_VISIBLE_TOASTS = 4;
/** DOM id of the self-mount host div appended to document.body exactly once. */
const VIEWPORT_HOST_ID = 'cv-toast-viewport-host';

/* ────────────────────────── Module-level pub/sub store ─────────────────── */

/** Live listener set backing the tiny event store (no external state lib). */
const listeners = new Set<ToastListener>();

/**
 * Register a listener for emitted toasts.
 * @returns Unsubscribe function (idempotent) used for effect cleanup.
 */
function subscribe(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Fan a freshly created toast out to every subscribed viewport. */
function emit(toastRecord: CineVaultToast): void {
  listeners.forEach((listener) => listener(toastRecord));
}

/**
 * Create a toast record ({ id, kind, message, title }), then emit it onto the
 * bus. Auto-dismiss timing is enforced by the viewport's per-toast timer so
 * timers are always cleaned up when the viewport unmounts.
 */
function pushToast(kind: ToastKind, message: string, title?: string): void {
  const toastRecord: CineVaultToast = {
    id: crypto.randomUUID(),
    kind,
    message,
    title,
  };
  emit(toastRecord);
}

/**
 * Imperative singleton - THE public entry point of this module. Fire-and-
 * forget; safe to call from async flows, catch blocks, and non-React code.
 */
export const toast = {
  /** Success toast; auto-dismisses after TOAST_DURATION_MS. */
  success: (message: string, title?: string): void =>
    pushToast('success', message, title),
  /** Error toast; stays for the longer ERROR_TOAST_DURATION_MS. */
  error: (message: string, title?: string): void =>
    pushToast('error', message, title),
  /** Neutral info toast; auto-dismisses after TOAST_DURATION_MS. */
  info: (message: string, title?: string): void =>
    pushToast('info', message, title),
};

/* ─────────────────────────────── Card component ────────────────────────── */

/** Props for a single dismissible toast card. */
interface ToastCardProps {
  /** The immutable toast record this card renders. */
  data: CineVaultToast;
  /** Remove-this-toast callback (manual ✕ click). */
  onDismiss: (id: string) => void;
}

/** Maps severity -> left-edge/border color token. */
const KIND_ACCENT_COLOR: Record<ToastKind, string> = {
  success: 'var(--status-success)',
  error: 'var(--status-danger)',
  info: 'var(--accent)',
};

/**
 * One toast card: 260-360px wide, raised background, 3px status-colored left
 * edge, fade-rise entrance animation, and a manual close button.
 */
const ToastCard: React.FC<ToastCardProps> = ({ data, onDismiss }) => {
  const { kind, message, title, id } = data;
  const accentColor = KIND_ACCENT_COLOR[kind];

  return (
    <div
      role="status"
      style={{
        minWidth: '260px',
        maxWidth: '360px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-medium)',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-4)',
        padding: '10px 14px',
        animation: 'fade-rise 220ms var(--ease-enter)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        pointerEvents: 'auto',
      }}
    >
      {/* Text column: optional bold title over the secondary-color message */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '2px',
            }}
          >
            {title}
          </div>
        )}
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {message}
        </div>
      </div>

      {/* Manual dismissal - re-enables pointer events inside the passive
          viewport wrapper and clears both timer and state for this toast. */}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(id)}
        style={{
          all: 'unset',
          cursor: 'pointer',
          lineHeight: 1,
          padding: '2px',
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--text-muted)',
          borderRadius: 'var(--radius-sm)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-muted)';
        }}
      >
        ✕
      </button>
    </div>
  );
};

/* ───────────────────────────── Viewport component ──────────────────────── */

/**
 * Renders every active toast via a portal into document.body. Subscribes once
 * on mount; owns one auto-dismiss timer per toast, all of which are cleared on
 * unmount (and early, on manual dismissal).
 */
export function ToastViewport(): JSX.Element {
  /** Rendered toast list, newest last, capped at MAX_VISIBLE_TOASTS. */
  const [toasts, setToasts] = useState<CineVaultToast[]>([]);
  /**
   * Synchronous mirror of `toasts` so the subscription callback always works
   * from current data (avoids stale-closure drops when toasts fire rapidly)
   * and lets us clear timers of overflowed toasts outside render.
   */
  const toastsRef = useRef<CineVaultToast[]>([]);
  /** Auto-dismiss timeout handles keyed by toast id; cleared on unmount. */
  const timersRef = useRef<Map<string, number>>(new Map());

  /** Clear one toast's timer (if pending) and remove it from list state. */
  const dismissToast = useCallback((id: string) => {
    const handle = timersRef.current.get(id);
    if (handle !== undefined) {
      window.clearTimeout(handle);
      timersRef.current.delete(id);
    }
    toastsRef.current = toastsRef.current.filter((t) => t.id !== id);
    setToasts(toastsRef.current);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe((incoming) => {
      // Append newest, then drop oldest beyond the visibility cap.
      const next = [...toastsRef.current, incoming];
      while (next.length > MAX_VISIBLE_TOASTS) {
        const dropped = next.shift();
        if (dropped) dismissToast(dropped.id);
      }
      toastsRef.current = next;
      setToasts(next);

      // Errors linger longer than success/info notifications.
      const duration =
        incoming.kind === 'error'
          ? ERROR_TOAST_DURATION_MS
          : TOAST_DURATION_MS;
      const handle = window.setTimeout(() => dismissToast(incoming.id), duration);
      timersRef.current.set(incoming.id, handle);
    });

    return () => {
      unsubscribe();
      // Per-toast cleanup: no stray timers may fire post-unmount.
      timersRef.current.forEach((handle) => window.clearTimeout(handle));
      timersRef.current.clear();
    };
  }, [dismissToast]);

  return createPortal(
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        right: '16px',
        bottom: 'calc(var(--hud-height) + 12px)',
        // Above modal overlays (Modal uses zIndex 1000) so error toasts fired
        // from inside a dialog remain visible.
        zIndex: 1100,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        // Click-through wrapper; each card opts back in with pointerEvents auto.
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} data={t} onDismiss={dismissToast} />
      ))}
    </div>,
    document.body
  );
}

/* ─────────────────────── Automatic module side-effect mount ────────────── */

/**
 * Mount <ToastViewport /> into document.body exactly once. The id guard makes
 * this safe against HMR re-execution and duplicate imports; the readyState
 * check covers imports that run before the DOM has finished parsing.
 */
function ensureViewportMounted(): void {
  if (document.getElementById(VIEWPORT_HOST_ID)) return;
  const host = document.createElement('div');
  host.id = VIEWPORT_HOST_ID;
  document.body.appendChild(host);
  createRoot(host).render(<ToastViewport />);
}

if (document.readyState === 'loading') {
  // Module evaluated before DOM parse finished - defer until it is safe.
  document.addEventListener('DOMContentLoaded', ensureViewportMounted, {
    once: true,
  });
} else {
  ensureViewportMounted();
}
