import { useState, useEffect, useCallback } from 'react';
import { Media } from '../types';
import { api } from '../services/api';

export function useMediaLibrary() {
  const [mediaList, setMediaList] = useState<Media[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMedia = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.getAllMedia();
      setMediaList(data);
      setError(null);
    } catch (err: any) {
      console.error('[Media Library Fetch Error]', err);
      setError(err?.message || 'Failed to load media catalog.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const addMedia = async (media: Media) => {
    try {
      await api.saveMedia(media);
      setMediaList(prev => [media, ...prev]);
    } catch (err: any) {
      console.error('[Media Save Error]', err);
      throw err;
    }
  };

  return {
    mediaList,
    isLoading,
    error,
    refreshMedia: fetchMedia,
    addMedia,
  };
}
