import { describe, it, expect } from 'vitest';
import { CharacterTensionEngine } from '../packages/cinevault-sdk/src/matrix';

describe('CharacterTensionEngine Unit Tests', () => {
  it('should calculate accurate average tension and identify highest tension pair', () => {
    const engine = new CharacterTensionEngine();

    engine.addCharacter({ id: 'c1', name: 'Dom Cobb', roleType: 'protagonist' });
    engine.addCharacter({ id: 'c2', name: 'Mal Cobb', roleType: 'antagonist' });
    engine.addCharacter({ id: 'c3', name: 'Ariadne', roleType: 'deuteragonist' });

    engine.setRelationship({
      sourceCharacterId: 'c1',
      targetCharacterId: 'c2',
      relationshipType: 'Guilt / Subconscious Projection',
      tensionScore: 10,
    });

    engine.setRelationship({
      sourceCharacterId: 'c1',
      targetCharacterId: 'c3',
      relationshipType: 'Architectural Anchor',
      tensionScore: 4,
    });

    const summary = engine.calculateTensionSummary();

    expect(summary.totalRelationshipLinks).toBe(2);
    expect(summary.averageTensionScore).toBe(7);
    expect(summary.highestTensionPair?.score).toBe(10);
    expect(summary.highestTensionPair?.char1).toBe('Dom Cobb');
    expect(summary.highestTensionPair?.char2).toBe('Mal Cobb');
  });

  it('should export clean adjacency graph for external visualization', () => {
    const engine = new CharacterTensionEngine();

    engine.addCharacter({ id: 'c1', name: 'Cobb', roleType: 'protagonist' });
    engine.addCharacter({ id: 'c2', name: 'Arthur', roleType: 'supporting' });

    engine.setRelationship({
      sourceCharacterId: 'c1',
      targetCharacterId: 'c2',
      relationshipType: 'Trusted Point Man',
      tensionScore: 2,
    });

    const graph = engine.exportAdjacencyList();

    // Nodes are keyed by character ID (not display name).
    expect(graph['c1']).toBeDefined();
    expect(graph['c1'][0].target).toBe('c2');
    expect(graph['c1'][0].tension).toBe(2);
  });

  it('should key nodes by id so duplicate names stay two distinct nodes', () => {
    const engine = new CharacterTensionEngine();

    engine.addCharacter({ id: 's1', name: 'Sarah', roleType: 'protagonist' });
    engine.addCharacter({ id: 's2', name: 'Sarah', roleType: 'antagonist' });

    engine.setRelationship({
      sourceCharacterId: 's1',
      targetCharacterId: 's2',
      relationshipType: 'Mirror Rivalry',
      tensionScore: 6,
    });

    const graph = engine.exportAdjacencyList();

    expect(Object.keys(graph)).toHaveLength(2);
    expect(graph['s1']).toBeDefined();
    expect(graph['s2']).toBeDefined();
    expect(graph['s1'][0].target).toBe('s2');
    expect(graph['s2'][0].target).toBe('s1');
  });
});
