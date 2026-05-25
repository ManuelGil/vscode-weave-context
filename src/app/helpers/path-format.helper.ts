/**
 * Normalizes a filesystem path to POSIX separators.
 */
export const toPosixPath = (filePath: string): string => {
  return filePath.replace(/\\/g, '/');
};

/**
 * Returns the basename of a filesystem path.
 */
export const basenameFromFsPath = (fsPath: string): string => {
  const trimmed = toPosixPath(fsPath).replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
};
