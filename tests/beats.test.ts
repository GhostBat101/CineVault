import { describe, it, expect } from 'vitest';
import { BeatSheetEngine, SAVE_THE_CAT_BEATS } from '../packages/cinevault-sdk/src/beats';

describe('BeatSheetEngine Unit Tests', () => {
  it('should initialize with Save the Cat! 15 canonical beats', () => {
    const engine = new BeatSheetEngine('save-the-cat');
    const templates = engine.getTemplates();
    expect(templates.length).toBe(15);
    expect(templates[0].name).toBe('Opening Image');
    expect(templates[14].name).toBe('Final Image');
  });

  it('should calculate accurate minute and page timestamps for a 120-minute film', () => {
    const engine = new BeatSheetEngine('save-the-cat');
    const timestamps = engine.calculateTimestamps(120);

    const openingImage = timestamps.find((t) => t.name === 'Opening Image');
    const midpoint = timestamps.find((t) => t.name === 'Midpoint');
    const allIsLost = timestamps.find((t) => t.name === 'All Is Lost');

    expect(openingImage?.targetMinute).toBe(1);
    expect(midpoint?.targetMinute).toBe(60); // 50% of 120 min
    expect(allIsLost?.targetMinute).toBe(90); // 75% of 120 min
  });

  it('should track user beat completions correctly', () => {
    const engine = new BeatSheetEngine('save-the-cat');
    engine.setBeatContent('Catalyst', 'The protagonist receives a cryptic transmission from deep space.');

    const timestamps = engine.calculateTimestamps(100);
    const catalyst = timestamps.find((t) => t.name === 'Catalyst');

    expect(catalyst?.isCompleted).toBe(true);
    expect(catalyst?.userContent).toContain('cryptic transmission');
  });

  it('should support switching to Three-Act structure template', () => {
    const engine = new BeatSheetEngine('three-act');
    const templates = engine.getTemplates();
    expect(templates.length).toBe(8);
    expect(templates[0].name).toBe('Exposition & Status Quo');
    expect(templates[7].name).toBe('Resolution');
  });

  it('should expose the Dan Harmon Story Circle (8 circles across 3 acts)', () => {
    const engine = new BeatSheetEngine('dan-harmon');
    const templates = engine.getTemplates();

    expect(templates.length).toBe(8);
    expect(templates.map((t) => t.name)).toEqual([
      'You', 'Need', 'Go', 'Search', 'Find', 'Take', 'Return', 'Change',
    ]);
    // Acts follow the 1-2-2-2-3-3-3-3 descent/ascent shape.
    expect(templates.map((t) => t.act)).toEqual([
      'Act 1', 'Act 1', 'Act 2', 'Act 2', 'Act 2', 'Act 3', 'Act 3', 'Act 3',
    ]);
    // Percentages ascend and stay inside 0..100.
    const percentages = templates.map((t) => t.targetPercentage);
    percentages.forEach((p, i) => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
      if (i > 0) expect(p).toBeGreaterThan(percentages[i - 1]);
    });
    expect(percentages[0]).toBe(0);
    expect(percentages[percentages.length - 1]).toBe(100);
  });

  it('should expose the Hero\'s Journey (12 stages) with evenly stepped targets', () => {
    const engine = new BeatSheetEngine('heros-journey');
    const templates = engine.getTemplates();

    expect(templates.length).toBe(12);
    expect(templates[0].name).toBe('Ordinary World');
    expect(templates[7].name).toBe('The Ordeal');
    expect(templates[11].name).toBe('Return with the Elixir');

    // Evenly stepped percentages: strictly increasing from first to last.
    const percentages = templates.map((t) => t.targetPercentage);
    for (let i = 1; i < percentages.length; i += 1) {
      expect(percentages[i]).toBeGreaterThan(percentages[i - 1]);
    }
    expect(percentages[0]).toBeGreaterThan(0);
    expect(percentages[11]).toBe(100);

    // Acts are distributed: Act 1 departure, Act 2 initiation, Act 3 return.
    expect(templates[3].act).toBe('Act 1');
    expect(templates[4].act).toBe('Act 2');
    expect(templates[9].act).toBe('Act 3');
  });

  it('should fall back to Save the Cat! for unknown frameworks', () => {
    const engine = new BeatSheetEngine('not-a-framework' as never);
    expect(engine.getTemplates()).toBe(SAVE_THE_CAT_BEATS);
    expect(engine.getTemplates().length).toBe(15);
  });
});
