/**
 * Escapes all special regex characters in a string for safe use in regular expressions.
 * @param input - The string to escape (null/undefined returns empty string).
 * @returns Safe regex-escaped string.
 */
export const escapeRegExp = (input: string): string => {
  if (input === undefined || input === null) {
    return '';
  }
  return String(input).replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
};
