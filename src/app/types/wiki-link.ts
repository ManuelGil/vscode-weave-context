import { Range } from 'vscode';

/**
 * Parsed Obsidian-style wiki link model.
 *
 * Represents the semantic structure of `[[target]]` or `[[target|label]]` wiki link syntax.
 * Parser-specific model - not reusable outside the markdown parsing layer.
 */
export type ParsedWikiLink = {
  raw: string;
  target: string;
  label?: string;
  range: Range;
  targetRange: Range;
};

/**
 * Parsed wiki link with precise column-based positioning information.
 *
 * Used by the editor to map VS Code TextEdit operations to specific regions on a line.
 * Parser-specific model for rename and refactoring operations.
 */
export type WikiLinkMatch = ParsedWikiLink & {
  /** Column (0-based) where `[[` begins on the line. */
  fullStartCol: number;
  /** Column past `]]` on the line. */
  fullEndCol: number;
  /** Column where {@link ParsedWikiLink.target} starts (rename applies here only). */
  targetStartCol: number;
  /** Column past the last character of {@link ParsedWikiLink.target}. */
  targetEndCol: number;
};

/**
 * Parsed wiki link without Range information.
 *
 * Used in contexts where Range objects are not available or needed.
 * Parser-specific text extraction model.
 */
export type ParsedWikiLinkText = Omit<ParsedWikiLink, 'range' | 'targetRange'>;
