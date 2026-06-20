import {
  CompletionItemProvider,
  DefinitionProvider,
  Disposable,
  DocumentSymbol,
  DocumentSymbolProvider,
  languages,
  ReferenceProvider,
  RenameProvider,
  SymbolKind,
  TextDocument,
} from 'vscode';

import { NotesController } from '../controllers';
import { findWikiLinksInLine } from '../helpers';

const MARKDOWN_SELECTOR = [
  { language: 'markdown' },
  { scheme: 'file', language: 'markdown' },
];

export class MarkdownWikiLinkNavigationProvider {
  constructor(private readonly notesController: NotesController) {}

  register(): Disposable[] {
    const definitionProvider: DefinitionProvider = {
      provideDefinition: (document, position) => {
        return this.notesController.resolveWikiLinkDefinition(
          document,
          position,
        );
      },
    };

    const symbolProvider: DocumentSymbolProvider = {
      provideDocumentSymbols: (document: TextDocument): DocumentSymbol[] => {
        const symbols: DocumentSymbol[] = [];

        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
          const lineText = document.lineAt(lineIndex).text;
          for (const hit of findWikiLinksInLine(lineText, lineIndex)) {
            const fullRange = hit.range;
            const displayName = hit.label
              ? `${hit.target} (${hit.label})`
              : hit.target;

            symbols.push(
              new DocumentSymbol(
                displayName,
                'wikilink',
                SymbolKind.Interface,
                fullRange,
                fullRange,
              ),
            );
          }
        }

        return symbols;
      },
    };

    const renameProvider: RenameProvider = {
      prepareRename: (document, position) =>
        this.notesController.prepareWikiLinkRename(document, position),

      provideRenameEdits: (document, position, newName) =>
        this.notesController.renameWikiLinkTarget(document, position, newName),
    };

    const referencesProvider: ReferenceProvider = {
      provideReferences: (document, position) =>
        this.notesController.resolveWikiLinkReferences(document, position) ??
        [],
    };

    const completionProvider: CompletionItemProvider = {
      provideCompletionItems: (document, position) =>
        this.notesController.provideWikiLinkCompletions(document, position) ??
        [],
    };

    return [
      languages.registerDefinitionProvider(
        MARKDOWN_SELECTOR,
        definitionProvider,
      ),
      languages.registerDocumentSymbolProvider(
        MARKDOWN_SELECTOR,
        symbolProvider,
      ),
      languages.registerRenameProvider(MARKDOWN_SELECTOR, renameProvider),
      languages.registerReferenceProvider(
        MARKDOWN_SELECTOR,
        referencesProvider,
      ),
      languages.registerCompletionItemProvider(
        MARKDOWN_SELECTOR,
        completionProvider,
        '[',
      ),
    ];
  }
}
