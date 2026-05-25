/**
 * Error message helpers.
 */

import { l10n, window } from 'vscode';

/**
 * Converts an unknown error to readable text.
 */
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

/**
 * Shows the no-workspace-folder error.
 */
export const showNoWorkspaceFolderError = (
  extensionDisplayName: string,
): void => {
  window.showErrorMessage(
    l10n.t(
      '{0}: No workspace folders are open. Please open a workspace folder to use this extension',
      extensionDisplayName,
    ),
  );
};
