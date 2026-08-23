import { SDKCharacter, SDKRelationship, TensionIndexSummary } from './types';

export class CharacterTensionEngine {
  private characters: Map<string, SDKCharacter> = new Map();
  private relationships: SDKRelationship[] = [];

  public addCharacter(character: SDKCharacter): void {
    this.characters.set(character.id, character);
  }

  public setRelationship(rel: SDKRelationship): void {
    this.relationships = this.relationships.filter(
      (r) =>
        !(
          (r.sourceCharacterId === rel.sourceCharacterId && r.targetCharacterId === rel.targetCharacterId) ||
          (r.sourceCharacterId === rel.targetCharacterId && r.targetCharacterId === rel.sourceCharacterId)
        )
    );
    this.relationships.push(rel);
  }

  public getRelationship(id1: string, id2: string): SDKRelationship | undefined {
    return this.relationships.find(
      (r) =>
        (r.sourceCharacterId === id1 && r.targetCharacterId === id2) ||
        (r.sourceCharacterId === id2 && r.targetCharacterId === id1)
    );
  }

  public calculateTensionSummary(): TensionIndexSummary {
    if (this.relationships.length === 0) {
      return { averageTensionScore: 0, totalRelationshipLinks: 0 };
    }

    let sum = 0;
    let highest: SDKRelationship | null = null;

    for (const rel of this.relationships) {
      sum += rel.tensionScore;
      if (!highest || rel.tensionScore > highest.tensionScore) {
        highest = rel;
      }
    }

    const averageTensionScore = Math.round((sum / this.relationships.length) * 10) / 10;

    const highestTensionPair = highest
      ? {
          char1: this.characters.get(highest.sourceCharacterId)?.name || highest.sourceCharacterId,
          char2: this.characters.get(highest.targetCharacterId)?.name || highest.targetCharacterId,
          score: highest.tensionScore,
          dynamic: highest.relationshipType,
        }
      : undefined;

    return {
      averageTensionScore,
      highestTensionPair,
      totalRelationshipLinks: this.relationships.length,
    };
  }

  /**
   * Stable graph-node key for a relationship endpoint: the registered
   * character's id when present, falling back to its display name (legacy data
   * may lack ids). Unregistered endpoints degrade to the raw relationship id.
   */
  private nodeKeyFor(characterId: string): string {
    const char = this.characters.get(characterId);
    if (!char) return characterId;
    return char.id || char.name;
  }

  /**
   * Export the tension graph keyed by NODE ID (name fallback) so two cast
   * members sharing a display name never collide into one merged node.
   */
  public exportAdjacencyList(): Record<string, Array<{ target: string; dynamic: string; tension: number }>> {
    const list: Record<string, Array<{ target: string; dynamic: string; tension: number }>> = {};

    for (const [id, char] of this.characters.entries()) {
      const nodeKey = char.id || char.name;
      list[nodeKey] = [];
      for (const rel of this.relationships) {
        if (rel.sourceCharacterId !== id && rel.targetCharacterId !== id) continue;
        const otherId = rel.sourceCharacterId === id ? rel.targetCharacterId : rel.sourceCharacterId;
        list[nodeKey].push({
          target: this.nodeKeyFor(otherId),
          dynamic: rel.relationshipType,
          tension: rel.tensionScore,
        });
      }
    }

    return list;
  }
}
