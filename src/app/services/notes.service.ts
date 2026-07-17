import path from 'path';
import { FileSystemError, Range, Uri, workspace } from 'vscode';

import type { Note } from '../../shared/types/note';
import { DEFAULT_NOTES_ROOT_SETTING, ExtensionConfig } from '../configs';
import {
  composeSemanticMarkdown,
  findFiles,
  findWikiLinksInLine,
  getWikiLinkCanonicalStem,
  getWorkspaceFolderUri,
  normalizeWikiLinkReference,
  parseSupportedSemanticFrontmatter,
  readFileContent,
} from '../helpers';
import type { OperationContext, WikiLinkReference } from '../types';

/**
 * Reads and writes project notes as Markdown files with YAML frontmatter under the configured notes folder.
 *
 * Uses the workspace filesystem as the only source of truth and resolves the notes directory from the selected workspace folder.
 *
 * No global caches or identity indexes – every operation performs the filesystem scans it needs.
 */
export class NotesService {
  /**
   * Initializes configuration only; filesystem access begins when a method is invoked.
   */
  constructor(readonly config: ExtensionConfig) {}

  /**
   * Surfaces IO/read failures at domain boundaries instead of returning empty success-shaped values.
   */
  private failReading(operationDescription: string, cause: unknown): never {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${operationDescription}: ${detail}`, {
      cause: cause instanceof Error ? cause : undefined,
    });
  }

  private get notesDir(): Uri | null {
    const rootFolderUri = getWorkspaceFolderUri(this.config);

    if (!rootFolderUri) {
      return null;
    }

    const resolvedNotesRoot = this.resolveNotesRootUri(
      rootFolderUri,
      this.config.notesRoot,
    );

    return resolvedNotesRoot;
  }

  getNotesDirectoryUri(): Uri | null {
    return this.notesDir;
  }

  /**
   * Returns all Markdown note URIs inside the configured notes directory (sorted, no caching).
   */
  async listNoteFileUris(): Promise<Uri[]> {
    if (!this.notesDir) {
      return [];
    }

    const files = await findFiles({
      baseDirectoryPath: this.notesDir.fsPath,
      baseDirectoryUri: this.notesDir,
      includeFilePatterns: ['**/*.md'],
      includeDotfiles: true,
    });

    return files.sort((fileUriA, fileUriB) =>
      fileUriA.fsPath.localeCompare(fileUriB.fsPath),
    );
  }

  /**
   * Discovers note URIs while reusing the same collection within a single operation context.
   * Prevents repeated filesystem scans during rename/reference flows.
   */
  async discoverNoteFileUrisThroughContext(
    context: OperationContext,
  ): Promise<Uri[]> {
    if (context.noteUris) {
      return context.noteUris;
    }

    const discovered = await this.listNoteFileUris();
    context.noteUris = discovered;
    return discovered;
  }

  /**
   * Returns every readable note under the configured folder (missing note files are skipped).
   *
   * @throws When note discovery fails or when reading/parsing fails for any discovered file that exists on disk.
   */
  async getAllNotes(): Promise<Note[]> {
    const noteUris = await this.listNoteFileUris();
    const notePromises = noteUris.map((uri) => this.readNote(uri));
    const notes = await Promise.all(notePromises);
    return notes.filter((note): note is Note => note !== null);
  }

  /**
   * Sorted absolute paths to `.md` note files under the notes folder.
   * Does not read file contents.
   */
  async listNoteFilePaths(): Promise<string[]> {
    const noteUris = await this.listNoteFileUris();
    return noteUris.map((uri) => uri.fsPath);
  }

  /**
   * Resolves wiki links `[[target]]`, `[[target|label]]`, and alias-only `[[Alias]]` against note files.
   *
   * Resolution order (deterministic, normalized equality):
   * 1. Basename `{target}.md` normalized via `normalizeWikiLinkReference`.
   * 2. Frontmatter `aliases:` normalized via the same helper (ambiguous duplicates yield `null`).
   *
   * The optional label never participates in resolution.
   */
  async resolveNoteReference(targetReference: string): Promise<Uri | null> {
    const trimmed = targetReference.trim();
    const normalizedInput = normalizeWikiLinkReference(trimmed);

    if (!trimmed || /[/\\]/.test(trimmed) || !normalizedInput) {
      return null;
    }

    try {
      const noteUris = await this.discoverNoteFileUrisThroughContext({});
      let basenameHit: {
        uri: Uri;
        canonicalStem: string;
      } | null = null;

      for (const uri of noteUris) {
        const canonicalStem = getWikiLinkCanonicalStem(uri.fsPath);
        const normalizedStem = normalizeWikiLinkReference(canonicalStem);

        if (normalizedStem !== normalizedInput) {
          continue;
        }

        if (basenameHit && basenameHit.uri.fsPath !== uri.fsPath) {
          return null;
        }

        basenameHit = {
          uri,
          canonicalStem,
        };
      }

      if (basenameHit) {
        await this.getNoteAliases(basenameHit.uri);
        return basenameHit.uri;
      }

      let aliasHit: {
        uri: Uri;
        canonicalStem: string;
        aliases: string[];
        matchedAlias: string;
      } | null = null;

      for (const uri of noteUris) {
        let markdown = '';
        try {
          markdown = await readFileContent(uri);
        } catch {
          continue;
        }

        const parsed = parseSupportedSemanticFrontmatter(markdown).data;
        const rawAliases = Array.isArray(parsed?.frontmatter.aliases)
          ? parsed.frontmatter.aliases
          : [];

        const aliasCandidates = rawAliases
          .filter((alias): alias is string => typeof alias === 'string')
          .map((alias) => alias.trim())
          .filter((alias) => alias.length > 0);

        const matchingAlias = aliasCandidates
          .map((alias) => ({
            raw: alias,
            normalized: normalizeWikiLinkReference(alias),
          }))
          .find((entry) => entry.normalized === normalizedInput);

        if (!matchingAlias) {
          continue;
        }

        if (aliasHit && aliasHit.uri.fsPath !== uri.fsPath) {
          return null;
        }

        aliasHit = {
          uri,
          canonicalStem: getWikiLinkCanonicalStem(uri.fsPath),
          aliases: aliasCandidates,
          matchedAlias: matchingAlias.raw,
        };
      }

      if (aliasHit) {
        return aliasHit.uri;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Returns the exact alias strings declared in the note frontmatter.
   */
  async getNoteAliases(noteUri: Uri): Promise<string[]> {
    try {
      const markdown = await readFileContent(noteUri);
      const parsed = parseSupportedSemanticFrontmatter(markdown).data;
      return parsed?.frontmatter.aliases ?? [];
    } catch {
      return [];
    }
  }

  /** Builds the exact and alias target strings used for reference matching. */
  buildSemanticReferenceTargets(
    canonicalStem: string,
    aliases: readonly string[],
  ): Set<string> {
    return new Set(
      [canonicalStem, ...aliases]
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );
  }

  /** Returns semantic targets for a note file path (stem + frontmatter aliases). */
  async getSemanticReferenceTargetsForFile(
    filePath: string,
  ): Promise<Set<string>> {
    const canonicalStem = getWikiLinkCanonicalStem(filePath);
    const aliases = await this.getNoteAliases(Uri.file(filePath));

    return this.buildSemanticReferenceTargets(canonicalStem, aliases);
  }

  /**
   * Returns true when a wikilink target refers to one of the semantic targets.
   *
   * Matches both exact strings and normalized slug equality, aligning with
   * {@link NotesService.resolveNoteReference}.
   */
  referenceTargetMatchesSemanticTargets(
    targetReference: string,
    semanticTargets: ReadonlySet<string> | readonly string[],
  ): boolean {
    const trimmed = targetReference.trim();

    if (!trimmed) {
      return false;
    }

    const targets =
      semanticTargets instanceof Set
        ? semanticTargets
        : new Set(semanticTargets);

    if (targets.has(trimmed)) {
      return true;
    }

    const normalizedHit = normalizeWikiLinkReference(trimmed);

    if (!normalizedHit) {
      return false;
    }

    for (const target of targets) {
      if (normalizeWikiLinkReference(target) === normalizedHit) {
        return true;
      }
    }

    return false;
  }

  /**
   * Reads markdown for wikilink scanning, preferring in-memory editor buffers.
   *
   * Aligns reference, navigation-adjacent, and Context View flows on the same
   * content source: open documents use their current buffer; otherwise disk.
   */
  async readMarkdownContentForReferences(
    filePath: string,
  ): Promise<string | null> {
    try {
      const document = await workspace.openTextDocument(Uri.file(filePath));

      return document.getText();
    } catch {
      return null;
    }
  }

  /**
   * Scans workspace notes for wikilinks that refer to the target note.
   */
  async findReferencesTo(
    targetFilePath: string,
    context: OperationContext = {},
    readNoteContent: (filePath: string) => Promise<string | null> = (
      filePath,
    ) => this.readMarkdownContentForReferences(filePath),
  ): Promise<WikiLinkReference[]> {
    const semanticTargets =
      await this.getSemanticReferenceTargetsForFile(targetFilePath);
    const noteUris = await this.discoverNoteFileUrisThroughContext(context);
    const references: WikiLinkReference[] = [];

    for (const uri of noteUris) {
      if (uri.fsPath === targetFilePath) {
        continue;
      }

      const content = await readNoteContent(uri.fsPath);

      if (content === null) {
        continue;
      }

      const lines = content.split(/\r?\n/);

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const hits = findWikiLinksInLine(lines[lineIndex], lineIndex);

        for (const hit of hits) {
          if (
            this.referenceTargetMatchesSemanticTargets(
              hit.target,
              semanticTargets,
            )
          ) {
            references.push({
              sourceFilePath: uri.fsPath,
              targetReference: hit.target,
              targetFilePath,
              range: hit.range as Range,
            });
          }
        }
      }
    }

    return references;
  }

  /**
   * Creates a new note file from a title, optional body, and optional tags. Returns `null` if there is no workspace or writing fails.
   */
  async createNote(
    title: string,
    content = '',
    tags: string[] = [],
  ): Promise<Note | null> {
    if (!this.notesDir) {
      return null;
    }

    const sanitizedStem = this.sanitizeFilename(title);
    const fileUri = Uri.joinPath(this.notesDir, `${sanitizedStem}.md`);

    const note: Note = {
      title,
      content,
      filePath: fileUri.fsPath,
      tags,
    };

    try {
      await workspace.fs.createDirectory(Uri.file(path.dirname(note.filePath)));
      const fileContent = composeSemanticMarkdown(
        {
          title: note.title,
          category: note.category,
          type: note.type,
          project: note.project,
          tags: note.tags,
          aliases: note.aliases,
          summary: note.summary,
        },
        note.content,
      );
      await workspace.fs.writeFile(
        Uri.file(note.filePath),
        new TextEncoder().encode(fileContent),
      );
      return note;
    } catch (error) {
      this.failReading('Failed to create note file', error);
    }
  }

  /**
   * Loads a single note from disk using the file URI. Returns `null` if the file is missing or unreadable.
   */
  async getNote(fileUri: Uri): Promise<Note | null> {
    return this.readNote(fileUri);
  }

  /**
   * Persists `note`. Returns `null` if the file does not exist.
   */
  async updateNote(note: Note): Promise<Note | null> {
    try {
      await workspace.fs.stat(Uri.file(note.filePath));
    } catch {
      return null;
    }

    const updatedNote: Note = {
      ...note,
    };

    try {
      await workspace.fs.createDirectory(
        Uri.file(path.dirname(updatedNote.filePath)),
      );
      const fileUri = Uri.file(updatedNote.filePath);
      const fileContent = composeSemanticMarkdown(
        {
          title: updatedNote.title,
          category: updatedNote.category,
          type: updatedNote.type,
          project: updatedNote.project,
          tags: updatedNote.tags,
          aliases: updatedNote.aliases,
          summary: updatedNote.summary,
        },
        updatedNote.content,
      );
      await workspace.fs.writeFile(
        fileUri,
        new TextEncoder().encode(fileContent),
      );
      return updatedNote;
    } catch (error) {
      this.failReading(`Failed to save note (${updatedNote.filePath})`, error);
    }
  }

  /**
   * Deletes a note file permanently (not sent to trash).
   *
   * @returns `false` when the file does not exist.
   * @throws When the file exists but deletion fails, or when presence cannot be verified for reasons other than not-found.
   */
  async deleteNote(filePath: string): Promise<boolean> {
    const fileUri = Uri.file(filePath);

    try {
      await workspace.fs.stat(fileUri);
    } catch (error) {
      if (error instanceof FileSystemError && error.code === 'FileNotFound') {
        return false;
      }
      throw new Error(`Cannot verify note exists before delete: ${filePath}`, {
        cause: error instanceof Error ? error : undefined,
      });
    }

    try {
      await workspace.fs.delete(fileUri, { useTrash: false });
      return true;
    } catch (error) {
      throw new Error(`Failed to delete note at ${filePath}`, {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Reads and parses a single note file from disk.
   * Returns `null` only when the path does not exist. Throws when the file exists but cannot be read or parsed into a note payload.
   * @private
   */
  private async readNote(fileUri: Uri): Promise<Note | null> {
    try {
      await workspace.fs.stat(fileUri);
    } catch {
      return null;
    }

    try {
      const content = await readFileContent(fileUri);

      const parsed = parseSupportedSemanticFrontmatter(content).data;
      const frontmatter = parsed?.frontmatter ?? {};
      const noteContent = parsed?.body ?? content.trim();

      const fileName = getWikiLinkCanonicalStem(fileUri.fsPath);

      return {
        title: frontmatter.title ?? fileName,
        content: noteContent,
        filePath: fileUri.fsPath,
        ...(frontmatter.tags !== undefined ? { tags: frontmatter.tags } : {}),
        ...(frontmatter.category !== undefined
          ? { category: frontmatter.category }
          : {}),
        ...(frontmatter.aliases !== undefined
          ? { aliases: frontmatter.aliases }
          : {}),
        ...(frontmatter.project !== undefined
          ? { project: frontmatter.project }
          : {}),
        ...(frontmatter.summary !== undefined
          ? { summary: frontmatter.summary }
          : {}),
      };
    } catch (error) {
      this.failReading(`Failed to read note (${fileUri.fsPath})`, error);
    }
  }

  /**
   * Converts a note title into a safe filesystem filename.
   * Removes special characters, lowercases, and normalizes spacing.
   * @private
   */
  private sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid chars with dash
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .replace(/-+/g, '-') // Remove duplicate dashes
      .toLowerCase(); // Convert to lowercase
  }

  /**
   * Resolves configured `notesRoot` against the selected workspace folder.
   *
   * Accepts absolute paths for advanced setups, but defaults to workspace-relative
   * behavior to keep semantic discovery bounded and deterministic.
   */
  private resolveNotesRootUri(workspaceRoot: Uri, configuredRoot: string): Uri {
    const trimmed = configuredRoot.trim();
    if (!trimmed) {
      const fallbackSegments = DEFAULT_NOTES_ROOT_SETTING.split('/');
      return Uri.joinPath(workspaceRoot, ...fallbackSegments);
    }

    const slashPath = trimmed.replace(/\\/g, '/');
    const isAbsolutePosix = slashPath.startsWith('/');
    const isAbsoluteWin = /^[a-zA-Z]:/.test(slashPath);
    if (isAbsolutePosix || isAbsoluteWin) {
      return Uri.file(trimmed);
    }

    const segments = slashPath.split('/').filter((segment) => segment !== '');
    return Uri.joinPath(workspaceRoot, ...segments);
  }
}
