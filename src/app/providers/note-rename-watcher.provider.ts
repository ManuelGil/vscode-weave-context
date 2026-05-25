import type { Disposable } from 'vscode';
import { workspace } from 'vscode';

import { NotesController } from '../controllers';

export class NoteRenameWatcherProvider {
  constructor(private readonly notesController: NotesController) {}

  register(): Disposable {
    return workspace.onDidRenameFiles(async (event) => {
      for (const { oldUri, newUri } of event.files) {
        if (oldUri.scheme !== 'file' || newUri.scheme !== 'file') {
          continue;
        }

        if (!newUri.fsPath.endsWith('.md')) {
          continue;
        }

        try {
          await this.notesController.handleNoteFileRenamed(oldUri, newUri);
        } catch (error) {
          console.error('handleNoteFileRenamed failed:', error);
        }
      }
    });
  }
}
