/**
 * markdownLite.ts
 *
 * WHAT:
 *   Tiny, dependency-free, XSS-safe markdown-subset parser. Converts a plain
 *   string into a typed block tree (MdBlock[]) with pre-parsed inline tokens
 *   (MdInline[]). It NEVER produces HTML strings and nothing downstream should
 *   use dangerouslySetInnerHTML with its output — render via React elements
 *   (see src/components/common/Markdown.tsx).
 *
 *   Supported syntax (exactly this subset):
 *     - Headings:            `# H1`, `## H2`, `### H3`  (deeper levels are NOT
 *                            headings; they fall through to paragraph text)
 *     - Unordered lists:     lines starting `- ` or `* `
 *     - Ordered lists:       lines starting `1.` / `23.` (`\d+\.`)
 *     - Horizontal rule:     a line of three-or-more dashes (`---`)
 *     - Paragraphs:          any other non-empty line(s), blank-line separated
 *     - Inline:              **bold**, *italic*, `code`
 *
 *   Edge cases handled:
 *     - Empty/whitespace-only input -> [].
 *     - CRLF and lone-CR line endings normalised before parsing.
 *     - Unclosed ** / * / ` markers are emitted as literal text.
 *
 * USED BY:
 *   - src/components/common/Markdown.tsx (the React renderer for these blocks)
 *
 * KEY EXPORTS:
 *   - MdInline:        discriminated inline token ({ type, text }).
 *   - parseInline():   string -> MdInline[] (bold/italic/code/text).
 *   - MdBlock:         discriminated block node (heading|paragraph|list|hr).
 *   - parseMarkdown(): string -> MdBlock[] (top-level document tree).
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/** Inline token produced by parseInline. Plain text is type 'text'. */
export interface MdInline {
  /** Which wrapper (if any) surrounds `text` when rendered. */
  type: 'text' | 'bold' | 'italic' | 'code';
  /** Raw character content of the token, delimiters stripped. */
  text: string;
}

/** Level-1..3 heading block (`#` .. `###`). */
export interface MdHeadingBlock {
  type: 'heading';
  /** 1 for `#`, 2 for `##`, 3 for `###`. */
  level: 1 | 2 | 3;
  /** Parsed inline content of the heading line. */
  inlines: MdInline[];
}

/** One-or-more consecutive plain-text lines joined into a single paragraph. */
export interface MdParagraphBlock {
  type: 'paragraph';
  /** Parsed inline content; soft-wrapped lines are joined with '\n'. */
  inlines: MdInline[];
}

/** Consecutive run of list items sharing one marker style. */
export interface MdListBlock {
  type: 'list';
  /** true for `1.` ordered lists, false for `- `/`* ` bullets. */
  ordered: boolean;
  /** One entry per item; each item is parsed inline content. */
  items: MdInline[][];
}

/** Stand-alone horizontal rule (`---`). */
export interface MdHorizontalRuleBlock {
  type: 'horizontalRule';
}

/** Union of every block node emitable by parseMarkdown. */
export type MdBlock =
  | MdHeadingBlock
  | MdParagraphBlock
  | MdListBlock
  | MdHorizontalRuleBlock;

/* -------------------------------------------------------------------------- */
/* Inline parsing                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Parses inline markdown markers (**bold**, *italic*, `code`) into tokens.
 *
 * Algorithm: single left-to-right scan. At each position we try to open a
 * delimiter pair (**, then *, then `); a delimiter only becomes markup when
 * its matching closer exists later in the string, otherwise the character is
 * appended literally (unclosed markers degrade to plain text).
 *
 * @param text Raw inline source (already free of block syntax).
 * @returns Ordered token list; adjacent literal characters are coalesced
 *          into single 'text' tokens.
 */
