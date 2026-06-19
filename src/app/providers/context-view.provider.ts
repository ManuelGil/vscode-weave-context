import {
  CancellationToken,
  Disposable,
  Uri,
  Webview,
  WebviewView,
  WebviewViewProvider,
  WebviewViewResolveContext,
} from 'vscode';

import { EXTENSION_ID } from '../configs';
import { getNonce } from '../helpers';
import { NotesService } from '../services';

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
  ) {}

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
            void this.updateNotes();
            break;

          case 'CHANGE_CONTEXT':
            void this.updateNotes();
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
    void this.updateNotes();
  }

  /**
   * Sends the current notes to the webview.
   */
  async updateNotes(): Promise<void> {
    try {
      const notes = await this._notesService.getAllNotes();
      this.postMessage({
        type: 'context:update',
        notes,
      });
    } catch (error) {
      console.error('ContextViewProvider.updateNotes:', error);
    }
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
