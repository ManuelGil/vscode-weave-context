import path from 'path';

import {
  CancellationToken,
  Disposable,
  TextDocument,
  Uri,
  Webview,
  WebviewView,
  WebviewViewProvider,
  WebviewViewResolveContext,
  window,
  workspace,
} from 'vscode';

import type {
  ContextEdge,
  ContextNode,
  ContextProjection,
} from '../../shared/types/context-projection';
import { EXTENSION_ID } from '../configs';
import {
  debounce,
  findWikiLinksInLine,
  getNonce,
  getWikiLinkCanonicalStem,
} from '../helpers';
import { NotesService } from '../services';
import type { OperationContext } from '../types';

const LOCAL_CONTEXT_DEPTH = 2;
const TEXT_CHANGE_DEBOUNCE_MS = 300;

type UpdateReason =
  | 'active-editor-change'
  | 'editor-closed'
  | 'context-ready'
  | 'workspace-change'
  | 'text-document-change'
  | 'unknown';

/**
 * The ContextViewProvider class.
 *
 * @class
 * @classdesc The class that represents the context view provider.
 * @export
 * @public
 * @implements {WebviewViewProvider}
 * @property {string} static viewType - The view type
 * @property {WebviewView} [_view] - The view
 * @property {OpenAIService} [openAISservice] - The OpenAI service
 * @example
 * const provider = new ContextViewProvider(extensionUri);
 */
export class ContextViewProvider implements WebviewViewProvider, Disposable {
  // -----------------------------------------------------------------
  // Static
  // -----------------------------------------------------------------

  // Public properties
  /**
   * The view type.
   *
   * @public
   * @static
   * @memberof ContextViewProvider
   * @type {string}
   */
  static readonly viewType = `${EXTENSION_ID}.contextView`;

  // -----------------------------------------------------------------
  // Properties
  // -----------------------------------------------------------------

  // Private properties
  /**
   * The view.
   *
   * @private
   * @memberof ContextViewProvider
   * @type {WebviewView}
   */
  private _view?: WebviewView;

  /**
   * The disposables.
   *
   * @private
   * @memberof ContextViewProvider
   * @type {Disposable[]}
   */
  private readonly _disposables: Disposable[] = [];

  /**
   * Indicates whether the provider is disposed.
   *
   * @private
   * @memberof ContextViewProvider
   * @type {boolean}
   */
  private _isDisposed = false;

  /**
   * Monotonic counter so only the latest in-flight updateNotes() may publish.
   */
  private _updateGeneration = 0;

  // -----------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------

  /**
   * Constructor for the ContextViewProvider class.
   *
   * @constructor
   * @param {Uri} _extensionUri - The extension URI
   * @public
   * @memberof ContextViewProvider
   */
  constructor(
    private readonly _extensionUri: Uri,
    private readonly _notesService: NotesService,
  ) {
    const editorChangeDisposable = window.onDidChangeActiveTextEditor(
      (editor) => {
        const reason: UpdateReason = editor
          ? 'active-editor-change'
          : 'editor-closed';
        void this.updateNotes(reason);
      },
    );

    const scheduleProjectionUpdate = debounce(() => {
      void this.updateNotes('text-document-change');
    }, TEXT_CHANGE_DEBOUNCE_MS);

    const textChangeDisposable = workspace.onDidChangeTextDocument((event) => {
      if (!this._isRelevantMarkdownDocument(event.document)) {
        return;
      }

      scheduleProjectionUpdate();
    });

    this._disposables.push(editorChangeDisposable, textChangeDisposable);
  }

  // -----------------------------------------------------------------
  // Methods
  // -----------------------------------------------------------------