export function parseInline(text: string): MdInline[] {
  const out: MdInline[] = [];
  let buffer = '';
  let i = 0;

  const flushBuffer = () => {
    if (buffer.length > 0) {
      out.push({ type: 'text', text: buffer });
      buffer = '';
    }
  };

  while (i < text.length) {
    const char = text[i];

    // --- **bold** -----------------------------------------------------------
    if (char === '*' && text[i + 1] === '*') {
      const close = text.indexOf('**', i + 2);
      if (close !== -1) {
        flushBuffer();
        out.push({ type: 'bold', text: text.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
      // Unclosed '**' pair: emit BOTH asterisks literally. Falling through
      // would let the single-star branch below match the second asterisk as
      // a "closer" and produce a meaningless empty italic token.
      buffer += '**';
      i += 2;
      continue;
    }

    // --- *italic* (only when not part of **) ---------------------------------
    // A '*' immediately followed by another '*' belongs to a bold delimiter
    // (or an unclosed pair already handled above) - matching it here would
    // emit a bogus empty italic token.
    if (char === '*' && text[i + 1] !== '*') {
      const close = text.indexOf('*', i + 1);
      if (close !== -1 && text[close - 1] !== '*') {
        flushBuffer();
        out.push({ type: 'italic', text: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    // --- `code` ----------------------------------------------------------------
    if (char === '`') {
      const close = text.indexOf('`', i + 1);
      if (close !== -1) {
        flushBuffer();
        out.push({ type: 'code', text: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    // Plain character.
    buffer += char;
    i += 1;
  }

  flushBuffer();
  return out;
}

/* -------------------------------------------------------------------------- */
/* Block parsing                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Normalises any line-ending style (\r\n, \r, \n) to plain \n.
 */
const normalizeLineEndings = (src: string): string =>
  src.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

/**
 * Matches a heading line; returns its (clamped 1-3) level and inner text.
 * Only #, ##, ### count as headings — ####+ is treated as paragraph text.
 */
const matchHeading = (
  line: string,
): { level: 1 | 2 | 3; text: string } | null => {
  const match = /^(#{1,3})\s+(.*)$/.exec(line);
  if (!match) return null;
  return {
    level: match[1].length as 1 | 2 | 3,
    text: match[2],
  };
};

/**
 * True when the trimmed line is a horizontal rule (three or more dashes,
 * optionally surrounded by spaces). Checked BEFORE list parsing because a
 * bare `---` would otherwise look like an empty bullet item.
 */
const isHorizontalRule = (trimmedLine: string): boolean => /^-{3,}$/.test(trimmedLine);

/** Matches `- item` / `* item`; returns the item's raw inner text. */
const matchUnorderedItem = (line: string): string | null => {
  const match = /^[-*]\s+(.+)$/.exec(line);
  return match ? match[1] : null;
};

/** Matches `12. item`; returns the item's raw inner text. */
const matchOrderedItem = (line: string): string | null => {
  const match = /^\d+\.\s+(.+)$/.exec(line);
  return match ? match[1] : null;
};

/**
 * Parses a full markdown source string into the typed block tree.
 *
 * @param src Markdown document (any mix of \n / \r\n endings). May be empty.
 * @returns Blocks in document order; [] for empty/whitespace-only input.
 *          Pure function: no globals touched, output freshly allocated.
 */
export function parseMarkdown(src: string): MdBlock[] {
  if (!src || src.trim().length === 0) return [];

  const lines = normalizeLineEndings(src).split('\n');
  const blocks: MdBlock[] = [];

  /** Accumulating paragraph lines; flushed on blank lines / block starts / EOF. */
  let paragraphLines: string[] = [];

  /** Accumulating list under construction; null when not inside a list. */
  let currentList: { ordered: boolean; items: MdInline[][] } | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        inlines: parseInline(paragraphLines.join('\n')),
      });
      paragraphLines = [];
    }
  };

  const flushList = () => {
    if (currentList) {
      blocks.push({
        type: 'list',
        ordered: currentList.ordered,
        items: currentList.items,
      });
      currentList = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Blank line closes any open paragraph/list run.
    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    // Horizontal rule (checked before lists so `---` isn't read as a bullet).
    if (isHorizontalRule(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'horizontalRule' });
      continue;
    }

    // Headings (# .. ###).
    const heading = matchHeading(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: heading.level, inlines: parseInline(heading.text) });
      continue;
    }

    // Unordered list items (- / *).
    const unorderedText = matchUnorderedItem(line);
    if (unorderedText !== null) {
      flushParagraph();
      if (!currentList || currentList.ordered) {
        flushList();
        currentList = { ordered: false, items: [] };
      }
      currentList.items.push(parseInline(unorderedText));
      continue;
    }

    // Ordered list items (1.).
    const orderedText = matchOrderedItem(line);
    if (orderedText !== null) {
      flushParagraph();
      if (!currentList || !currentList.ordered) {
        flushList();
        currentList = { ordered: true, items: [] };
      }
      currentList.items.push(parseInline(orderedText));
      continue;
    }

    // Anything else accumulates into the current paragraph.
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}
