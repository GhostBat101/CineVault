/**
 * Modal.tsx
 *
 * WHAT:
 *   Accessible, glass-styled modal dialog for CineVault. Provides focus trapping,
 *   Escape-to-close (nested-modal aware: only the TOPMOST open modal closes),
 *   body scroll locking with an open-stack refcount (the lock lifts only when
 *   the LAST dialog closes, so nested out-of-order closes cannot wedge the
 *   page), focus restoration on close, and a subtle entrance animation.
 *   Purely inline-styled; depends on global CSS tokens defined in
 *   src/index.css (and the `modal-scale-in` keyframes added there).
 *
 * USES:
 *   - react (useEffect / useRef)
 *   - CSS custom properties from src/index.css:
 *       --bg-overlay, --bg-secondary, --border-subtle, --border-medium,
 *       --radius-lg, --radius-xs, --text-muted, --ease-enter
 *   - Global utility class `.glass-panel` from src/index.css (panel backdrop blur).
 *   - @keyframes `modal-scale-in` (see index.css additions shipped alongside this file).
 *
 * USED BY:
 *   - src/components/deck/IngestModal.tsx
 *   - src/components/deck/MediaDetailModal.tsx
 *   - src/components/vault/ModelVaultView.tsx
 *   - src/components/director/LoreNotesView.tsx
 *   - src/components/director/TensionMatrixView.tsx
 *
 * KEY PROPS:
 *   - isOpen:              Whether the dialog is mounted/rendered (false renders null).
 *   - onClose:             Close callback invoked on Escape / backdrop click / X button.
 *                          May change between renders safely (kept fresh via a ref).
 *   - title?:              Dialog heading; also wires aria-labelledby. Optional.
 *   - subtitle?:           Optional muted line under the title.
 *   - maxWidth?:           Panel max width (default '640px').
 *   - children:            Dialog body content (scrollable region).
 *   - closable?:           When false, hides the X button AND disables Escape/backdrop
 *                          close (default true). Body stays scroll-locked until unmount.
 *   - disableBackdropClose?: When true, clicking the dimmed overlay no longer closes
 *                          (protects half-filled forms like IngestModal). Default false.
 */

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* Module-level modal stack (nested-modal awareness)                           */
/* -------------------------------------------------------------------------- */

/**
 * Registry of every currently-open modal's close callback, in open order.
 * On Escape, only the LAST entry (topmost dialog) handles the keypress and
 * closes; underlying modals are left untouched until their turn.
 */
const openModalStack: Array<() => void> = [];

/**
 * Body overflow captured BEFORE the first modal locks scrolling. Kept at module
 * level (instead of per-instance closures) so nested dialogs that unmount out
 * of order still restore the TRUE page baseline when the last one closes - a
 * per-instance restore would clobber it with another modal's 'hidden'.
 */
let bodyOverflowBaseline: string | null = null;

/**
 * Selector used by the Tab focus-trap to enumerate focusable descendants
 * of the dialog panel.
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/* -------------------------------------------------------------------------- */
/* Public component                                                            */
/* -------------------------------------------------------------------------- */

