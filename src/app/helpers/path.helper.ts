/**
 * String path helpers that avoid Node's `path` module.
 *
 * All functions normalize paths to forward slashes (POSIX style)
 * and are framework-agnostic.
 */

import { toPosixPath } from './path-format.helper';

/**
 * Matches one or more trailing slashes.
 */
const TRAILING_SLASHES_REGEX = /\/+$/;

/**
 * Removes trailing slashes from a normalized path.
 */
export const removeTrailingSlashes = (path: string): string => {
  return path.replace(TRAILING_SLASHES_REGEX, '');
};

/**
 * Returns the last separator index of a path.
 */
export const getLastSeparatorIndex = (path: string): number => {
  return path.lastIndexOf('/');
};

/**
 * Normalizes a path to forward slashes.
 */
export const normalizePath = (input: string): string => {
  return toPosixPath(input);
};

/**
 * Returns a normalized path without trailing slashes.
 */
export const normalizeTrimmedPath = (input: string): string => {
  return removeTrailingSlashes(normalizePath(input));
};

/**
 * Returns the last segment of a path.
 *
 * Handles edge cases:
 * - Empty strings return empty string
 * - Root paths return the root identifier
 *
 * @param input The path to extract basename from.
 * @returns The basename (last path segment).
 */
export const getBaseName = (input: string): string => {
  const normalizedPath = normalizeTrimmedPath(input);

  if (normalizedPath === '') {
    return '';
  }

  const lastSeparatorIndex = getLastSeparatorIndex(normalizedPath);

  if (lastSeparatorIndex === -1) {
    return normalizedPath;
  }

  return normalizedPath.slice(lastSeparatorIndex + 1);
};

/**
 * Returns the directory portion of a path.
 */
export const getDirName = (input: string): string => {
  const normalizedPath = normalizeTrimmedPath(input);

  if (normalizedPath === '') {
    return '.';
  }

  const lastSeparatorIndex = getLastSeparatorIndex(normalizedPath);

  if (lastSeparatorIndex === -1) {
    return '.';
  }

  const directoryPath = normalizedPath.slice(0, lastSeparatorIndex);

  return directoryPath === '' ? '.' : directoryPath;
};
