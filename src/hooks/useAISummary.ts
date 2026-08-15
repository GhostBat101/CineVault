import { useState, useCallback } from 'react';
import { api } from '../services/api';

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

  const generateSummary = useCallback(
    async (prompt: string, temperature = 0.7) => {
      setIsGenerating(true);
      setError(null);
      setSummary('');

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
        const errMsg = err?.message || 'Failed to generate narrative summary.';
        setError(errMsg);
        if (options?.onError) {
          options.onError(new Error(errMsg));
        }
      } finally {
        setIsGenerating(false);
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
    generateSummary,
    setSummary,
  };
}
