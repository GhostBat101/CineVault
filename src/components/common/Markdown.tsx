/**
 * Markdown.tsx
 *
 * WHAT:
 *   React renderer for the markdown subset parsed by src/utils/markdownLite.ts.
 *   Converts the typed MdBlock[] tree into semantic elements (h3/h4/h5, p,
 *   ul/ol/li, hr, strong, em, code) with minimal inline styling. Renders NO raw
 *   HTML anywhere (no dangerouslySetInnerHTML), so untrusted sources are safe.
 *
 * USES:
 *   - react (useMemo for memoised parsing)
 *   - src/utils/markdownLite.ts (parseMarkdown, MdBlock, MdInline)
 *   - CSS custom properties from src/index.css:
 *       --font-mono, --bg-tertiary, --radius-xs
 *
 * USED BY:
 *   - (none yet — new component; expected consumers: LoreNotesView /
 *     BeatSheetView-style note surfaces that display user-authored text)
 *
 * KEY PROPS:
 *   - source:  Raw markdown string. Re-parsed only when this value changes
 *              (memoised via useMemo).
 *   - className?: Optional class forwarded to the root container.
 *   - style?:     Optional inline style merged over the container defaults.
 */

import React, { useMemo } from 'react';
import { parseMarkdown, MdBlock, MdInline } from '../../utils/markdownLite';

/** Props accepted by <Markdown />. */
interface MarkdownProps {
  /** Raw markdown source to parse and render. */
  source: string;
  /** Optional CSS class applied to the root <div>. */
  className?: string;
  /** Optional inline style merged over the container defaults. */
  style?: React.CSSProperties;
}

/* -------------------------------------------------------------------------- */
/* Inline rendering                                                            */
/* -------------------------------------------------------------------------- */

/** Shared style for inline `code` spans. */
const CODE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  background: 'var(--bg-tertiary)',
  padding: '1px 5px',
  borderRadius: 'var(--radius-xs)',
};

/**
 * Maps parsed inline tokens to React nodes. Plain-text tokens render as bare
 * strings; bold/italic/code map to strong/em/code respectively.
 */
const renderInlines = (inlines: MdInline[], keyPrefix: string): React.ReactNode[] =>
  inlines.map((inline, index) => {
    const key = `${keyPrefix}-inline-${index}`;
    switch (inline.type) {
      case 'bold':
        return <strong key={key}>{inline.text}</strong>;
      case 'italic':
        return <em key={key}>{inline.text}</em>;
      case 'code':
        return (
          <code key={key} style={CODE_STYLE}>
            {inline.text}
          </code>
        );
      default:
        return inline.text;
    }
  });

/* -------------------------------------------------------------------------- */
/* Block rendering                                                             */
/* -------------------------------------------------------------------------- */

/** Maps parser heading level -> semantic heading element (1->h3, 2->h4, 3->h5). */
const HEADING_TAGS: Record<1 | 2 | 3, 'h3' | 'h4' | 'h5'> = {
  1: 'h3',
  2: 'h4',
  3: 'h5',
};

/** Shared list styling (compact left indent). */
const LIST_STYLE: React.CSSProperties = { paddingLeft: '18px', margin: '4px 0' };

/**
 * Maps a single parsed block to its semantic React element.
 */
const renderBlock = (block: MdBlock, index: number): React.ReactNode => {
  const key = `block-${index}`;
  switch (block.type) {
    case 'heading': {
      const Tag = HEADING_TAGS[block.level];
      return <Tag key={key}>{renderInlines(block.inlines, key)}</Tag>;
    }
    case 'paragraph':
      return <p key={key}>{renderInlines(block.inlines, key)}</p>;
    case 'list': {
      const items = block.items.map((itemInlines, itemIndex) => (
        <li key={`${key}-item-${itemIndex}`}>
          {renderInlines(itemInlines, `${key}-item-${itemIndex}`)}
        </li>
      ));
      return block.ordered ? (
        <ol key={key} style={LIST_STYLE}>{items}</ol>
      ) : (
        <ul key={key} style={LIST_STYLE}>{items}</ul>
      );
    }
    case 'horizontalRule':
      return <hr key={key} />;
  }
};

/* -------------------------------------------------------------------------- */
/* Public component                                                            */
/* -------------------------------------------------------------------------- */

export const Markdown: React.FC<MarkdownProps> = ({ source, className, style }) => {
  // Re-parse only when the source string actually changes.
  const blocks = useMemo(() => parseMarkdown(source), [source]);

  return (
    <div className={className} style={{ fontSize: 'inherit', ...style }}>
      {blocks.map(renderBlock)}
    </div>
  );
};
