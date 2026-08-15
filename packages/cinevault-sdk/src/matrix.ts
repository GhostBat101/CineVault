import { CharacterRelation } from './types';

export class CharacterTensionMatrix {
  private relations: CharacterRelation[] = [];

  public setRelationship(relation: CharacterRelation): void {
    const existingIdx = this.relations.findIndex(
      r => r.sourceId === relation.sourceId && r.targetId === relation.targetId
    );
    if (existingIdx >= 0) {
      this.relations[existingIdx] = relation;
    } else {
      this.relations.push(relation);
    }
  }

  public getRelationship(sourceId: string, targetId: string): CharacterRelation | undefined {
    return this.relations.find(
      r => (r.sourceId === sourceId && r.targetId === targetId) ||
           (r.sourceId === targetId && r.targetId === sourceId)
    );
  }

  public calculateAverageTension(): number {
    if (this.relations.length === 0) return 0;
    const sum = this.relations.reduce((acc, curr) => acc + curr.tensionScore, 0);
    return Number((sum / this.relations.length).toFixed(2));
  }

  public getAllRelationships(): CharacterRelation[] {
    return [...this.relations];
  }
}
