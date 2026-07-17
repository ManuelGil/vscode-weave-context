import type {
  NormalizedSemanticFrontmatter,
  ParsedSemanticFrontmatterMarkdown,
  RawFrontmatter,
  RawFrontmatterValue,
  SafeParseResult,
} from '../../shared/types/note';
import {
  normalizeLineEndings,
  stripQuotes as stripYamlQuotes,
} from './text-normalization.helper';

/**
 * YAML frontmatter delimiters.
 */
const FRONTMATTER_DELIMITER = '---';

/**
 * Supported list-style semantic fields.
 */
const STRING_ARRAY_FIELDS = new Set(['tags', 'aliases']);

const FRONTMATTER_CLOSING_SEQUENCE = `\n${FRONTMATTER_DELIMITER}\n`;

/**
 * Formats a YAML scalar.
 *
 * Simple tokens remain unquoted.
 * Complex values are JSON-stringified.
 */
export const formatYamlScalar = (value: string): string => {
  if (/^[\w.-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
};

/**
 * Parses a YAML inline list.
 *
 * Example:
 * `[a, b, "c d"]`
 */
export const parseInlineList = (value: string): string[] => {
  const trimmed = value.trim();

  const isInlineList = trimmed.startsWith('[') && trimmed.endsWith(']');

  if (!isInlineList) {
    return [stripYamlQuotes(trimmed)];
  }

  const inner = trimmed.slice(1, -1).trim();

  if (!inner) {
    return [];
  }

  return inner
    .split(',')
    .map((entry) => stripYamlQuotes(entry.trim()))
    .filter((entry) => entry.length > 0);
};

/**
 * Returns true when a line defines
 * a top-level YAML field.
 */
export const isTopLevelFieldLine = (line: string): boolean => {
  return /^[A-Za-z_][\w-]*\s*:/.test(line) && !/^\s/.test(line);
};

/**
 * Collects indented block lines that belong
 * to a parent YAML field.
 */
export const collectBlockLines = (
  lines: string[],
  startIndex: number,
): {
  blockLines: string[];
  nextIndex: number;
} => {
  const blockLines: string[] = [];

  let currentIndex = startIndex;

  while (currentIndex < lines.length) {
    const line = lines[currentIndex];
    const trimmed = line.trim();

    if (trimmed === '') {
      blockLines.push(line);
      currentIndex++;
      continue;
    }

    if (isTopLevelFieldLine(line)) {
      break;
    }

    blockLines.push(line);
    currentIndex++;
  }

  return {
    blockLines,
    nextIndex: currentIndex,
  };
};

export const upsertAliasesFrontmatterText = (
  rawFrontmatterText: string,
  aliases: string[],
): string => {
  const normalized = normalizeLineEndings(rawFrontmatterText).split('\n');
  const aliasLines = buildAliasBlockLines(aliases);
  const aliasStartIndex = normalized.findIndex((line) => {
    if (!isTopLevelFieldLine(line)) {
      return false;
    }

    const trimmed = line.trim();
    const delimiterIndex = trimmed.indexOf(':');

    if (delimiterIndex === -1) {
      return false;
    }

    const fieldName = trimmed.slice(0, delimiterIndex).trim();
    return fieldName === 'aliases';
  });

  if (aliasStartIndex === -1) {
    const needsBlankLine =
      normalized.length > 0 &&
      normalized[normalized.length - 1].trim().length > 0;
    const targetLines = needsBlankLine
      ? [...normalized, '', ...aliasLines]
      : [...normalized, ...aliasLines];
    return targetLines.join('\n').trimEnd();
  }

  const { nextIndex: aliasEndIndex } = collectBlockLines(
    normalized,
    aliasStartIndex + 1,
  );
  const before = normalized.slice(0, aliasStartIndex);
  const after = normalized.slice(aliasEndIndex);
  return [...before, ...aliasLines, ...after].join('\n').trimEnd();
};

const buildAliasBlockLines = (aliases: string[]): string[] => {
  const block = ['aliases:'];

  if (aliases.length === 0) {
    block.push('  -');
    return block;
  }

  for (const alias of aliases) {
    block.push(`  - ${formatYamlScalar(alias)}`);
  }

  return block;
};

/**
 * Parses a YAML string array block.
 *
 * Example:
 *
 * tags:
 *   - a
 *   - b
 */
export const parseStringArrayBlock = (lines: string[]): string[] => {
  const values: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      continue;
    }

    const listItemMatch = line.match(/^\s*-\s*(.*)$/);

    if (!listItemMatch) {
      break;
    }

    const value = stripYamlQuotes(listItemMatch[1].trim());

    if (value.length > 0) {
      values.push(value);
    }
  }

  return values;
};

/**
 * Parses raw frontmatter fields into
 * a normalized object structure.
 */
