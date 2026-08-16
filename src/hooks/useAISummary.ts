import { useState, useCallback, useEffect } from 'react';
import { api, isTauri } from '../services/api';

interface UseAISummaryOptions {
  onSuccess?: (summary: string) => void;
  onError?: (err: Error) => void;
}

export function useAISummary(options?: UseAISummaryOptions) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [summary, setSummary] = useState('');
  const [modelUsed, setModelUsed] = useState<string>('');
  const [generationTimeMs, setGenerationTimeMs] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadSpeed, setDownloadSpeed] = useState<string>('0.0');
  const [downloadAttempt, setDownloadAttempt] = useState<{ attempt: number; max: number } | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<any>('model_download_progress', (event) => {
          const payload = event.payload;
          if (payload) {
            setDownloadProgress(Math.round(payload.percentage || 0));
            setDownloadSpeed((payload.speedMbps || 0).toFixed(1));
            if (payload.attempt && payload.maxAttempts) {
              setDownloadAttempt({ attempt: payload.attempt, max: payload.maxAttempts });
            }
            if (payload.isCompleted) {
              setDownloadProgress(null);
              setDownloadAttempt(null);
            }
          }
        }).then((unsub) => {
          unlisten = unsub;
        });
      }).catch((e) => {
        console.warn('Could not bind AI summary download listener:', e);
      });
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const generateSummary = useCallback(
    async (prompt: string, temperature = 0.7) => {
      setIsGenerating(true);
      setError(null);
      setSummary('');
      setDownloadProgress(null);
      setDownloadAttempt(null);

      try {
        const result = await api.generateAISummary(prompt, temperature);
        setSummary(result.generatedText);
        setModelUsed(result.modelUsed);
        setGenerationTimeMs(120);

        if (options?.onSuccess) {
          options.onSuccess(result.generatedText);
        }
      } catch (err: any) {
        console.error('[AI Summary Generation Error]', err);
        const errMsg = err?.message || String(err);
        setError(errMsg);
        if (options?.onError) {
          options.onError(new Error(errMsg));
        }
      } finally {
        setIsGenerating(false);
        setDownloadProgress(null);
        setDownloadAttempt(null);
      }
    },
    [options]
  );

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
    clearError: () => setError(null),
  };
}