interface ModalProps {
  /** Controls mount/unmount of the dialog. False renders null. */
  isOpen: boolean;
  /** Called when the user requests dismissal (Escape, backdrop, close button). */
  onClose: () => void;
  /** Heading text; anchors aria-labelledby. */
  title?: string;
  /** Secondary muted description under the title. */
  subtitle?: string;
  /** Dialog body. */
  children: React.ReactNode;
  /** Maximum panel width. */
  maxWidth?: string;
  /** Master switch for all dismissal affordances (default: true). */
  closable?: boolean;
  /** Opt-out for backdrop-click dismissal only (form safety). Default: false. */
  disableBackdropClose?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = '640px',
  closable = true,
  disableBackdropClose = false,
}) => {
  /** Ref to the dialog panel; receives initial focus and bounds the focus trap. */
  const panelRef = useRef<HTMLDivElement>(null);

  /** Always-fresh mirror of `onClose` so event listeners stay stable across renders. */
const onCloseRef = useRef(onClose);
onCloseRef.current = onClose;
// Mirror of `closable` so the stable Escape listener reads the LIVE value.
const closableRef = useRef(closable);
closableRef.current = closable;

  /* ------------------------------------------------------------------------ */
  /* Open/close lifecycle: scroll lock, focus save/move/restore, Escape stack  */
  /* ------------------------------------------------------------------------ */
  useEffect(() => {
    if (!isOpen) return undefined;

    // --- Focus save (restored on close/unmount) ------------------------------
    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // --- Body scroll lock ---------------------------------------------------
    // Capture the page baseline only when this is the FIRST modal in the
    // stack; nested modals must not overwrite it with 'hidden'.
    if (openModalStack.length === 0) {
      bodyOverflowBaseline = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    // --- Nested-modal registry ---------------------------------------------
    const requestClose = () => onCloseRef.current();
    openModalStack.push(requestClose);

    // --- Escape handling (topmost modal wins) -------------------------------
    // `closable` is read through a ref so toggling it while the dialog is
    // open (e.g. during a save/download) takes effect IMMEDIATELY for Escape
    // too - without churning the keydown listener.
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const topmost = openModalStack[openModalStack.length - 1];
      if (topmost !== requestClose) return; // A modal opened later handles it.
      if (!closableRef.current) return;
      requestClose();
    };
    window.addEventListener('keydown', handleWindowKeyDown);

    // --- Initial focus -------------------------------------------------------
    // Prefer focusing the first focusable control; otherwise focus the panel
    // itself (tabIndex={-1}) so keyboard users are anchored inside the dialog.
    const panel = panelRef.current;
    if (panel) {
      const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        panel.focus();
      }
    }

    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);

      // Pop THIS instance's entry (robust against out-of-order unmounts).
      const index = openModalStack.indexOf(requestClose);
      if (index !== -1) openModalStack.splice(index, 1);

      // SCROLL-LOCK REFCOUNT: restore the captured page baseline ONLY when
      // this was the last open modal. Nested dialogs closing out of order
      // must not lift the lock while a parent dialog still needs it.
      if (openModalStack.length === 0 && bodyOverflowBaseline !== null) {
        document.body.style.overflow = bodyOverflowBaseline;
        bodyOverflowBaseline = null;
      }

      // Return focus to whatever held it before the dialog opened.
      if (previousActiveElement && previousActiveElement.isConnected) {
        previousActiveElement.focus();
      }
    };
    // Deps intentionally limited to `isOpen`: `onClose` and `closable` are
    // accessed through refs so the listener never churns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /* ------------------------------------------------------------------------ */
  /* Focus trap (Tab cycling within the panel)                                 */
  /* ------------------------------------------------------------------------ */

  /**
   * Cycles Tab/Shift+Tab among focusable descendants so keyboard focus can
   * never escape the dialog while it is open.
   */
  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusables.length === 0) {
      event.preventDefault(); // Nowhere to go; keep focus parked on the panel.
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    const focusOutsidePanel =
      !panel.contains(active) || active === panel;

    if (focusOutsidePanel) {
      // Re-anchor focus at the appropriate edge of the dialog.
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Render                                                                    */
  /* ------------------------------------------------------------------------ */

  if (!isOpen) return null;

  /**
   * Overlay click dismissal. Only fires when the click lands directly on the
   * overlay (never on panel content bubbling up) and backdrop-close is allowed.
   */
  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disableBackdropClose || !closable) return;
    if (event.target === event.currentTarget) onCloseRef.current();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-overlay)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={handleOverlayClick}
    >
      <div
        ref={panelRef}
        className="glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'cinevault-modal-title' : undefined}
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth,
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          animation: 'modal-scale-in 180ms var(--ease-enter)',
        }}
        onKeyDown={handlePanelKeyDown}
      >
        {/* ------------------------------ Header ------------------------------ */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            {title && (
              <h2 id="cinevault-modal-title" style={{ fontSize: '16px', fontWeight: 600 }}>
                {title}
              </h2>
            )}
            {subtitle && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {subtitle}
              </p>
            )}
          </div>
          {closable && (
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              aria-label="Close dialog"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                minWidth: '32px',
                minHeight: '32px',
                padding: 0,
                borderRadius: 'var(--radius-xs)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {/* Lucide icon instead of a text glyph (mojibake-proof). */}
              <X size={14} />
            </button>
          )}
        </div>

        {/* ------------------------------- Body ------------------------------- */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  );
};
