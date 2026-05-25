/**
 * Reads file content from a URI.
 */

import { Uri, workspace } from 'vscode';

const utf8Decoder = new TextDecoder('utf-8');

/**
 * Returns decoded UTF-8 file content.
 */
export const readFileContent = async (fileUri: Uri): Promise<string> => {
  const fileBytes = await workspace.fs.readFile(fileUri);
  return utf8Decoder.decode(fileBytes);
};
