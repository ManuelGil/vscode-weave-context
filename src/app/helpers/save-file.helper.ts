/**
 * Writes a file inside the active workspace.
 */

import { isAbsolute, normalize } from 'path';
import {
  FileSystemError,
  l10n,
  ProgressLocation,
  Uri,
  window,
  workspace,
} from 'vscode';

import { EXTENSION_DISPLAY_NAME, ExtensionConfig } from '../configs';
import { showNoWorkspaceFolderError } from './error-message.helper';
import { clearCache } from './find-files.helper';
import { openDocument } from './open-document.helper';
import { getWorkspaceRoot } from './workspace-root.helper';

/**
 * Writes data to a file inside the current workspace.
 * If the file does not exist, it will be created safely.
 *
 * @param directoryPath - Absolute or workspace-relative directory path.
 * @param filename - Name of the file to create.
 * @param fileContent - Text content to write.
 * @param config - Active extension configuration.
 */
export const saveFile = async (
  directoryPath: string,
  filename: string,
  fileContent: string,
  config: ExtensionConfig,
): Promise<void> => {
  const normalizedDirPath = normalize(directoryPath || '.');
  const providedDirectoryUri = isAbsolute(normalizedDirPath)
    ? Uri.file(normalizedDirPath)
    : undefined;

  const activeWorkspaceRoot = getWorkspaceRoot(config, providedDirectoryUri);

  if (!activeWorkspaceRoot) {
    showNoWorkspaceFolderError(EXTENSION_DISPLAY_NAME);
    return;
  }

  const workspaceRootUri = Uri.file(activeWorkspaceRoot);

  const resolvedDirectoryUri = isAbsolute(normalizedDirPath)
    ? providedDirectoryUri!
    : Uri.joinPath(workspaceRootUri, normalizedDirPath);

  const relativeCheck = workspace.asRelativePath(resolvedDirectoryUri, false);
  if (relativeCheck.startsWith('..')) {
    window.showErrorMessage(l10n.t('Invalid directory path'));
    return;
  }

  const resolvedFileUri = Uri.joinPath(resolvedDirectoryUri, filename);

  let successfullyCreatedFilePath: string | undefined;

  try {
    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: l10n.t('Creating file: {0}', filename),
        cancellable: true,
      },
      async (_progressIndicator, cancellationToken) => {
        try {
          if (cancellationToken.isCancellationRequested) {
            return;
          }

          if (resolvedDirectoryUri.toString() !== workspaceRootUri.toString()) {
            await workspace.fs.createDirectory(resolvedDirectoryUri);
          }

          let doesFileExist = false;
          try {
            await workspace.fs.stat(resolvedFileUri);
            doesFileExist = true;
          } catch (statError: unknown) {
            if (!(statError instanceof FileSystemError)) {
              throw statError;
            }
          }

          if (cancellationToken.isCancellationRequested) {
            return;
          }

          if (doesFileExist) {
            const openFileLabel = l10n.t('Open File');
            const userChoice = await window.showWarningMessage(
              l10n.t('File already exists: {0}', filename),
              openFileLabel,
            );

            if (userChoice === openFileLabel) {
              await openDocument(resolvedFileUri);
            }
            return;
          }

          const encodedFileContent = new TextEncoder().encode(fileContent);
          await workspace.fs.writeFile(resolvedFileUri, encodedFileContent);

          if (cancellationToken.isCancellationRequested) {
            return;
          }

          await openDocument(resolvedFileUri);

          successfullyCreatedFilePath = resolvedFileUri.fsPath;

          clearCache();
        } catch (innerError: any) {
          window.showErrorMessage(
            l10n.t(
              'Error creating file: {0}. Please check the path and try again',
              innerError?.message ?? String(innerError),
            ),
          );
        }
      },
    );

    if (successfullyCreatedFilePath) {
      window.showInformationMessage(
        l10n.t('File created successfully: {0}', successfullyCreatedFilePath),
      );
    }
  } catch (outerError: any) {
    window.showErrorMessage(
      l10n.t(
        'Error creating file: {0}. Please check the path and try again',
        outerError?.message ?? String(outerError),
      ),
    );
  }
};
