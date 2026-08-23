export type BeatSheetFramework = 'save-the-cat' | 'three-act' | 'heros-journey' | 'dan-harmon';

export interface BeatTemplate {
  name: string;
  targetPercentage: number;
  act?: 'Act 1' | 'Act 2' | 'Act 3';
  description: string;
}

export interface CalculatedBeatTimestamp {
  name: string;
  targetPercentage: number;
  targetMinute: number;
  targetPage: number;
  description: string;
  userContent?: string;
  isCompleted: boolean;
}

export interface SDKCharacter {
  id: string;
  name: string;
  roleType: 'protagonist' | 'antagonist' | 'deuteragonist' | 'supporting' | 'cameo';
  motivation?: string;
}

export interface SDKRelationship {
  sourceCharacterId: string;
  targetCharacterId: string;
  relationshipType: string;
  tensionScore: number; // 1 - 10
  notes?: string;
}

export interface TensionIndexSummary {
  averageTensionScore: number;
  highestTensionPair?: {
    char1: string;
    char2: string;
    score: number;
    dynamic: string;
  };
  totalRelationshipLinks: number;
}
