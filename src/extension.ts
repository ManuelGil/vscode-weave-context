/**
 * Main VS Code extension entry point.
 *
 * Entry module for the Project Context extension. Handles activation lifecycle
 * and delegates to ExtensionRuntime for initialization and command registration.
 */

import * as vscode from 'vscode';

import { ExtensionRuntime } from './extension.runtime';

/**
 * Called when the extension is activated (first time a command is executed).
 *
 * @param context - The extension context providing global state and subscription management.
 */
export async function activate(context: vscode.ExtensionContext) {
  try {
    const runtime = new ExtensionRuntime(context);

    if (!(await runtime.initialize())) {
      return;
    }

    await runtime.start();
  } catch (error) {
    console.error('Error activating extension:', error);
    vscode.window.showErrorMessage(
      vscode.l10n.t(
        'An unexpected error occurred while activating the extension',
      ),
    );
  }
}

/**
 * Called when the extension is deactivated.
 * Cleanup operations can be added here if needed.
 */
export function deactivate() {}
