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
});
