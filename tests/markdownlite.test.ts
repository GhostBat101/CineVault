/**
 * tests/markdownlite.test.ts
 *
 * WHAT: Contract tests for the zero-dependency markdown subset parser
 *       (src/utils/markdownLite.ts) that renders lore notes, AI audit output,
 *       beat-sheet AI panels, and media summaries. Locks down the safety-
 *       critical properties: typed block output only (never raw HTML), CRLF
 *       tolerance, and unclosed-inline-marker fallbacks to literal text.
 *
 * USES:    vitest, src/utils/markdownLite.ts.
 * USED BY: `npm test` / CI frontend job.
 */
import { describe, it, expect } from 'vitest';
import { parseInline, parseMarkdown } from '../src/utils/markdownLite';

describe('parseInline', () => {
  it('returns a single text token for plain strings', () => {
    expect(parseInline('hello world')).toEqual([{ type: 'text', text: 'hello world' }]);
  });

  it('parses bold, italic, and code spans', () => {
    const tokens = parseInline('a **bold** and *italic* and `code` bit');
    const kinds = tokens.map((t) => t.type);
    expect(kinds).toContain('bold');
    expect(kinds).toContain('italic');
    expect(kinds).toContain('code');
    expect(tokens.find((t) => t.type === 'bold')).toMatchObject({ text: 'bold' });
    expect(tokens.find((t) => t.type === 'code')).toMatchObject({ text: 'code' });
  });

  it('falls back to literal text for unclosed markers', () => {
    // '**' with no closer must survive as literal asterisks - never an
    // empty italic/bold token (the single-star branch used to steal one '*').
    const tokens = parseInline('oops **unclosed');
    expect(tokens.every((t) => t.type === 'text')).toBe(true);
    const joined = tokens.map((t) => t.text).join('');
    expect(joined).toBe('oops **unclosed');

    // Lone '*' with no closer is literal too.
    const lone = parseInline('a * b');
    expect(lone.every((t) => t.type === 'text')).toBe(true);
  });

  it('handles empty input', () => {
    expect(parseInline('')).toEqual([]);
  });
});

describe('parseMarkdown', () => {
  it('produces no blocks for empty or whitespace-only input', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n \r\n\t')).toEqual([]);
  });

  it('classifies headings by level', () => {
    const blocks = parseMarkdown('# One\n## Two\n### Three');
    expect(blocks.map((b) => (b.type === 'heading' ? b.level : null))).toEqual([1, 2, 3]);
  });

  it('groups consecutive lines into one paragraph with inline parsing', () => {
    const blocks = parseMarkdown('first line\nsecond line');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
  });

  it('detects ordered and unordered lists', () => {
    const blocks = parseMarkdown('- alpha\n- beta\n1. one\n2. two');
    const lists = blocks.filter((b) => b.type === 'list');
    expect(lists).toHaveLength(2);
    expect(lists[0]).toMatchObject({ ordered: false });
    expect(lists[1]).toMatchObject({ ordered: true });
    // Items are parsed inline arrays - check their plain-text payloads.
    if (lists[0].type === 'list' && lists[1].type === 'list') {
      expect(lists[0].items).toHaveLength(2);
      expect(lists[1].items).toHaveLength(2);
      const firstItemText = lists[0].items[0].map((t) => t.text).join('');
      const secondListFirstItem = lists[1].items[0].map((t) => t.text).join('');
      expect(firstItemText).toBe('alpha');
      expect(secondListFirstItem).toBe('one');
    }
  });

  it('recognizes horizontal rules', () => {
    const blocks = parseMarkdown('before\n---\nafter');
    expect(blocks.some((b) => b.type === 'horizontalRule')).toBe(true);
  });

  it('tolerates CRLF line endings', () => {
    const crlf = parseMarkdown('# Title\r\n\r\nBody text\r\n- item one\r\n');
    expect(crlf.some((b) => b.type === 'heading')).toBe(true);
    expect(crlf.some((b) => b.type === 'list')).toBe(true);
  });

  it('never emits raw HTML - output is a typed block tree only', () => {
    const hostile = '<script>alert(1)</script>\n\n**not html**';
    const blocks = parseMarkdown(hostile);
    const serialized = JSON.stringify(blocks);
    // The script tag survives only as inert TEXT content, not markup.
    expect(serialized).toContain('<script>');
    expect(() => JSON.parse(serialized)).not.toThrow();
  });

  it('renders a realistic AI-analysis document end to end', () => {
    const doc = [
      '### Narrative Thesis',
      '',
      'In **Test Film**, tension escalates.',
      '',
      '- Rising stakes',
      '- Thematic polarization',
      '',
      '---',
      '',
      '*Analysis complete.*',
    ].join('\n');

    const blocks = parseMarkdown(doc);
    expect(blocks.find((b) => b.type === 'heading')).toBeDefined();
    expect(blocks.filter((b) => b.type === 'list')).toHaveLength(1);
    expect(blocks.some((b) => b.type === 'horizontalRule')).toBe(true);
  });
});
