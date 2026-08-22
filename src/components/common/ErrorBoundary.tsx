/**
 * ErrorBoundary.tsx
 *
 * WHAT:
 *   Class-based React error boundary rendering a glass-panel fallback (icon,
 *   title, error message, Retry button) when any descendant throws during
 *   render. Supports optional `resetKeys`: when the boundary is showing its
 *   fallback and any reset key changes value, the error state auto-clears so
 *   the wrapped subtree remounts — e.g. switching tabs/views clears a stale
 *   error left over from a different screen.
 *
 * USES:
 *   - react (Component / ErrorInfo / ReactNode class component APIs)
 *   - CSS custom properties from src/index.css:
 *       --status-danger, --radius-md, --radius-sm, --accent-subtle,
 *       --accent, --border-medium, --text-primary, --text-secondary
 *   - Global utility class `.glass-panel` from src/index.css.
 *
 * USED BY:
 *   - src/App.tsx (single top-level boundary wrapping the main view switch)
 *
 * KEY PROPS:
 *   - children:      The subtree this boundary guards.
 *   - fallbackTitle?: Optional heading override for the fallback card.
 *   - resetKeys?:    Optional array of values (route ids, tab indices, entity
 *                    keys...). A change in ANY entry while an error is shown
 *                    resets the boundary. Compared by serialized value, not
 *                    reference identity.
 *
 * KEY STATE/FIELDS:
 *   - state.hasError / state.error: Whether the fallback is shown + captured Error.
 */

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  /** Guarded subtree. */
  children: ReactNode;
  /** Optional override for the fallback heading text. */
  fallbackTitle?: string;
  /**
   * Values whose change should auto-reset the boundary while it shows an
   * error (e.g. [activeViewId]). Order-sensitive; compared via JSON.
   */
  resetKeys?: unknown[];
}

interface State {
  /** True once a descendant threw and the fallback must render. */
  hasError: boolean;
  /** The caught error; its message surfaces in the fallback. */
  error?: Error;
}

/**
 * Serializes `resetKeys` for cheap value comparison between renders.
 * Circular structures would make JSON.stringify THROW - degrade to a stable
 * placeholder so change detection survives without crashing the boundary
 * (which is the one component that must never itself throw).
 */
const serializeResetKeys = (keys: unknown[] | undefined): string => {
  try {
    return JSON.stringify(keys ?? []);
  } catch {
    return String(keys?.length ?? 0);
  }
};

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  /** Serialized snapshot of the last-seen `resetKeys`; drives change detection. */
  private prevResetKeysSnapshot: string = serializeResetKeys(
    this.props.resetKeys,
  );

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[CineVault Error Boundary Caught]', error, errorInfo);
  }

  public componentDidUpdate(prevProps: Props) {
    // Only relevant when currently showing the fallback UI.
    if (!this.state.hasError) {
      this.prevResetKeysSnapshot = serializeResetKeys(this.props.resetKeys);
      return;
    }
    const nextSnapshot = serializeResetKeys(this.props.resetKeys);
    if (
      nextSnapshot !== this.prevResetKeysSnapshot &&
      nextSnapshot !== serializeResetKeys(prevProps.resetKeys)
    ) {
      // Reset keys changed while an error was displayed → clear the error so
      // children remount fresh under their new context.
      this.prevResetKeysSnapshot = nextSnapshot;
      this.setState({ hasError: false, error: undefined });
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          className="glass-panel"
          style={{
            padding: '24px',
            margin: '16px',
            border: '1px solid var(--status-danger)',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>
            {this.props.fallbackTitle || 'Component Encountered an Error'}
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-subtle)',
              color: 'var(--accent)',
              border: '1px solid var(--border-medium)',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Retry Component
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
