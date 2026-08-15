import { BeatSheetEngine } from './beats';
import { CharacterTensionMatrix } from './matrix';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const CINEVAULT_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'analyze_beat_sheet_pacing',
    description: 'Calculates narrative pacing tension across screenplay beats.',
    inputSchema: {
      type: 'object',
      properties: {
        beats: { type: 'object', description: 'Map of beat names to scene summaries' }
      },
      required: ['beats']
    }
  },
  {
    name: 'audit_character_lore_continuity',
    description: 'Scans character motivations against scene actions to identify plot holes and contradictions.',
    inputSchema: {
      type: 'object',
      properties: {
        characterBackstories: { type: 'array', items: { type: 'string' } },
        sceneEvents: { type: 'array', items: { type: 'string' } }
      },
      required: ['characterBackstories', 'sceneEvents']
    }
  }
];

export function createCinevaultMcpHandler() {
  const beatEngine = new BeatSheetEngine();
  const matrix = new CharacterTensionMatrix();

  return {
    tools: CINEVAULT_MCP_TOOLS,
    beatEngine,
    matrix
  };
}
