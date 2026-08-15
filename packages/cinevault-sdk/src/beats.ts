import { BeatSheetFramework, BeatTemplate } from './types';

export const SAVE_THE_CAT_BEATS: BeatTemplate[] = [
  { name: 'Opening Image', targetPercentage: 1, description: 'A snapshot of the protagonist and their world before the transformation begins.' },
  { name: 'Theme Stated', targetPercentage: 5, description: 'What the story is truly about; the life lesson the protagonist must learn.' },
  { name: 'Set-Up', targetPercentage: 10, description: 'Introduce all primary characters, flaws, and the status quo.' },
  { name: 'Catalyst', targetPercentage: 12, description: 'The inciting incident that knocks the protagonist’s world out of balance.' },
  { name: 'Debate', targetPercentage: 20, description: 'The protagonist hesitates or debates whether to take on the journey.' },
  { name: 'Break into Two', targetPercentage: 25, description: 'The protagonist makes a deliberate choice and steps into the special world.' },
  { name: 'B Story', targetPercentage: 30, description: 'Introduction of the secondary narrative/relationship that carries the theme.' },
  { name: 'Fun and Games', targetPercentage: 50, description: 'The promise of the premise; core set-pieces and exploration.' },
  { name: 'Midpoint', targetPercentage: 50, description: 'False victory or false defeat; stakes escalate dramatically.' },
  { name: 'Bad Guys Close In', targetPercentage: 65, description: 'Internal and external pressure mounts against the protagonist.' },
  { name: 'All Is Lost', targetPercentage: 75, description: 'The lowest point; the whiff of death; all hope seems gone.' },
  { name: 'Dark Night of the Soul', targetPercentage: 80, description: 'Protagonist processes failure and finds the core thematic truth.' },
  { name: 'Break into Three', targetPercentage: 85, description: 'The epiphany; the protagonist devises a new plan integrating the theme.' },
  { name: 'Finale', targetPercentage: 95, description: 'The climax; old flaws are conquered and the antagonist is confronted.' },
  { name: 'Final Image', targetPercentage: 100, description: 'The mirror opposite of the Opening Image; proving true transformation.' },
];

export class BeatSheetEngine {
  public framework: BeatSheetFramework;
  private userBeats: Map<string, string> = new Map();

  constructor(framework: BeatSheetFramework = 'save-the-cat') {
    this.framework = framework;
  }

  public getTemplates(): BeatTemplate[] {
    return SAVE_THE_CAT_BEATS;
  }

  public setBeatContent(beatName: string, content: string): void {
    this.userBeats.set(beatName, content);
  }

  public getBeatContent(beatName: string): string | undefined {
    return this.userBeats.get(beatName);
  }

  public toJSON(): Record<string, string> {
    return Object.fromEntries(this.userBeats);
  }
}