  // Public methods
  /**
   * The resolveWebviewView method.
   *
   * @function resolveWebviewView
   * @param {WebviewView} webviewView - The webview view
   * @param {WebviewViewResolveContext} context - The webview view resolve context
   * @param {CancellationToken} _token - The cancellation token
   * @public
   * @memberof ContextViewProvider
   * @example
   * provider.resolveWebviewView(webviewView, context, _token);
   *
   * @returns {void} - No return value
   */
  resolveWebviewView(
    webviewView: WebviewView,
    _: WebviewViewResolveContext,
    _token: CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [Uri.joinPath(this._extensionUri, 'dist')],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    const messageDisposable = webviewView.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'context:ready':
            void this.updateNotes('context-ready');
            break;

          default:
            console.warn('Unknown message:', message);
        }
      },
    );

    this._disposables.push(messageDisposable);
  }

  /**
   * Sends a message to the Vue application.
   */
  postMessage(message: unknown): void {
    this._view?.webview.postMessage(message);
  }

  /**
   * Reloads notes from the workspace and pushes them to the webview.
   */
  refresh(): void {
    void this.updateNotes('workspace-change');
  }

  /**
   * Sends the current contextual projection centered on the active note.
   */
  async updateNotes(reason: UpdateReason = 'unknown'): Promise<void> {
    const generation = ++this._updateGeneration;

    try {
      const projection = await this.buildContextualProjection();

      if (generation !== this._updateGeneration) {
        return;
      }

      if (this._shouldSuppressProjection(reason, projection)) {
        return;
      }

      this.postMessage({
        type: 'context:update',
        projection,
      });
    } catch (error) {
      console.error('ContextViewProvider.updateNotes:', error);

      const fallbackProjection = this._buildFocusFallbackProjection();

      if (!fallbackProjection || generation !== this._updateGeneration) {
        return;
      }

      this.postMessage({
        type: 'context:update',
        projection: fallbackProjection,
      });
    }
  }

  /**
   * Returns true when VS Code temporarily reports no active editor during an
   * editor transition and the resulting projection is completely empty.
   *
   * We only suppress the specific editor-closed transient because runtime logs
   * show VS Code emits:
   *
   *   editor-closed -> empty projection
   *   active-editor-change -> populated projection
   *
   * during normal note switches.
   */
  private _shouldSuppressProjection(
    reason: UpdateReason,
    projection: ContextProjection,
  ): boolean {
    return (
      reason === 'editor-closed' &&
      projection.nodes.length === 0 &&
      projection.edges.length === 0
    );
  }

  /**
   * Builds a contextual subgraph centered on the active note.
   *
   * Uses the active editor file path directly so any note that can appear as a
   * secondary node in another projection can also be used as focus.
   */
  private async buildContextualProjection(): Promise<ContextProjection> {
    const activeEditor = window.activeTextEditor;

    if (!activeEditor) {
      return {
        nodes: [],
        edges: [],
      };
    }

    const focusFilePath = activeEditor.document.uri.fsPath;

    return this.buildContextProjection(focusFilePath);
  }

  /**
   * Builds the local wikilink subgraph within {@link LOCAL_CONTEXT_DEPTH} hops of focus.
   *
   * Explores outgoing and incoming links symmetrically via BFS on the extension host.
   */
  private async buildContextProjection(
    focusFilePath: string,
  ): Promise<ContextProjection> {
    const focusFallbackTitle = getWikiLinkCanonicalStem(focusFilePath);
    const focusContent =
      await this._notesService.readMarkdownContentForReferences(focusFilePath);

    if (focusContent === null) {
      return {
        nodes: [
          {
            filePath: focusFilePath,
            title: focusFallbackTitle || 'Unknown',
            role: 'focus',
          },
        ],
        edges: [],
      };
    }

    const operationContext: OperationContext = {};
    const seenEdgeKeys = new Set<string>();
    const allEdges: ContextEdge[] = [];
    const visited = new Set<string>([focusFilePath]);
    const directBacklinks = new Set<string>();

    const edgeKey = (edge: ContextEdge): string => {
      return `${edge.sourceFilePath}\0${edge.targetReference}\0${edge.targetFilePath ?? ''}`;
    };

    const addEdge = (edge: ContextEdge): void => {
      const key = edgeKey(edge);

      if (seenEdgeKeys.has(key)) {
        return;
      }

      seenEdgeKeys.add(key);
      allEdges.push(edge);
    };

    const resolveTargetFilePath = async (
      targetReference: string,
    ): Promise<string | null> => {
      const targetUri =
        await this._notesService.resolveNoteReference(targetReference);

      return targetUri?.fsPath ?? null;
    };

    const collectOutgoingWikiLinksFromContent = async (
      sourceFilePath: string,
      content: string,
    ): Promise<ContextEdge[]> => {
      const edges: ContextEdge[] = [];

      for (const line of content.split(/\r?\n/)) {
        for (const hit of findWikiLinksInLine(line)) {
          const targetFilePath = await resolveTargetFilePath(hit.target);
          const edge: ContextEdge = {
            sourceFilePath,
            targetReference: hit.target,
          };

          if (targetFilePath) {
            edge.targetFilePath = targetFilePath;
          }

          edges.push(edge);
        }
      }

      return edges;
    };

    const findBacklinks = async (
      targetPath: string,
    ): Promise<ContextEdge[]> => {
      const references = await this._notesService.findReferencesTo(
        targetPath,
        operationContext,
      );

      return references.map((reference) => ({
        sourceFilePath: reference.sourceFilePath,
        targetReference: reference.targetReference,
        targetFilePath: reference.targetFilePath,
      }));
    };

    const noteContentCache = new Map<string, string>([
      [focusFilePath, focusContent],
    ]);

    const readNoteContent = async (
      filePath: string,
    ): Promise<string | null> => {
      const cached = noteContentCache.get(filePath);

      if (cached !== undefined) {
        return cached;
      }

      const content =
        await this._notesService.readMarkdownContentForReferences(filePath);

      if (content === null) {
        return null;
      }

      noteContentCache.set(filePath, content);

      return content;
    };

    const queue: Array<{ filePath: string; depth: number }> = [
      { filePath: focusFilePath, depth: 0 },
    ];

    while (queue.length > 0) {
      const { filePath: nodePath, depth } = queue.shift()!;

      if (depth > LOCAL_CONTEXT_DEPTH) {
        continue;
      }

      const content = await readNoteContent(nodePath);

      if (content === null) {
        continue;
      }

      const outgoing = await collectOutgoingWikiLinksFromContent(
        nodePath,
        content,
      );

      for (const edge of outgoing) {
        addEdge(edge);

        if (!edge.targetFilePath) {
          continue;
        }

        const nextDepth = depth + 1;

        if (
          nextDepth > LOCAL_CONTEXT_DEPTH ||
          visited.has(edge.targetFilePath)
        ) {
          continue;
        }

        visited.add(edge.targetFilePath);
        queue.push({ filePath: edge.targetFilePath, depth: nextDepth });
      }

      const backlinks = await findBacklinks(nodePath);

      for (const edge of backlinks) {
        addEdge(edge);

        const sourcePath = edge.sourceFilePath;

        if (nodePath === focusFilePath) {
          directBacklinks.add(sourcePath);
        }

        const nextDepth = depth + 1;

        if (nextDepth > LOCAL_CONTEXT_DEPTH || visited.has(sourcePath)) {
          continue;
        }

        visited.add(sourcePath);
        queue.push({ filePath: sourcePath, depth: nextDepth });
      }
    }

    const nodes: ContextNode[] = [];

    for (const filePath of visited) {
      const note = await this._notesService.getNote(Uri.file(filePath));

      if (!note) {
        nodes.push({
          filePath,
          title: getWikiLinkCanonicalStem(filePath) || focusFallbackTitle,
          role: filePath === focusFilePath ? 'focus' : 'outgoing',
        });
        continue;
      }

      let role: ContextNode['role'];

      if (filePath === focusFilePath) {
        role = 'focus';
      } else if (directBacklinks.has(filePath)) {
        role = 'backlink';
      } else {
        role = 'outgoing';
      }

      nodes.push({
        filePath: note.filePath,
        title: note.title,
        role,
      });
    }

    return { nodes, edges: allEdges };
  }

  private _buildFocusFallbackProjection(): ContextProjection | null {
    const activeEditor = window.activeTextEditor;

    if (!activeEditor) {
      return null;
    }

    const focusFilePath = activeEditor.document.uri.fsPath;
    const focusFallbackTitle = getWikiLinkCanonicalStem(focusFilePath);

    return {
      nodes: [
        {
          filePath: focusFilePath,
          title: focusFallbackTitle || 'Unknown',
          role: 'focus',
        },
      ],
      edges: [],
    };
  }

  private _isRelevantMarkdownDocument(document: TextDocument): boolean {
    if (document.uri.scheme !== 'file' || document.languageId !== 'markdown') {
      return false;
    }

    const notesDir = this._notesService.getNotesDirectoryUri();

    if (!notesDir) {
      return false;
    }

    const rootPath = notesDir.fsPath;
    const filePath = document.uri.fsPath;

    return (
      filePath === rootPath || filePath.startsWith(`${rootPath}${path.sep}`)
    );
  }

  /**
   * Clears graph content.
   */
  clear(): void {
    this.postMessage({
      type: 'graph:clear',
    });
  }

  /**
   * Focuses the view.
   */
  reveal(): void {
    this._view?.show?.(true);
  }

  /**
   * Dispose method to clean up resources.
   *
   * @public
   * @memberof ContextViewProvider
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }

    for (const disposable of this._disposables) {
      try {
        disposable.dispose();
      } catch (error) {
        console.error('Error disposing resource:', error);
      }
    }

    this._view = undefined;
    this._isDisposed = true;
  }

  // Private methods
  /**
   * The _getHtmlForWebview method.
   *
   * @function _getHtmlForWebview
   * @param {Webview} webview - The webview
   * @private
   * @memberof ContextViewProvider
   * @example
   * const html = provider._getHtmlForWebview(webview);
   *
   * @returns {string} - The HTML for the webview
   */
  private _getHtmlForWebview(webview: Webview): string {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const scriptUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, './dist', 'main.js'),
    );

    // Do the same for the stylesheet.
    const stylesMainUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, './dist', 'main.css'),
    );

    // Base URI for resolving relative paths (e.g., workers) to the dist/ folder
    const baseUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, './dist'),
    );

    // Resolve the context.worker script within the built assets folder using a stable name
    const workerUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, './dist', 'context.worker.js'),
    );

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return /* html */ `
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />

  <!--
    Use a content security policy to only allow loading styles from our extension directory,
    and only allow scripts that have a specific nonce.
    (See the 'webview-sample' extension sample for img-src content security policy examples)
  -->
  <meta
    http-equiv="Content-Security-Policy"
    content="
      default-src 'none';
      img-src ${webview.cspSource} https: data:;
      font-src ${webview.cspSource};
      style-src ${webview.cspSource} 'unsafe-inline';
      script-src 'nonce-${nonce}' ${webview.cspSource};
      worker-src blob: ${webview.cspSource};
      connect-src ${webview.cspSource};
      frame-ancestors 'none';
      form-action 'none';
      base-uri ${webview.cspSource};
      manifest-src 'none';
    "
  />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <base href="${baseUri}/" />

  <link
    rel="stylesheet"
    href="${stylesMainUri}"
  />

  <title>Context View</title>
</head>

<body>
  <div id="app"></div>

  <script nonce="${nonce}">
    // Make the worker URL available to the webview JS (read-only exposure)
    window.ContextWorkerUri = ${JSON.stringify(workerUri.toString())};
  </script>

  <script
    nonce="${nonce}"
    src="${scriptUri}"
  ></script>

  <script nonce="${nonce}">
    window.addEventListener(
      'contextmenu',
      (event) => {
        event.preventDefault();
      },
      { capture: true }
    );
  </script>
</body>

</html>
`;
  }
}
