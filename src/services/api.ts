import {
  Media,
  HardwareTelemetry,
} from '../types';

// Detect whether the app is executing inside Tauri Webview or standard Browser
export const isTauri = () => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

// Safe wrapper for Tauri invoke
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
  }
  // Browser Mock Fallback
  return mockInvoke<T>(cmd, args);
}

// Browser Mock Handlers for Local Dev & Testing
const mockMediaList: Media[] = [
  {
    id: 'media_inception_01',
    imdbId: 'tt1375666',
    title: 'Inception',
    originalTitle: 'Inception',
    year: 2010,
    mediaType: 'movie',
    runtimeMinutes: 148,
    imdbRating: 8.8,
    posterUrl: 'https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_.jpg',
    synopsis: 'A thief who steals corporate secrets through dream-sharing technology is tasked with planting an idea into the mind of a CEO.',
    genres: ['Action', 'Sci-Fi', 'Thriller'],
    directors: ['Christopher Nolan'],
    userStatus: 'completed',
    userRating: 9.5,
    aiSummary: 'Inception explores subconscious grief, architectural dreamscapes, and subjective reality. Dom Cobb struggles between letting go of Mal and fulfilling Saito’s mission to return home to his children.',
    aiModelUsed: 'Llama-3.2-1B-Instruct-Q4_K_M',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'media_interstellar_02',
    imdbId: 'tt0816692',
    title: 'Interstellar',
    originalTitle: 'Interstellar',
    year: 2014,
    mediaType: 'movie',
    runtimeMinutes: 169,
    imdbRating: 8.7,
    posterUrl: 'https://m.media-amazon.com/images/M/MV5BYzdjMDAxZGItMjI2My00ODA1LTlkNzItOWFjMDU5ZDJlYWY3XkEyXkFqcGc@._V1_.jpg',
    synopsis: 'When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot, Joseph Cooper, is tasked to pilot a spacecraft along with a team of researchers.',
    genres: ['Adventure', 'Drama', 'Sci-Fi'],
    directors: ['Christopher Nolan'],
    userStatus: 'watching',
    userRating: 9.8,
    aiSummary: 'Interstellar synthesizes relativistic astrophysics with unconditional parental love, proving love transcends dimensions of space and time.',
    aiModelUsed: 'Qwen2.5-1.5B-Instruct-Q4_K_M',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  console.log(`[Mock Tauri IPC] ${cmd}`, args);

  switch (cmd) {
    case 'get_telemetry':
      return {
        cpuUsagePercent: 3.8,
        ramUsedMb: 1180,
        ramTotalMb: 16384,
        gpuName: 'DirectX 12 / Dedicated GPU',
        vramUsedMb: 1120,
        vramTotalMb: 2048,
        isVramCritical: false,
        activeOffloadMode: 'gpu_auto',
        gpuLayersOffloaded: 28,
        totalGpuLayers: 28,
      } as T;

    case 'get_all_media':
      return mockMediaList as T;

    case 'extract_imdb': {
      const url = String(args?.imdb_url || '');
      return {
        imdbId: 'tt1375666',
        title: 'Extracted Narrative Feature',
        originalTitle: 'Extracted Feature',
        year: 2024,
        runtimeMinutes: 135,
        imdbRating: 8.5,
        posterUrl: 'https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_.jpg',
        synopsis: `Extracted metadata for URL: ${url}`,
        genres: ['Drama', 'Mystery', 'Sci-Fi'],
        directors: ['Denis Villeneuve'],
        castMembers: [
          { name: 'Lead Actor', characterName: 'Protagonist', avatarUrl: '' },
          { name: 'Supporting Actor', characterName: 'Mentor', avatarUrl: '' },
        ],
      } as T;
    }

    case 'generate_ai_summary': {
      return {
        generatedText: 'This cinematic narrative delves into psychological tension, moral ambiguity, and transformative character arcs.',
        modelUsed: 'Llama-3.2-1B-Instruct-Q4_K_M',
        totalTokens: 128,
      } as T;
    }

    case 'save_media_entry': {
      const media = args?.media as Media;
      if (media) {
        mockMediaList.unshift(media);
      }
      return 'OK' as T;
    }

    default:
      return {} as T;
  }
}

// Public API Service
export const api = {
  // Telemetry
  getTelemetry: () => tauriInvoke<HardwareTelemetry>('get_telemetry'),

  // Media & Scraping
  getAllMedia: () => tauriInvoke<Media[]>('get_all_media'),
  extractImdb: (imdbUrl: string) => tauriInvoke<any>('extract_imdb', { imdb_url: imdbUrl }),
  saveMedia: (media: Media) => tauriInvoke<string>('save_media_entry', { media }),

  // Local AI Generation
  generateAISummary: (prompt: string, temperature = 0.7, maxTokens = 512) =>
    tauriInvoke<{ generatedText: string; modelUsed: string; totalTokens: number }>('generate_ai_summary', {
      request: { prompt, temperature, max_tokens: maxTokens },
    }),

  // Relational Database Export / Import
  exportDatabaseJson: () => tauriInvoke<string>('export_database_json'),
  importDatabaseJson: (jsonContent: string) => tauriInvoke<boolean>('import_database_json', { json_content: jsonContent }),
};
