/**
 * File Purpose: Self-contained toast notification system exposing imperative toast helper and ToastViewport portal.
 * Communication Matrix: Imported by App.tsx (ToastViewport), SettingsView.tsx, ModelVaultView.tsx, and other UI modules calling the toast singleton.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ToastKind = 'success' | 'error' | 'info';

export interface CineVaultToast {
  id: string;
  kind: ToastKind;
  message: string;
  title?: string;
}

type ToastListener = (toastRecord: CineVaultToast) => void;

interface ToastBusStore {
  listeners: Set<ToastListener>;
}

type BusHost = typeof globalThis & Record<symbol, ToastBusStore | undefined>;

interface ToastCardProps {
  data: CineVaultToast;
  onDismiss: (id: string) => void;
}

const TOAST_DURATION_MS = 4200;
const ERROR_TOAST_DURATION_MS = 6500;
const MAX_VISIBLE_TOASTS = 4;
const TOAST_BUS_KEY = Symbol.for('cinevault.toast-bus');

const bus: ToastBusStore = ((globalThis as BusHost)[TOAST_BUS_KEY] ??= {
  listeners: new Set<ToastListener>(),
});

const KIND_ACCENT_COLOR: Record<ToastKind, string> = {
  success: 'var(--status-success)',
  error: 'var(--status-danger)',
  info: 'var(--accent)',
};

function subscribe(listener: ToastListener): () => void {
  bus.listeners.add(listener);
  return () => {
    bus.listeners.delete(listener);
  };
}

function emit(toastRecord: CineVaultToast): void {
  bus.listeners.forEach((listener) => listener(toastRecord));
}

function pushToast(kind: ToastKind, message: string, title?: string): void {
  const toastRecord: CineVaultToast = {
    id: crypto.randomUUID(),
    kind,
    message,
    title,
  };
  emit(toastRecord);
}

export const toast = {
  success: (message: string, title?: string): void =>
    pushToast('success', message, title),
  error: (message: string, title?: string): void =>
    pushToast('error', message, title),
  info: (message: string, title?: string): void =>
    pushToast('info', message, title),
};

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

export function ToastViewport(): JSX.Element {
  const [toasts, setToasts] = useState<CineVaultToast[]>([]);
  const toastsRef = useRef<CineVaultToast[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

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
      const next = [...toastsRef.current, incoming];
      while (next.length > MAX_VISIBLE_TOASTS) {
        const dropped = next.shift();
        if (dropped) dismissToast(dropped.id);
      }
      toastsRef.current = next;
      setToasts(next);

      const duration =
        incoming.kind === 'error'
          ? ERROR_TOAST_DURATION_MS
          : TOAST_DURATION_MS;
      const handle = window.setTimeout(() => dismissToast(incoming.id), duration);
      timersRef.current.set(incoming.id, handle);
    });

    return () => {
      unsubscribe();
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
        zIndex: 1100,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
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
