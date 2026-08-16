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

  public exportAdjacencyList(): Record<string, Array<{ target: string; dynamic: string; tension: number }>> {
    const list: Record<string, Array<{ target: string; dynamic: string; tension: number }>> = {};

    for (const [id, char] of this.characters.entries()) {
      list[char.name] = [];
      for (const rel of this.relationships) {
        if (rel.sourceCharacterId === id) {
          const targetName = this.characters.get(rel.targetCharacterId)?.name || rel.targetCharacterId;
          list[char.name].push({ target: targetName, dynamic: rel.relationshipType, tension: rel.tensionScore });
        } else if (rel.targetCharacterId === id) {
          const targetName = this.characters.get(rel.sourceCharacterId)?.name || rel.sourceCharacterId;
          list[char.name].push({ target: targetName, dynamic: rel.relationshipType, tension: rel.tensionScore });
        }
      }
    }

    return list;
  }
}
