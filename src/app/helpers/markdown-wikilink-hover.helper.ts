const MAX_PREVIEW_CHARACTERS = 200;
const MAX_PREVIEW_LINES = 3;
const MARKDOWN_ESCAPE_PATTERN = /([\\`*_{}\[\]()#+\-.!|>])/g;
const STRUCTURAL_LINE_PATTERNS = [/^#{1,5}$/u, /^[-*+]$/u, /^\d+\.$/u];

const appendLineToPreview = (
  previewLines: string[],
  line: string,
): string[] => {
  if (line.length === 0) {
    return previewLines;
  }

  if (previewLines.length >= MAX_PREVIEW_LINES) {
    return previewLines;
  }

  return [...previewLines, line];
};

export const buildWikiLinkHoverContextLine = (
  category?: string,
  project?: string,
): string => {
  const contextParts: string[] = [];

  const trimmedCategory = category?.trim();
  if (trimmedCategory) {
    contextParts.push(`Category : ${trimmedCategory}`);
  }

  const trimmedProject = project?.trim();
  if (trimmedProject) {
    contextParts.push(`Project : ${trimmedProject}`);
  }

  if (contextParts.length === 0) {
    return '';
  }

  return contextParts.join(' │ ');
};

export const escapeMarkdownText = (text: string): string =>
  text.replace(MARKDOWN_ESCAPE_PATTERN, '\\$1');

export const buildMarkdownBlockquote = (text: string): string => {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return '';
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `> ${escapeMarkdownText(line)}`)
    .join('\n');
};

const truncatePreviewText = (text: string): string => {
  if (text.length <= MAX_PREVIEW_CHARACTERS) {
    return text;
  }

  return `${text.slice(0, MAX_PREVIEW_CHARACTERS).trimEnd()}…`;
};

/**
 * Builds a concise hover preview from summary/body content.
 */
export const buildWikiLinkHoverPreview = (
  summary: string | undefined,
  body: string,
): string => {
  const trimmedSummary = summary?.trim();
  if (trimmedSummary) {
    return truncatePreviewText(trimmedSummary);
  }

  return extractPreviewFromBody(body);
};

const extractPreviewFromBody = (body: string): string => {
  const lines = body.split(/\r?\n/);
  let previewLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      if (previewLines.length > 0) {
        break;
      }
      continue;
    }

    if (isStructuralLine(trimmed)) {
      continue;
    }

    previewLines = appendLineToPreview(previewLines, trimmed);

    if (previewLines.length >= MAX_PREVIEW_LINES) {
      break;
    }
  }

  const combined = previewLines.join(' ').trim();
  if (combined.length === 0) {
    return '';
  }

  return truncatePreviewText(combined);
};

const isStructuralLine = (line: string): boolean => {
  return STRUCTURAL_LINE_PATTERNS.some((pattern) => pattern.test(line));
};
