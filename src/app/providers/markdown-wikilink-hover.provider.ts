import {
  Disposable,
  Hover,
  HoverProvider,
  languages,
  MarkdownString,
  Position,
  TextDocument,
} from 'vscode';

import type { Note } from '../../shared/types/note';
import {
  buildMarkdownBlockquote,
  buildWikiLinkHoverContextLine,
  buildWikiLinkHoverPreview,
  escapeMarkdownText,
  parseWikiLinkAtPosition,
} from '../helpers';
import { NotesService } from '../services';
import type { ParsedWikiLink } from '../types';

const MARKDOWN_SELECTOR = [
  { language: 'markdown' },
  { scheme: 'file', language: 'markdown' },
];

const NOT_FOUND_MESSAGE = 'Note not found';

export class MarkdownWikiLinkHoverProvider {
  constructor(private readonly notesService: NotesService) {}

  register(): Disposable {
    const provider: HoverProvider = {
      provideHover: (document, position) =>
        this.provideWikiLinkHover(document, position),
    };

    return languages.registerHoverProvider(MARKDOWN_SELECTOR, provider);
  }

  private async provideWikiLinkHover(
    document: TextDocument,
    position: Position,
  ): Promise<Hover | undefined> {
    const wikiLink = parseWikiLinkAtPosition(document, position);

    if (!wikiLink) {
      return undefined;
    }

    try {
      const targetUri = await this.notesService.resolveMarkdownWikiLink(
        wikiLink.target,
      );

      if (!targetUri) {
        return this.buildNotFoundHover(wikiLink);
      }

      const note = await this.notesService.getNote(targetUri);

      if (!note) {
        return this.buildNotFoundHover(wikiLink);
      }

      const markdown = this.buildNoteHoverMarkdown(note);
      return new Hover(markdown, wikiLink.range);
    } catch {
      return this.buildNotFoundHover(wikiLink);
    }
  }

  private buildNotFoundHover(match: ParsedWikiLink): Hover {
    const markdown = new MarkdownString();
    markdown.appendText(NOT_FOUND_MESSAGE);
    return new Hover(markdown, match.range);
  }

  private buildNoteHoverMarkdown(note: Note): MarkdownString {
    const markdown = new MarkdownString();
    const title = note.title?.trim() || 'Untitled note';
    markdown.appendMarkdown(`# ${escapeMarkdownText(title)}`);

    const contextLine = buildWikiLinkHoverContextLine(
      note.category,
      note.project,
    );

    if (contextLine.length > 0) {
      markdown.appendMarkdown(`\n\n_${escapeMarkdownText(contextLine)}_`);
    }

    const preview = buildWikiLinkHoverPreview(note.summary, note.content ?? '');
    const blockquote = buildMarkdownBlockquote(preview);

    if (blockquote.length > 0) {
      markdown.appendMarkdown(`\n\n${blockquote}`);
    }

    return markdown;
  }
}
