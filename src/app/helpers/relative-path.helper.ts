/**
 * Resolves a workspace-relative directory path.
 */

import { relative } from 'path';
import { Uri, workspace } from 'vscode';

import { ExtensionConfig } from '../configs';
import { asDirectoryUri } from './resolve.helper';
import { getWorkspaceRoot } from './workspace-root.helper';

/**
 * Converts a URI to a workspace-relative directory path.
 */
export const relativePath = async (
  targetUri: Uri | undefined,
  isRootContext: boolean,
  config: ExtensionConfig,
): Promise<string> => {
  const resolvedUri = targetUri ? await asDirectoryUri(targetUri) : undefined;

  let resultingFolderPath = '';

  if (isRootContext) {
    const activeWorkspaceRoot = getWorkspaceRoot(config, resolvedUri);
    if (activeWorkspaceRoot && resolvedUri) {
      resultingFolderPath = relative(activeWorkspaceRoot, resolvedUri.fsPath);
    }
  } else {
    resultingFolderPath = resolvedUri
      ? workspace.asRelativePath(resolvedUri.fsPath, false)
      : '';
  }

  return resultingFolderPath;
};
