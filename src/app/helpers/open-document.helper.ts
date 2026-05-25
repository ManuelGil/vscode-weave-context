/**
 * Opens a document in the editor.
 */

import {
  type TextDocument,
  type TextDocumentShowOptions,
  TextEditor,
  Uri,
  window,
  workspace,
} from 'vscode';

/**
 * Opens a document resource and shows it in the editor.
 */
export const openDocument = async (
  resource: Uri | string | TextDocument,
  options?: TextDocumentShowOptions,
): Promise<TextEditor> => {
  let document: TextDocument;

  if (typeof resource === 'string') {
    document = await workspace.openTextDocument(Uri.file(resource));
  } else if (resource instanceof Uri) {
    document = await workspace.openTextDocument(resource);
  } else {
    document = resource;
  }

  return window.showTextDocument(document, options);
};
