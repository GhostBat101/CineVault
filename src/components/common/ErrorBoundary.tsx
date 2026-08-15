import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[CineVault Error Boundary Caught]', error, errorInfo);
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
