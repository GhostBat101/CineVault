import { BeatSheetFramework, BeatTemplate, CalculatedBeatTimestamp } from './types';

export const SAVE_THE_CAT_BEATS: BeatTemplate[] = [
  { name: 'Opening Image', act: 'Act 1', targetPercentage: 1, description: 'A snapshot of the protagonist and their world before the transformation begins.' },
  { name: 'Theme Stated', act: 'Act 1', targetPercentage: 5, description: 'What the story is truly about; the life lesson the protagonist must learn.' },
  { name: 'Set-Up', act: 'Act 1', targetPercentage: 10, description: 'Introduce all primary characters, flaws, and the status quo.' },
  { name: 'Catalyst', act: 'Act 1', targetPercentage: 12, description: 'The inciting incident that knocks the protagonistâ€™s world out of balance.' },
  { name: 'Debate', act: 'Act 1', targetPercentage: 20, description: 'The protagonist hesitates or debates whether to take on the journey.' },
  { name: 'Break into Two', act: 'Act 1', targetPercentage: 25, description: 'The protagonist makes a deliberate choice and steps into the special world.' },
  { name: 'B Story', act: 'Act 2', targetPercentage: 30, description: 'Introduction of the secondary narrative/relationship that carries the theme.' },
  { name: 'Fun and Games', act: 'Act 2', targetPercentage: 40, description: 'The promise of the premise; core set-pieces and exploration.' },
  { name: 'Midpoint', act: 'Act 2', targetPercentage: 50, description: 'False victory or false defeat; stakes escalate dramatically.' },
  { name: 'Bad Guys Close In', act: 'Act 2', targetPercentage: 65, description: 'Internal and external pressure mounts against the protagonist.' },
  { name: 'All Is Lost', act: 'Act 2', targetPercentage: 75, description: 'The lowest point; the whiff of death; all hope seems gone.' },
  { name: 'Dark Night of the Soul', act: 'Act 2', targetPercentage: 80, description: 'Protagonist processes failure and finds the core thematic truth.' },
  { name: 'Break into Three', act: 'Act 2', targetPercentage: 85, description: 'The epiphany; the protagonist devises a new plan integrating the theme.' },
  { name: 'Finale', act: 'Act 3', targetPercentage: 95, description: 'The climax; old flaws are conquered and the antagonist is confronted.' },
  { name: 'Final Image', act: 'Act 3', targetPercentage: 100, description: 'The mirror opposite of the Opening Image; proving true transformation.' },
];

export const THREE_ACT_BEATS: BeatTemplate[] = [
  { name: 'Exposition & Status Quo', act: 'Act 1', targetPercentage: 10, description: 'Establish protagonist status quo and ordinary world.' },
  { name: 'Inciting Incident', act: 'Act 1', targetPercentage: 15, description: 'The event that sets the story in motion.' },
  { name: 'Plot Point 1', act: 'Act 1', targetPercentage: 25, description: 'Commitment to the quest / crossing the threshold into Act 2.' },
  { name: 'Rising Action', act: 'Act 2', targetPercentage: 40, description: 'Obstacles and trials compound.' },
  { name: 'Midpoint Reversal', act: 'Act 2', targetPercentage: 50, description: 'A massive shift in perspective or stakes.' },
  { name: 'Plot Point 2 (Crisis)', act: 'Act 2', targetPercentage: 75, description: 'The major crisis preceding the climax.' },
  { name: 'Climax', act: 'Act 3', targetPercentage: 90, description: 'Ultimate confrontation between protagonist and opposing forces.' },
  { name: 'Resolution', act: 'Act 3', targetPercentage: 100, description: 'Denouement and restoration of balance.' },
];

export class BeatSheetEngine {
  public framework: BeatSheetFramework;
  private userBeats: Map<string, string> = new Map();

  constructor(framework: BeatSheetFramework = 'save-the-cat') {
    this.framework = framework;
  }

  public getTemplates(): BeatTemplate[] {
    switch (this.framework) {
      case 'three-act': return THREE_ACT_BEATS;
      default: return SAVE_THE_CAT_BEATS;
    }
  }

  public calculateTimestamps(totalRuntimeMinutes = 110): CalculatedBeatTimestamp[] {
    const templates = this.getTemplates();
    return templates.map((t) => {
      const targetMinute = Math.round((t.targetPercentage / 100) * totalRuntimeMinutes);
      const targetPage = Math.round((t.targetPercentage / 100) * (totalRuntimeMinutes * 0.95)); // Standard industry 1 page = 1 min
      const userContent = this.userBeats.get(t.name);
      return {
        name: t.name,
        targetPercentage: t.targetPercentage,
        targetMinute,
        targetPage,
        description: t.description,
        userContent,
        isCompleted: Boolean(userContent && userContent.trim().length > 10),
      };
    });
  }

  public setBeatContent(beatName: string, content: string): void {
    this.userBeats.set(beatName, content);
  }

  public getBeatContent(beatName: string): string | undefined {
    return this.userBeats.get(beatName);
  }

  public validatePacing(): { isPacingBalanced: boolean; suggestions: string[] } {
    const suggestions: string[] = [];
    const timestamps = this.calculateTimestamps();
    const completed = timestamps.filter((t) => t.isCompleted);

    if (completed.length < 3) {
      suggestions.push('Under-developed beats: Expand key threshold points (Catalyst, Midpoint, All Is Lost).');
    }

    return {
      isPacingBalanced: suggestions.length === 0,
      suggestions,
    };
  }

  public toJSON(): Record<string, string> {
    return Object.fromEntries(this.userBeats);
  }
}
