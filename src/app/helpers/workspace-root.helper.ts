/**
 * Resolves the active workspace folder and root path.
 */

import { Uri, type WorkspaceFolder, workspace } from 'vscode';

import { ExtensionConfig } from '../configs';

/**
 * Returns the currently open workspace folders.
 */
export const listWorkspaceFolders = (): readonly WorkspaceFolder[] =>
  workspace.workspaceFolders ?? [];

/**
 * Returns the workspace root path used for file operations.
 */
export const getWorkspaceRoot = (
  config: ExtensionConfig,
  targetUri?: Uri,
): string | undefined => {
  const folderUri = getWorkspaceFolderUri(config, targetUri);
  return folderUri?.fsPath;
};

/**
 * Returns the workspace folder URI used for file operations.
 */
export const getWorkspaceFolderUri = (
  config: ExtensionConfig,
  targetUri?: Uri,
): Uri | undefined => {
  if (targetUri) {
    const targetWorkspaceFolder = workspace.getWorkspaceFolder(targetUri);

    if (targetWorkspaceFolder) {
      return targetWorkspaceFolder.uri;
    }
  }

  if (config.workspaceSelection) {
    const matched = listWorkspaceFolders().find(
      (folder) => folder.uri.fsPath === config.workspaceSelection,
    );
    if (matched) {
      return matched.uri;
    }

    return Uri.file(config.workspaceSelection);
  }

  return listWorkspaceFolders()[0]?.uri ?? undefined;
};
