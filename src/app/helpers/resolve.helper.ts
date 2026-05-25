/**
 * Resolves a directory URI for file operations.
 */

import { FileType, Uri, workspace } from 'vscode';

/**
 * Returns a directory URI for the given resource.
 */
export const asDirectoryUri = async (uri: Uri): Promise<Uri> => {
  try {
    const resourceStat = await workspace.fs.stat(uri);

    if ((resourceStat.type & FileType.Directory) !== 0) {
      return uri;
    }

    return Uri.joinPath(uri, '..');
  } catch {
    return uri;
  }
};
