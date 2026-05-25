/**
 * Canonical string normalization utilities.
 *
 * Consolidates all string formatting, sanitization, and escaping functions
 * used across the application into a single, cohesive interface.
 *
 * All functions are:
 * - Pure functions (no side effects)
 * - Framework-agnostic
 * - Deterministic
 */

/**
 * Normalizes a string value by trimming whitespace.
 *
 * Returns an empty string for undefined/null values.
 *
 * @param value Raw string value.
 * @returns Normalized string.
 */
export const normalizeString = (value?: string | null): string => {
  return value?.trim() ?? '';
};

/**
 * Normalizes line endings to Unix format (LF only).
 *
 * Converts all CRLF (`\r\n`) to LF (`\n`).
 *
 * @param value String with mixed line endings.
 * @returns String with normalized line endings.
 */
export const normalizeLineEndings = (value: string): string => {
  return value.replace(/\r\n/g, '\n');
};

/**
 * Removes surrounding YAML or JSON quotes from a scalar value.
 *
 * Handles both single and double quotes.
 *
 * @param value Quoted value.
 * @returns Unquoted value.
 */
export const stripQuotes = (value: string): string => {
  const trimmed = value.trim();

  const isDoubleQuoted = trimmed.startsWith('"') && trimmed.endsWith('"');
  const isSingleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'");

  if (isDoubleQuoted || isSingleQuoted) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
};
