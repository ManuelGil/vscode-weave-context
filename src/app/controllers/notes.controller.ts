/**
 * UI command handlers for project notes operations.
 *
 * Implements VS Code command handlers for create, open, insert link, and navigation flows.
 * Delegates note I/O to NotesService; manages user interaction flows via QuickPick.
 *
 * Assumes NotesService is configured for the active workspace folder and uses the standard text editor flow.
 */

import path from 'path';

import {
  CompletionItem,
  CompletionItemKind,
  Location,
  LocationLink,
  l10n,
  Position,
  type QuickPickItem,
  Range,
  Selection,
  type TextDocument,
  Uri,
  WorkspaceEdit,
  window,
  workspace,
} from 'vscode';

import type { Note } from '../../shared/types/note';
import { ExtensionConfig } from '../configs';
import {
  clearCache,
  composeSemanticMarkdown,
  findWikiLinksInLine,
  openDocument,
  parseSupportedSemanticFrontmatter,
  parseWikiLinkAtPosition,
  readFileContent,
  upsertAliasesFrontmatterText,
} from '../helpers';
import { NotesService } from '../services';
import type { OperationContext } from '../types';

/**
 * Handles VS Code UI flows for project notes (commands: create, open, insert link).
 *
 * Assumes {@link NotesService} is configured for the active workspace folder and opens notes with the workspace API.
 */
export class NotesController {
  /**
   * Initializes the controller with the extension configuration and notes service.
   */
  constructor(
    readonly config: ExtensionConfig,
    private readonly notesService: NotesService,
  ) {}

