import { Position, Range, TextDocument } from 'vscode';
/**
 * Parses Obsidian-style wiki links:
 *
 * - `[[target]]`
 * - `[[target|label]]`
 * - `[[Label With Spaces]]`
 *
 * into a stable semantic model.
 *
 * Resolution uses {@link ParsedWikiLink.target} only;
 * {@link ParsedWikiLink.label} is presentational.
 */
import { ParsedWikiLink, ParsedWikiLinkText, WikiLinkMatch } from '../types';
import { basenameFromFsPath } from './path-format.helper';

/**
 * Normalizes wikilink references into canonical, lowercase slug-like tokens.
 * Removes extensions, collapses whitespace/underscores into hyphens, and trims dashes.
 */
export const normalizeWikiLinkReference = (value: string): string => {
  return value
    .trim()
    .replace(/\.md$/i, '')
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
};

/** Returns the canonical wikilink stem for a note file path. */
export const getWikiLinkCanonicalStem = (filePath: string): string => {
  return basenameFromFsPath(filePath).replace(/\.md$/i, '').trim();
};

/**
 * Regex that matches wiki links on a single line.
 *
 * Captures only the inner content between `[[` and `]]`.
 */
const WIKI_LINK_REGEX = /\[\[([\s\S]*?)\]\]/g;

const WIKI_LINK_OPEN = '[[';

/**
 * Returns true when the character at the given index is escaped
 * by an odd number of backslashes.
 */
const isEscapedCharacter = (text: string, characterIndex: number): boolean => {
  let consecutiveBackslashes = 0;

  for (
    let lookBehindIndex = characterIndex - 1;
    lookBehindIndex >= 0;
    lookBehindIndex--
  ) {
    if (text[lookBehindIndex] !== '\\') {
      break;
    }

    consecutiveBackslashes++;
  }

  return consecutiveBackslashes % 2 !== 0;
};

/**
 * Returns the first unescaped `|` index in wiki link inner text.
 *
 * Escaping rule is minimal and deterministic:
 * a `|` is considered escaped when preceded by
 * an odd number of backslashes.
 */
export const findUnescapedPipeIndex = (innerText: string): number => {
  for (let index = 0; index < innerText.length; index++) {
    const currentCharacter = innerText[index];

    if (currentCharacter !== '|') {
      continue;
    }

    const isEscaped = isEscapedCharacter(innerText, index);

    if (!isEscaped) {
      return index;
    }
  }

  return -1;
};

/**
 * Parses the inner content of a wiki link.
 *
 * Example:
 *
 * - `page`
 * - `page|label`
 * - ` page | label `
 *
 * Input must NOT include the surrounding brackets.
 */
export const parseWikiLinkInner = (innerText: string): ParsedWikiLinkText => {
  const raw = innerText;

  const pipeIndex = findUnescapedPipeIndex(innerText);

  if (pipeIndex === -1) {
    return {
      raw,
      target: innerText.trim(),
    };
  }

  const rawTarget = innerText.slice(0, pipeIndex);
  const rawLabel = innerText.slice(pipeIndex + 1);

  const target = rawTarget.trim();
  const label = rawLabel.trim();

  return {
    raw,
    target,
    ...(label.length > 0 ? { label } : {}),
  };
};

/**
 * Calculates the target range inside a wiki link.
 *
 * Example:
 *
 * `[[  page-name  |label]]`
 *       ^^^^^^^^
 */
export const buildTargetPositionData = (
  innerText: string,
  innerStartColumn: number,
) => {
  const pipeIndex = findUnescapedPipeIndex(innerText);

  const rawTarget =
    pipeIndex === -1 ? innerText : innerText.slice(0, pipeIndex);

  const trimmedTarget = rawTarget.trim();

  const leadingWhitespaceLength =
    rawTarget.length - rawTarget.trimStart().length;

  const targetStartColumn = innerStartColumn + leadingWhitespaceLength;

  const targetEndColumn = targetStartColumn + trimmedTarget.length;

  return {
    targetStartColumn,
    targetEndColumn,
  };
};

/**
 * Finds wiki links on a single line.
 *
 * Does not cross newlines.
 */
export const findWikiLinksInLine = (
  lineText: string,
  lineNumber = 0,
): WikiLinkMatch[] => {
  const matches: WikiLinkMatch[] = [];

  const regex = new RegExp(WIKI_LINK_REGEX);

  let regexMatch = regex.exec(lineText);

  while (regexMatch) {
    const fullMatchText = regexMatch[0];
    const innerText = regexMatch[1];

    const fullStartColumn = regexMatch.index;
    const fullEndColumn = fullStartColumn + fullMatchText.length;

    const innerStartColumn = fullStartColumn + WIKI_LINK_OPEN.length;

    const { targetStartColumn, targetEndColumn } = buildTargetPositionData(
      innerText,
      innerStartColumn,
    );

    const parsedLink = parseWikiLinkInner(innerText);

    const fullRange = new Range(
      lineNumber,
      fullStartColumn,
      lineNumber,
      fullEndColumn,
    );

    const targetRange = new Range(
      lineNumber,
      targetStartColumn,
      lineNumber,
      targetEndColumn,
    );

    matches.push({
      raw: parsedLink.raw,
      target: parsedLink.target,
      label: parsedLink.label,

      range: fullRange,
      targetRange,

      fullStartCol: fullStartColumn,
      fullEndCol: fullEndColumn,

      targetStartCol: targetStartColumn,
      targetEndCol: targetEndColumn,
    });

    regexMatch = regex.exec(lineText);
  }

  return matches;
};

/**
 * Returns the wiki link at the requested cursor position,
 * if any.
 */
export const parseWikiLinkAtPosition = (
  document: TextDocument,
  position: Position,
): ParsedWikiLink | undefined => {
  const lineText = document.lineAt(position.line).text;

  const wikiLinks = findWikiLinksInLine(lineText, position.line);

  return wikiLinks.find(
    (wikiLink) =>
      position.character >= wikiLink.fullStartCol &&
      position.character < wikiLink.fullEndCol,
  );
};

/**
 * Returns updated line text when
 * {@link WikiLinkMatch.target}
 * equals {@link oldTarget} (exact).
 */
export const replaceWikiLinkTargetOnLine = (
  lineText: string,
  oldTarget: string,
  newTarget: string,
): string => {
  const matchingLinks = findWikiLinksInLine(lineText)
    .filter((wikiLink) => wikiLink.target === oldTarget)
    .sort(
      (leftLink, rightLink) =>
        rightLink.targetStartCol - leftLink.targetStartCol,
    );

  let updatedLine = lineText;

  for (const wikiLink of matchingLinks) {
    updatedLine =
      updatedLine.slice(0, wikiLink.targetStartCol) +
      newTarget +
      updatedLine.slice(wikiLink.targetEndCol);
  }

  return updatedLine;
};

/**
 * Replaces wiki link targets across an entire markdown document.
 */
export const replaceWikiLinkTargetsInMarkdown = (
  markdown: string,
  oldTarget: string,
  newTarget: string,
): string => {
  return markdown
    .split(/\r?\n/)
    .map((line) => replaceWikiLinkTargetOnLine(line, oldTarget, newTarget))
    .join('\n');
};
