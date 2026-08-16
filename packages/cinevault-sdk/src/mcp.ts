export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export const CINEVAULT_MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: 'cinevault_calculate_beat_timestamps',
    description: 'Calculate page numbers, minute timestamps, and 3-act boundaries for Save the Cat! 15 beats based on total runtime.',
    inputSchema: {
      type: 'object',
      properties: {
        totalRuntimeMinutes: {
          type: 'number',
          description: 'Total target runtime in minutes (e.g. 110)',
        },
        framework: {
          type: 'string',
          enum: ['save-the-cat', 'three-act'],
          description: 'Narrative framework to calculate',
        },
      },
      required: ['totalRuntimeMinutes'],
    },
  },
  {
    name: 'cinevault_calculate_character_friction',
    description: 'Calculate character tension index and identify highest-friction relationship pairs in a screenplay or lore world.',
    inputSchema: {
      type: 'object',
      properties: {
        characters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['id', 'name'],
          },
        },
        relationships: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sourceCharacterId: { type: 'string' },
              targetCharacterId: { type: 'string' },
              relationshipType: { type: 'string' },
              tensionScore: { type: 'number' },
            },
            required: ['sourceCharacterId', 'targetCharacterId', 'tensionScore'],
          },
        },
      },
      required: ['characters', 'relationships'],
    },
  },
];
