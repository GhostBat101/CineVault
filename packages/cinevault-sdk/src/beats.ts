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

/**
 * Dan Harmon's Story Circle (8 steps across 3 acts). The protagonist descends
 * into the unfamiliar (Go/Search/Find), pays a price (Take), and returns
 * changed (Return/Change) - the loop closes where it opened, but transformed.
 */
export const DAN_HARMON_BEATS: BeatTemplate[] = [
  { name: 'You', act: 'Act 1', targetPercentage: 0, description: 'A character exists in their zone of comfort; the status quo is established.' },
  { name: 'Need', act: 'Act 1', targetPercentage: 12, description: 'Something unsettles the comfort zone; the character wants or needs something.' },
  { name: 'Go', act: 'Act 2', targetPercentage: 25, description: 'The character crosses into the unfamiliar situation, committing to change.' },
  { name: 'Search', act: 'Act 2', targetPercentage: 37, description: 'Adapting to the unfamiliar world; trials reveal what the character lacks.' },
  { name: 'Find', act: 'Act 2', targetPercentage: 50, description: 'The character gets what they wanted - at a cost they did not expect.' },
  { name: 'Take', act: 'Act 3', targetPercentage: 62, description: 'The price is paid; the character loses what mattered most to gain their goal.' },
  { name: 'Return', act: 'Act 3', targetPercentage: 87, description: 'The character returns to the familiar situation, forever changed by the journey.' },
  { name: 'Change', act: 'Act 3', targetPercentage: 100, description: 'The transformation is proven; the character - and their world - is new.' },
];

/**
 * The Hero's Journey (Campbell/Vogler, 12 stages). Act 1 leaves home,
 * Act 2 descends into the special world through the Ordeal, Act 3 returns
 * bearing the elixir.
 */
export const HEROES_JOURNEY_BEATS: BeatTemplate[] = [
  { name: 'Ordinary World', act: 'Act 1', targetPercentage: 8, description: 'The hero\'s normal life and inner flaw are established before the adventure.' },
  { name: 'Call to Adventure', act: 'Act 1', targetPercentage: 17, description: 'A challenge or invitation disrupts the ordinary world.' },
  { name: 'Refusal of the Call', act: 'Act 1', targetPercentage: 25, description: 'The hero hesitates, revealing fears and the stakes of leaving.' },
  { name: 'Meeting the Mentor', act: 'Act 1', targetPercentage: 33, description: 'A guide grants the confidence, training, or gift needed to begin.' },
  { name: 'Crossing the Threshold', act: 'Act 2', targetPercentage: 42, description: 'The hero commits to the special world; no turning back.' },
  { name: 'Tests, Allies & Enemies', act: 'Act 2', targetPercentage: 50, description: 'The rules of the new world are learned through trials and alliances.' },
  { name: 'Approach to the Inmost Cave', act: 'Act 2', targetPercentage: 58, description: 'Preparation for the central ordeal; tension peaks before the descent.' },
  { name: 'The Ordeal', act: 'Act 2', targetPercentage: 67, description: 'The hero faces death or greatest fear and is reborn stronger.' },
  { name: 'Reward (Seizing the Sword)', act: 'Act 2', targetPercentage: 75, description: 'The prize of survival is claimed - but danger lingers.' },
  { name: 'The Road Back', act: 'Act 3', targetPercentage: 83, description: 'The chase back to the ordinary world; consequences pursue the hero.' },
  { name: 'Resurrection', act: 'Act 3', targetPercentage: 92, description: 'The final test purifies the hero; the true climax of transformation.' },
  { name: 'Return with the Elixir', act: 'Act 3', targetPercentage: 100, description: 'The hero returns home bearing something that restores the world.' },
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
      case 'dan-harmon': return DAN_HARMON_BEATS;
      case 'heros-journey': return HEROES_JOURNEY_BEATS;
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
