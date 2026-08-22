/**
 * hooks/useAISummary.ts
 * ─────────────────────────────────────────────────────────────
 * WHAT: Drives one AI generation flow end-to-end: invokes
 *       `generate_ai_summary`, tracks progress of any model download that the
 *       backend triggers (via the `model_download_progress` event), and
 *       exposes generation state (summary/model/latency/error/progress).
 *
 * RACE SAFETY:
 *   - Listener cleanup uses a `disposed` flag: if the component unmounts
 *     before the async listen() resolves, the subscription is cancelled
 *     immediately instead of leaking.
 *   - A monotonic `requestSeqRef` stamps every generation call; late results
 *     from superseded requests are discarded instead of overwriting newer ones.
 *   - Callbacks are read through a ref so callers can pass inline closures
 *     without invalidating `generateSummary` identity each render.
 *
 * USES:    services/api.ts (generateAISummary).
 * USED BY: components/deck/MediaDetailModal.tsx,
 *          components/director/{BeatSheetView,LoreNotesView}.tsx.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { api, isTauri } from '../services/api';

interface UseAISummaryOptions {
  /** Called with the generated text after a successful generation. */
  onSuccess?: (summary: string) => void;
  /** Called with the error after a failed generation. */
  onError?: (err: Error) => void;
}

export function useAISummary(options?: UseAISummaryOptions) {
  /** True while an inference request is in flight. */
  const [isGenerating, setIsGenerating] = useState(false);
  /** Latest generated text ('' until first success). */
  const [summary, setSummary] = useState('');
  /** Model id reported by the backend for the latest generation. */
  const [modelUsed, setModelUsed] = useState<string>('');
  /** Real wall-clock generation latency reported by the backend (ms). */
  const [generationTimeMs, setGenerationTimeMs] = useState<number>(0);
  /** Last failure message, null when healthy. */
  const [error, setError] = useState<string | null>(null);
  /** 0-100 while a model download accompanies generation; null otherwise. */
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  /** Download speed string (MB/s) for display. */
  const [downloadSpeed, setDownloadSpeed] = useState<string>('0.0');
  /** Retry telemetry {attempt, max} during resilient downloads. */
  const [downloadAttempt, setDownloadAttempt] = useState<{ attempt: number; max: number } | null>(null);

  /** Latest options, read at call time (keeps generateSummary identity stable). */
  const optionsRef = useRef(options);
  optionsRef.current = options;
  /** Monotonic counter used to discard stale generation results. */
  const requestSeqRef = useRef(0);
  /** Set true on unmount; guards state updates + cancels pending listeners. */
  const disposedRef = useRef(false);
  /**
   * Per-instance correlation id. Every generation from THIS hook is tagged
   * with it; the ai:token listener drops events belonging to other instances
   * (the Tauri event bus is global - untagged streams leak across all
   * mounted hooks, concatenating unrelated outputs together).
   */
  const clientIdRef = useRef(`ai_${crypto.randomUUID()}`);

  useEffect(() => {
    // Reset the unmount guard on every run - StrictMode's mount/cleanup/
    // remount cycle must not leave it permanently latched (generateSummary
    // also reads this ref to discard late async results).
    disposedRef.current = false;

    // Listener subscriptions use a per-run local flag instead of the ref so a
    // cleanup/re-run never leaves them dead.
    let unlisten: (() => void) | undefined;
    let unlistenTokens: (() => void) | undefined;
    let disposed = false;
    if (isTauri()) {
      import('@tauri-apps/api/event')
        .then(({ listen }) =>
          Promise.all([
            // Download progress during first-use model fetch.
            listen<any>('model_download_progress', (event) => {
              if (disposed) return;
              const payload = event.payload;
              if (!payload) return;
              // Tolerate either casing defensively (backend emits camelCase).
              const pct = Math.min(100, Math.max(0, Math.round(payload.percentage ?? payload.percent ?? 0)));
              const speedVal = payload.speedMbps ?? payload.speed_mbps ?? 0;
              const isDone = payload.isCompleted ?? payload.is_completed ?? pct >= 100;

              setDownloadProgress(pct);
              setDownloadSpeed(Number(speedVal).toFixed(1));

              const attemptVal = payload.attempt ?? payload.currentAttempt;
              const maxVal = payload.maxAttempts ?? payload.max_attempts;
              if (attemptVal && maxVal) {
                setDownloadAttempt({ attempt: attemptVal, max: maxVal });
              }
              if (isDone) {
                setDownloadProgress(null);
                setDownloadAttempt(null);
              }
            }),
            // Live token stream: backend forwards every generated piece tagged
            // with the requesting instance's clientId. Only OUR stream may
            // append here - other hooks' generations must not interleave.
            listen<{ clientId?: string; piece?: string }>('ai:token', (event) => {
              if (disposed) return;
              const payload = event.payload;
              if (!payload || typeof payload.piece !== 'string' || !payload.piece) return;
              if (payload.clientId !== clientIdRef.current) return;
              setSummary((prev) => prev + payload.piece);
            }),
          ])
        )
        .then(([unsubProgress, unsubTokens]) => {
          // Unmount raced ahead of subscription - tear down immediately.
          if (disposed) {
            unsubProgress();
            unsubTokens();
            return;
          }
          unlisten = unsubProgress;
          unlistenTokens = unsubTokens;
        })
        .catch((e) => {
          console.warn('Could not bind AI summary listeners:', e);
        });
    }

    return () => {
      disposed = true;
      if (unlisten) unlisten();
      if (unlistenTokens) unlistenTokens();
    };
  }, []);

  /**
   * Run one generation. Results/errors are ignored if a newer call started or
   * the component unmounted mid-flight.
   */
  const generateSummary = useCallback(
    async (
      params: { prompt: string; title?: string; genres?: string[]; synopsis?: string; mediaType?: string; temperature?: number } | string,
      temperatureOverride?: number
    ) => {
      const seq = ++requestSeqRef.current;
      setIsGenerating(true);
      setError(null);
      setSummary('');
      setDownloadProgress(null);
      setDownloadAttempt(null);

      try {
        // Tag every generation with this instance's id so the backend echoes
        // it on ai:token and our listener can claim ownership of the stream.
        const payload =
          typeof params === 'string'
            ? { prompt: params, temperature: temperatureOverride, clientId: clientIdRef.current }
            : { ...params, temperature: params.temperature ?? temperatureOverride, clientId: clientIdRef.current };

        const result = await api.generateAISummary(payload);

        // Discard results from superseded/unmounted requests.
        if (seq !== requestSeqRef.current || disposedRef.current) return;

        setSummary(result.generatedText);
        setModelUsed(result.modelUsed);
        setGenerationTimeMs(result.generationTimeMs ?? 0);
        optionsRef.current?.onSuccess?.(result.generatedText);
      } catch (err: unknown) {
        console.error('[AI Summary Generation Error]', err);
        if (seq !== requestSeqRef.current || disposedRef.current) return;
        const errMsg = err instanceof Error ? err.message : String(err);
        setError(errMsg);
        optionsRef.current?.onError?.(new Error(errMsg));
      } finally {
        if (seq === requestSeqRef.current && !disposedRef.current) {
          setIsGenerating(false);
          setDownloadProgress(null);
          setDownloadAttempt(null);
        }
      }
    },
    []
  );

  /** Clear the current error banner. */
  const clearError = useCallback(() => setError(null), []);

  return {
    isGenerating,
    summary,
    modelUsed,
    generationTimeMs,
    error,
    downloadProgress,
    downloadSpeed,
    downloadAttempt,
    generateSummary,
    setSummary,
    clearError,
  };
}
