export type BeatSheetFramework = 'save-the-cat' | 'three-act' | 'dan-harmon' | 'heros-journey';

export interface BeatTemplate {
  name: string;
  targetPercentage: number;
  description: string;
}

export interface CharacterRelation {
  sourceId: string;
  targetId: string;
  relationType: 'allies' | 'rivals' | 'betrayal' | 'unrequited_love' | 'subordinate' | 'mentor';
  tensionScore: number; // 1 to 10
  notes?: string;
}

export interface NarrativeProject {
  id: string;
  title: string;
  logline: string;
  framework: BeatSheetFramework;
  beats: Record<string, string>;
  relationships: CharacterRelation[];
}