  /**
   * Prompts for title and optional tags, creates the note file, and opens it in an editor with the cursor after frontmatter.
   */
  async createProjectNote(): Promise<void> {
    try {
      const title = await window.showInputBox({
        prompt: l10n.t('Enter a title for the new note'),
        placeHolder: l10n.t('Note title'),
        validateInput: (value) => {
          return value && value.trim().length > 0
            ? null
            : l10n.t('Title cannot be empty');
        },
      });

      if (!title) {
        return;
      }

      const tagsInput = await window.showInputBox({
        prompt: l10n.t('Enter tags (comma separated)'),
        placeHolder: l10n.t('tag1, tag2, tag3'),
      });

      const tags = tagsInput
        ? tagsInput
            .split(',')
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0)
        : [];

      const note = await this.notesService.createNote(title, '', tags);

      if (note) {
        await openDocument(note.filePath);

        const editor = window.activeTextEditor;
        if (editor) {
          const text = editor.document.getText();
          const frontmatterEnd = text.indexOf('---\n\n');

          if (frontmatterEnd > -1) {
            const position = editor.document.positionAt(frontmatterEnd + 5);
            editor.selection = new Selection(position, position);
            editor.revealRange(new Range(position, position));
          }
        }

        window.showInformationMessage(l10n.t('Note "{0}" created', title));
      } else {
        window.showErrorMessage(l10n.t('Failed to create note'));
      }
    } catch (error) {
      console.error('Error creating note:', error);
      window.showErrorMessage(
        l10n.t('An error occurred while creating the note'),
      );
    }
  }

  /**
   * Lists existing notes in a QuickPick and opens the selection.
   */
  async openProjectNote(): Promise<void> {
    try {
      const notes = await this.notesService.getAllNotes();

      if (await this.handleEmptyNotesAndMaybeCreate(notes)) {
        return;
      }

      const items = this.toNoteQuickPickItems(notes);

      const selected = await window.showQuickPick(items, {
        placeHolder: l10n.t('Select a note to open'),
      });

      if (selected) {
        await openDocument(selected.note.filePath);
      }
    } catch (error) {
      console.error('Error opening note:', error);
      window.showErrorMessage(
        l10n.t('An error occurred while opening the note'),
      );
    }
  }

  /**
   * Inserts a canonical wikilink (with optional alias) for a chosen note at the current cursor.
   */
  async insertNoteLink(): Promise<void> {
    try {
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        window.showWarningMessage(l10n.t('No active editor available!'));
        return;
      }

      const notes = await this.notesService.getAllNotes();

      if (await this.handleEmptyNotesAndMaybeCreate(notes)) {
        return;
      }

      const items = this.toNoteQuickPickItems(notes);

      const selected = await window.showQuickPick(items, {
        placeHolder: l10n.t('Select a note to link'),
      });

      if (!selected) {
        return;
      }

      const canonicalStem = path
        .basename(selected.note.filePath)
        .replace(/\.md$/i, '');
      const alias = selected.note.title?.trim();
      const hasAlias =
        alias &&
        alias.length > 0 &&
        alias.localeCompare(canonicalStem, undefined, {
          sensitivity: 'base',
        }) !== 0;
      const wikiLink = hasAlias
        ? `[[${canonicalStem}|${alias}]]`
        : `[[${canonicalStem}]]`;

      const orderedSelections = [...activeEditor.selections].sort(
        (left, right) => {
          const leftOffset = activeEditor.document.offsetAt(left.active);
          const rightOffset = activeEditor.document.offsetAt(right.active);
          return rightOffset - leftOffset;
        },
      );

      await activeEditor.edit((editBuilder) => {
        orderedSelections.forEach((selection) => {
          editBuilder.insert(selection.active, wikiLink);
        });
      });
    } catch (error) {
      console.error('Error inserting note link:', error);
      window.showErrorMessage(
        l10n.t('An error occurred while inserting the note link'),
      );
    }
  }

  prepareWikiLinkRename(
    document: TextDocument,
    position: Position,
  ): { range: Range; placeholder: string } | undefined {
    const wikiLink = parseWikiLinkAtPosition(document, position);
    if (!wikiLink) {
      return undefined;
    }

    const isWithinMatch =
      position.character >= wikiLink.range.start.character &&
      position.character < wikiLink.range.end.character;
    if (!isWithinMatch) {
      return undefined;
    }

    return {
      range: wikiLink.targetRange as Range,
      placeholder: wikiLink.target,
    };
  }

  async renameWikiLinkTarget(
    document: TextDocument,
    position: Position,
    newName: string,
  ): Promise<WorkspaceEdit | undefined> {
    const wikiLink = parseWikiLinkAtPosition(document, position);
    if (!wikiLink) {
      return undefined;
    }

    const trimmedOldTarget = wikiLink.target.trim();
    const trimmedNewTarget = newName.trim();
    if (
      !trimmedOldTarget ||
      !trimmedNewTarget ||
      /[/\\]/.test(trimmedNewTarget) ||
      trimmedOldTarget === trimmedNewTarget
    ) {
      return undefined;
    }

    const targetUri =
      await this.notesService.resolveMarkdownWikiLink(trimmedOldTarget);
    if (!targetUri) {
      return undefined;
    }

    const conflictingTarget =
      await this.notesService.resolveMarkdownWikiLink(trimmedNewTarget);
    if (
      conflictingTarget &&
      conflictingTarget.toString() !== targetUri.toString()
    ) {
      return undefined;
    }

    const aliases = await this.notesService.getWikiLinkAliases(targetUri);
    const canonicalStem = path.basename(targetUri.fsPath).replace(/\.md$/i, '');
    const semanticTargets = new Set(
      [canonicalStem, ...aliases]
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );

    if (
      semanticTargets.size === 1 &&
      semanticTargets.has(trimmedNewTarget) &&
      canonicalStem === trimmedNewTarget
    ) {
      return undefined;
    }

    const edit = new WorkspaceEdit();
    edit.replace(document.uri, wikiLink.targetRange as Range, trimmedNewTarget);

    if (canonicalStem !== trimmedNewTarget) {
      const newFileUri = Uri.file(
        path.join(path.dirname(targetUri.fsPath), `${trimmedNewTarget}.md`),
      );
      edit.renameFile(targetUri, newFileUri);
    }

    const context: OperationContext = {};
    const noteUris =
      await this.notesService.discoverNoteFileUrisThroughContext(context);

    for (const uri of noteUris) {
      let doc: TextDocument;
      try {
        doc = await workspace.openTextDocument(uri);
      } catch {
        continue;
      }

      const currentContent = doc.getText();
      const rewritten = this.rewriteWikiLinkTargetsInMarkdown(
        currentContent,
        semanticTargets,
        trimmedNewTarget,
      );

      if (rewritten !== currentContent) {
        edit.replace(uri, this.getFullDocumentRange(doc), rewritten);
      }
    }

    return edit;
  }

  async resolveWikiLinkDefinition(
    document: TextDocument,
    position: Position,
  ): Promise<LocationLink[] | undefined> {
    const wikiLink = parseWikiLinkAtPosition(document, position);
    if (!wikiLink) {
      return undefined;
    }

    const targetUri = await this.notesService.resolveMarkdownWikiLink(
      wikiLink.target,
    );

    if (!targetUri) {
      return undefined;
    }

    const targetPosition = new Position(0, 0);
    const targetRange = new Range(targetPosition, targetPosition);

    return [
      {
        originSelectionRange: wikiLink.range as Range,
        targetUri,
        targetRange,
        targetSelectionRange: targetRange,
      },
    ];
  }

  async resolveWikiLinkReferences(
    document: TextDocument,
    position: Position,
  ): Promise<Location[]> {
    const wikiLink = parseWikiLinkAtPosition(document, position);
    if (!wikiLink) {
      return [];
    }

    const targetUri = await this.notesService.resolveMarkdownWikiLink(
      wikiLink.target,
    );
    if (!targetUri) {
      return [];
    }

    const canonicalStem = path.basename(targetUri.fsPath).replace(/\.md$/i, '');
    const aliases = await this.notesService.getWikiLinkAliases(targetUri);
    const semanticTargets = [canonicalStem, ...aliases];

    const context: OperationContext = {};
    const noteUris =
      await this.notesService.discoverNoteFileUrisThroughContext(context);

    const references: Location[] = [];

    for (const uri of noteUris) {
      let doc: TextDocument;
      try {
        doc = await workspace.openTextDocument(uri);
      } catch {
        continue;
      }

      const lines = doc.getText().split(/\r?\n/);
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const hits = findWikiLinksInLine(lines[lineIndex], lineIndex);
        for (const hit of hits) {
          if (semanticTargets.includes(hit.target)) {
            references.push(new Location(uri, hit.range as Range));
          }
        }
      }
    }

    return references;
  }

  async provideWikiLinkCompletions(
    document: TextDocument,
    position: Position,
  ): Promise<CompletionItem[]> {
    const lineText = document.lineAt(position.line).text;
    const beforeCursor = lineText.slice(0, position.character);
    const openIndex = beforeCursor.lastIndexOf('[[');
    const closeIndex = beforeCursor.lastIndexOf(']]');

    if (openIndex === -1 || closeIndex > openIndex) {
      return [];
    }

    const notes = await this.notesService.getAllNotes();
    const completions: CompletionItem[] = [];

    for (const note of notes) {
      const canonicalStem = path.basename(note.filePath).replace(/\.md$/i, '');
      const relativePath = workspace.asRelativePath(note.filePath, false);
      const titleOrStem = note.title?.trim() || canonicalStem;

      completions.push({
        label: canonicalStem,
        insertText: `${canonicalStem}]]`,
        kind: CompletionItemKind.Reference,
        sortText: `1-${canonicalStem}`,
        detail: note.title ? `${note.title} • ${relativePath}` : relativePath,
      });

      if (note.aliases && note.aliases.length > 0) {
        for (const alias of note.aliases) {
          const trimmedAlias = alias.trim();
          if (!trimmedAlias) {
            continue;
          }
          completions.push({
            label: trimmedAlias,
            insertText: `${canonicalStem}|${trimmedAlias}]]`,
            kind: CompletionItemKind.Reference,
            sortText: `2-${trimmedAlias}`,
            detail: `→ ${titleOrStem} • ${relativePath}`,
          });
        }
      }
    }

    return completions;
  }

  async handleNoteFileRenamed(oldUri: Uri, newUri: Uri): Promise<void> {
    if (
      !this.isUriInsideNotesDirectory(oldUri) ||
      !this.isUriInsideNotesDirectory(newUri)
    ) {
      return;
    }

    const oldStem = path.basename(oldUri.fsPath).replace(/\.md$/i, '');
    const newStem = path.basename(newUri.fsPath).replace(/\.md$/i, '');
    if (oldStem === newStem) {
      return;
    }

    clearCache();

    const aliases = await this.notesService.getWikiLinkAliases(newUri);
    const semanticTargets = new Set(
      [oldStem, ...aliases]
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );

    const context: OperationContext = {};
    const uris =
      await this.notesService.discoverNoteFileUrisThroughContext(context);

    for (const uri of uris) {
      let text: string;
      try {
        text = await readFileContent(uri);
      } catch {
        continue;
      }

      let next = this.rewriteWikiLinkTargetsInMarkdown(
        text,
        semanticTargets,
        newStem,
      );

      if (uri.fsPath === newUri.fsPath) {
        next = this.mergeAliasIntoMarkdown(next, oldStem);
      }

      if (next !== text) {
        await workspace.fs.writeFile(uri, new TextEncoder().encode(next));
      }
    }

    clearCache();
  }

  private rewriteWikiLinkTargetsInMarkdown(
    markdown: string,
    semanticTargets: Set<string>,
    newTarget: string,
  ): string {
    if (semanticTargets.size === 0) {
      return markdown;
    }

    const lines = markdown.split(/\r?\n/);
    const rewritten = lines.map((line) => {
      const hits = findWikiLinksInLine(line).filter((hit) =>
        semanticTargets.has(hit.target),
      );

      if (hits.length === 0) {
        return line;
      }

      let next = line;
      for (const hit of hits.sort(
        (left, right) => right.targetStartCol - left.targetStartCol,
      )) {
        next =
          next.slice(0, hit.targetStartCol) +
          newTarget +
          next.slice(hit.targetEndCol);
      }

      return next;
    });

    return rewritten.join('\n');
  }

  private mergeAliasIntoMarkdown(markdown: string, alias: string): string {
    const trimmedAlias = alias.trim();
    if (!trimmedAlias) {
      return markdown;
    }

    try {
      const parsed = parseSupportedSemanticFrontmatter(markdown).data;
      const frontmatter = parsed?.frontmatter ?? {};
      const existing = Array.isArray(frontmatter.aliases)
        ? frontmatter.aliases.filter(
            (entry): entry is string =>
              typeof entry === 'string' && entry.trim().length > 0,
          )
        : [];

      if (existing.includes(trimmedAlias)) {
        return markdown;
      }

      const nextAliases = [...existing, trimmedAlias];
      const rawFrontmatterText = parsed?.rawFrontmatter?.text;

      if (typeof rawFrontmatterText === 'string') {
        const updatedFrontmatterText = upsertAliasesFrontmatterText(
          rawFrontmatterText,
          nextAliases,
        );
        const body = parsed?.body ?? '';
        return `---\n${updatedFrontmatterText}\n---\n${body}`;
      }

      const mergedFrontmatter = {
        ...frontmatter,
        aliases: nextAliases,
      };
      const body = parsed?.body ?? markdown;
      return composeSemanticMarkdown(mergedFrontmatter, body);
    } catch {
      return markdown;
    }
  }

  private getFullDocumentRange(document: TextDocument): Range {
    return document.validateRange(
      new Range(0, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    );
  }

  private isUriInsideNotesDirectory(candidate: Uri): boolean {
    const notesDir = this.notesService.getNotesDirectoryUri();
    if (!notesDir) {
      return false;
    }

    const rootPath = notesDir.fsPath;
    const filePath = candidate.fsPath;
    return (
      filePath === rootPath || filePath.startsWith(`${rootPath}${path.sep}`)
    );
  }

  /**
   * Formats a date for user-facing UI (locale-aware, includes time).
   * @private
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * If notes list is empty, prompts the user to create a new note.
   * Returns `true` if the list was empty (user was prompted), `false` otherwise.
   * @private
   */
  private async handleEmptyNotesAndMaybeCreate(
    notes: Note[],
  ): Promise<boolean> {
    if (notes.length > 0) {
      return false;
    }

    const yes = l10n.t('Yes');
    const no = l10n.t('No');
    const createNew = await window.showInformationMessage(
      l10n.t('No notes found. Create a new one?'),
      yes,
      no,
    );

    if (createNew === yes) {
      await this.createProjectNote();
    }

    return true;
  }

  /**
   * Converts a list of notes into QuickPick items with formatted labels, descriptions, and tag details.
   * @private
   */
  private toNoteQuickPickItems(
    notes: Note[],
  ): Array<QuickPickItem & { note: Note }> {
    const sortedNotes = [...notes].sort((leftNote, rightNote) => {
      const leftLabel =
        leftNote.title?.trim() ||
        path.basename(leftNote.filePath).replace(/\.md$/i, '');
      const rightLabel =
        rightNote.title?.trim() ||
        path.basename(rightNote.filePath).replace(/\.md$/i, '');
      return leftLabel.localeCompare(rightLabel, undefined, {
        sensitivity: 'base',
      });
    });

    return sortedNotes.map((note) => {
      const relativePath = workspace.asRelativePath(note.filePath, false);
      const label =
        note.title?.trim() ||
        path.basename(note.filePath).replace(/\.md$/i, '');
      const detail = this.composeNoteQuickPickDetail(note);

      return {
        label,
        description: relativePath,
        detail,
        note,
      };
    });
  }

  private composeNoteQuickPickDetail(note: Note): string | undefined {
    const summaryLine = this.formatSummary(note.summary);
    const aliasesLine = this.formatAliases(note.aliases);
    const tagsLine = this.formatTags(note.tags);
    const categoryLine = this.formatLabeledValue(note.category, (value) =>
      l10n.t('Category: {0}', value),
    );
    const projectLine = this.formatLabeledValue(note.project, (value) =>
      l10n.t('Project: {0}', value),
    );

    const detailLines: string[] = [];

    if (summaryLine) {
      detailLines.push(summaryLine);
    }

    const metadataLines = [
      aliasesLine,
      tagsLine,
      categoryLine,
      projectLine,
    ].filter((line): line is string => !!line);

    if (metadataLines.length > 0) {
      if (summaryLine) {
        detailLines.push('');
      }
      detailLines.push(...metadataLines);
    }

    if (detailLines.length === 0) {
      return undefined;
    }

    return detailLines.join('\n');
  }

  private formatSummary(summary?: string): string | undefined {
    if (!summary) {
      return undefined;
    }

    const normalized = summary
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(' ')
      .trim();

    return normalized.length > 0 ? normalized : undefined;
  }

  private formatAliases(aliases?: string[]): string | undefined {
    if (!aliases) {
      return undefined;
    }

    const normalizedAliases = aliases
      .map((alias) => alias.trim())
      .filter((alias) => alias.length > 0);

    if (normalizedAliases.length === 0) {
      return undefined;
    }

    return l10n.t('Aliases: {0}', normalizedAliases.join(', '));
  }

  private formatTags(tags?: string[]): string | undefined {
    if (!tags) {
      return undefined;
    }

    const normalizedTags = tags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));

    if (normalizedTags.length === 0) {
      return undefined;
    }

    return normalizedTags.join(' ');
  }

  private formatLabeledValue(
    rawValue: string | undefined,
    formatter: (value: string) => string,
  ): string | undefined {
    if (!rawValue) {
      return undefined;
    }

    const trimmedValue = rawValue.trim();
    if (trimmedValue.length === 0) {
      return undefined;
    }

    return formatter(trimmedValue);
  }
}