export const parseRawFrontmatterFields = (
  frontmatterText: string,
): Record<string, RawFrontmatterValue> => {
  const fields: Record<string, RawFrontmatterValue> = {};

  const lines = normalizeLineEndings(frontmatterText).split('\n');

  for (let currentIndex = 0; currentIndex < lines.length; currentIndex++) {
    const line = lines[currentIndex];

    const isIndentedLine = /^\s/.test(line);

    if (line.trim() === '' || isIndentedLine) {
      continue;
    }

    const separatorIndex = line.indexOf(':');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();

    const rawValue = line.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    const isInlineArray = rawValue.startsWith('[') && rawValue.endsWith(']');

    if (isInlineArray) {
      fields[key] = parseInlineList(rawValue);

      continue;
    }

    if (rawValue.length > 0) {
      fields[key] = stripYamlQuotes(rawValue);

      continue;
    }

    const { blockLines, nextIndex } = collectBlockLines(
      lines,
      currentIndex + 1,
    );

    currentIndex = nextIndex - 1;

    if (STRING_ARRAY_FIELDS.has(key)) {
      fields[key] = parseStringArrayBlock(blockLines);

      continue;
    }

    const blockValue = blockLines.join('\n').trimEnd();

    fields[key] = blockValue;
  }

  return fields;
};

/**
 * Extracts YAML frontmatter from markdown.
 */
export const extractRawFrontmatter = (
  markdown: string,
): RawFrontmatter | null => {
  const normalized = normalizeLineEndings(markdown);

  const startsWithFrontmatter = normalized.startsWith(
    `${FRONTMATTER_DELIMITER}\n`,
  );

  if (!startsWithFrontmatter) {
    return null;
  }

  const closingDelimiterIndex = normalized.indexOf(
    FRONTMATTER_CLOSING_SEQUENCE,
    FRONTMATTER_DELIMITER.length + 1,
  );

  if (closingDelimiterIndex === -1) {
    return null;
  }

  const frontmatterText = normalized.slice(
    FRONTMATTER_DELIMITER.length + 1,
    closingDelimiterIndex,
  );

  return {
    text: frontmatterText,
    fields: parseRawFrontmatterFields(frontmatterText),
  };
};

/**
 * Normalizes semantic frontmatter into
 * typed domain structures.
 */
export const normalizeSemanticFrontmatter = (
  rawFrontmatter: RawFrontmatter | null,
): NormalizedSemanticFrontmatter => {
  const fields = rawFrontmatter?.fields ?? {};

  const normalizeString = (
    value: RawFrontmatterValue | undefined,
  ): string | undefined => {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : undefined;
  };

  const normalizeList = (
    value: RawFrontmatterValue | undefined,
  ): string[] | undefined => {
    if (value === undefined) {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value
        .map((entry) =>
          typeof entry === 'string' ? stripYamlQuotes(entry) : '',
        )
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? [stripYamlQuotes(trimmed)] : [];
  };

  return {
    title: normalizeString(fields.title),
    created: normalizeString(fields.created),
    updated: normalizeString(fields.updated),
    category: normalizeString(fields.category),
    type: normalizeString(fields.type),
    project: normalizeString(fields.project),
    tags: normalizeList(fields.tags),
    aliases: normalizeList(fields.aliases),
    summary: normalizeString(fields.summary),
  };
};

/**
 * Parses supported semantic frontmatter markdown.
 */
export const parseSupportedSemanticFrontmatter = (
  markdown: string,
): SafeParseResult<ParsedSemanticFrontmatterMarkdown> => {
  const normalized = normalizeLineEndings(markdown);

  const rawFrontmatter = extractRawFrontmatter(normalized);

  const hasFrontmatter = normalized.startsWith(`${FRONTMATTER_DELIMITER}\n`);

  const endDelimiterIndex = hasFrontmatter
    ? normalized.indexOf(`\n${FRONTMATTER_DELIMITER}\n`, 4)
    : -1;

  const body =
    rawFrontmatter !== null && endDelimiterIndex !== -1
      ? normalized.slice(endDelimiterIndex + 5)
      : normalized.trim();

  return {
    data: {
      rawFrontmatter,
      frontmatter: normalizeSemanticFrontmatter(rawFrontmatter),
      body,
    },
    errors: [],
  };
};

/**
 * Serializes semantic frontmatter into YAML.
 */
export const serializeSemanticFrontmatter = (
  frontmatter: NormalizedSemanticFrontmatter,
): string => {
  const lines: string[] = [FRONTMATTER_DELIMITER];

  const appendScalar = (key: string, value: string | undefined): void => {
    if (value === undefined) {
      return;
    }

    lines.push(`${key}: ${formatYamlScalar(value)}`);
  };

  const appendList = (key: string, value: string[] | undefined): void => {
    if (value === undefined) {
      return;
    }

    if (value.length === 0) {
      lines.push(`${key}: []`);
      return;
    }

    lines.push(
      `${key}: [${value.map((entry) => formatYamlScalar(entry)).join(', ')}]`,
    );
  };

  appendScalar('title', frontmatter.title);

  appendScalar('category', frontmatter.category);

  appendScalar('created', frontmatter.created);

  appendScalar('updated', frontmatter.updated);

  appendScalar('type', frontmatter.type);

  appendScalar('project', frontmatter.project);

  appendList('tags', frontmatter.tags);

  appendList('aliases', frontmatter.aliases);

  appendScalar('summary', frontmatter.summary);

  lines.push(FRONTMATTER_DELIMITER);

  return `${lines.join('\n')}\n`;
};

/**
 * Composes markdown content from semantic frontmatter and body.
 */
export const composeSemanticMarkdown = (
  frontmatter: NormalizedSemanticFrontmatter,
  body: string,
): string => {
  const normalizedBody = body ?? '';

  return `${serializeSemanticFrontmatter(frontmatter)}\n${normalizedBody}`;
};
