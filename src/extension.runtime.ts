import {
  commands,
  ExtensionContext,
  env,
  l10n,
  MessageItem,
  RelativePattern,
  Uri,
  WorkspaceFolder,
  window,
  workspace,
} from 'vscode';
import { VSCodeMarketplaceClient } from 'vscode-marketplace-client';

import {
  CommandIds,
  ContextKeys,
  EXTENSION_DISPLAY_NAME,
  EXTENSION_ID,
  EXTENSION_NAME,
  EXTENSION_REPOSITORY_URL,
  ExtensionConfig,
  USER_PUBLISHER,
  ViewIds,
} from './app/configs';
import { FeedbackController, NotesController } from './app/controllers';
import {
  clearCache,
  listWorkspaceFolders,
  showNoWorkspaceFolderError,
} from './app/helpers';
import {
  ContextViewProvider,
  FeedbackProvider,
  MarkdownWikiLinkHoverProvider,
  MarkdownWikiLinkNavigationProvider,
  NoteRenameWatcherProvider,
  NotesTreeProvider,
} from './app/providers';
import { NotesService } from './app/services';

export class ExtensionRuntime {
  /**
   * Avoids repeated disabled-state notifications across command invocations.
   */
  private hasDisabledWarningBeenShown = false;

  /**
   * Current workspace-scoped extension configuration.
   */
  private config!: ExtensionConfig;

  private readonly providers: Array<{ refresh: () => void }> = [];

  private notesService: NotesService | undefined;
  private notesController: NotesController | undefined;
  private notesTreeProvider: NotesTreeProvider | undefined;
  private graphProvider: ContextViewProvider | undefined;

  constructor(public readonly context: ExtensionContext) {}

  async initialize(): Promise<boolean> {
    const workspaceFolder = await this.selectWorkspaceFolder();

    if (!workspaceFolder) {
      return false;
    }

    this.initializeConfiguration(workspaceFolder);

    if (!this.isExtensionEnabled()) {
      return false;
    }

    this.startVersionChecks();

    return true;
  }

  async start(): Promise<void> {
    this.registerWorkspaceCommands();
    this.registerNoteCommands();
    this.registerNavigationProviders();
    this.registerWikiLinkNoteRenameWatcher();
    this.registerTreeViews();
    this.registerFileWatchers();
    this.registerGraphView();
    this.registerFeedbackCommands();
  }

  /**
   * Runs non-blocking version checks after startup.
   */
  private startVersionChecks(): void {
    void this.handleLocalVersionNotifications();
    void this.checkMarketplaceVersion();
  }

  /**
   * Returns the extension version declared in package metadata.
   */
  private getCurrentVersion(): string {
    return this.context.extension.packageJSON?.version ?? '0.0.0';
  }

  /**
   * Handles first-run and local update notifications.
   */
  private async handleLocalVersionNotifications(): Promise<void> {
    const previousVersion = this.context.globalState.get<string>(
      ContextKeys.Version,
    );

    const currentVersion = this.getCurrentVersion();

    if (!previousVersion) {
      const welcomeMessage = l10n.t(
        'Welcome to {0} version {1}! The extension is now active',
        EXTENSION_DISPLAY_NAME,
        currentVersion,
      );

      window.showInformationMessage(welcomeMessage);

      await this.context.globalState.update(
        ContextKeys.Version,
        currentVersion,
      );

      return;
    }

    if (previousVersion !== currentVersion) {
      const actionReleaseNotes: MessageItem = {
        title: l10n.t('Release Notes'),
      };
      const actionDismiss: MessageItem = { title: l10n.t('Dismiss') };
      const availableActions = [actionReleaseNotes, actionDismiss];

      const updateMessage = l10n.t(
        "The {0} extension has been updated. Check out what's new in version {1}",
        EXTENSION_DISPLAY_NAME,
        currentVersion,
      );

      const userSelection = await window.showInformationMessage(
        updateMessage,
        ...availableActions,
      );

      if (userSelection?.title === actionReleaseNotes.title) {
        const changelogUrl = `${EXTENSION_REPOSITORY_URL}/blob/main/CHANGELOG.md`;
        env.openExternal(Uri.parse(changelogUrl));
      }

      await this.context.globalState.update(
        ContextKeys.Version,
        currentVersion,
      );
    }
  }

  /**
   * Checks Marketplace for a newer published extension version.
   */
  private async checkMarketplaceVersion(): Promise<void> {
    const currentVersion = this.getCurrentVersion();

    try {
      const latestVersion = await VSCodeMarketplaceClient.getLatestVersion(
        USER_PUBLISHER,
        EXTENSION_NAME,
      );

      if (latestVersion === currentVersion) {
        return;
      }

      const actionUpdateNow: MessageItem = { title: l10n.t('Update Now') };
      const actionDismiss: MessageItem = { title: l10n.t('Dismiss') };
      const availableActions = [actionUpdateNow, actionDismiss];

      const updateMessage = l10n.t(
        'A new version of {0} is available. Update to version {1} now',
        EXTENSION_DISPLAY_NAME,
        latestVersion,
      );

      const userSelection = await window.showInformationMessage(
        updateMessage,
        ...availableActions,
      );

      if (userSelection?.title === actionUpdateNow.title) {
        await commands.executeCommand(
          'workbench.extensions.action.install.anotherVersion',
          `${USER_PUBLISHER}.${EXTENSION_NAME}`,
        );
      }
    } catch (error) {
      console.error('Error retrieving extension version:', error);
    }
  }

  /**
   * Selects the workspace folder that scopes configuration and generation.
   */
  private async selectWorkspaceFolder(): Promise<WorkspaceFolder | undefined> {
    const availableWorkspaceFolders = listWorkspaceFolders();

    if (availableWorkspaceFolders.length === 0) {
      showNoWorkspaceFolderError(EXTENSION_DISPLAY_NAME);

      return undefined;
    }

    const previousFolderUriString = this.context.globalState.get<string>(
      ContextKeys.SelectedWorkspaceFolder,
    );
    let previousFolder: WorkspaceFolder | undefined;

    if (previousFolderUriString) {
      previousFolder = availableWorkspaceFolders.find(
        (folder) => folder.uri.toString() === previousFolderUriString,
      );
    }

    if (availableWorkspaceFolders.length === 1) {
      return availableWorkspaceFolders.at(0);
    }

    if (previousFolder) {
      window.showInformationMessage(
        l10n.t('Using workspace folder: {0}', previousFolder.name),
      );

      return previousFolder;
    }

    const pickerPlaceholder = l10n.t(
      '{0}: Select a workspace folder to use. This folder will be used to load workspace-specific configuration for the extension',
      EXTENSION_DISPLAY_NAME,
    );
    const selectedFolder = await window.showWorkspaceFolderPick({
      placeHolder: pickerPlaceholder,
    });

    if (selectedFolder) {
      this.context.globalState.update(
        ContextKeys.SelectedWorkspaceFolder,
        selectedFolder.uri.toString(),
      );
    }

    return selectedFolder;
  }

  /**
   * Initializes workspace configuration and registers configuration listeners.
   *
   * @param selectedWorkspaceFolder - The workspace folder used to load the configuration.
   */
  private initializeConfiguration(
    selectedWorkspaceFolder: WorkspaceFolder,
  ): void {
    this.config = new ExtensionConfig(
      workspace.getConfiguration(EXTENSION_ID, selectedWorkspaceFolder.uri),
    );

    this.config.workspaceSelection = selectedWorkspaceFolder.uri.fsPath;

    workspace.onDidChangeConfiguration((configurationChangeEvent) => {
      const updatedWorkspaceConfig = workspace.getConfiguration(
        EXTENSION_ID,
        selectedWorkspaceFolder.uri,
      );

      if (
        configurationChangeEvent.affectsConfiguration(
          `${EXTENSION_ID}.enable`,
          selectedWorkspaceFolder.uri,
        )
      ) {
        const isExtensionEnabled =
          updatedWorkspaceConfig.get<boolean>('enable');

        this.config.update(updatedWorkspaceConfig);

        if (isExtensionEnabled) {
          const enabledMessage = l10n.t(
            'The {0} extension is now enabled and ready to use',
            EXTENSION_DISPLAY_NAME,
          );
          window.showInformationMessage(enabledMessage);
        } else {
          const disabledMessage = l10n.t(
            'The {0} extension is now disabled',
            EXTENSION_DISPLAY_NAME,
          );
          window.showInformationMessage(disabledMessage);
        }
      }

      if (
        configurationChangeEvent.affectsConfiguration(
          EXTENSION_ID,
          selectedWorkspaceFolder.uri,
        )
      ) {
        this.config.update(updatedWorkspaceConfig);
      }
    });
  }

  /**
   * Returns whether commands should execute under current configuration.
   *
   * @remarks
   * Shows a disabled warning once until the extension is re-enabled.
   */
  private isExtensionEnabled(): boolean {
    const isEnabled = this.config.enable;

    if (isEnabled) {
      this.hasDisabledWarningBeenShown = false;
      return true;
    }

    if (!this.hasDisabledWarningBeenShown) {
      window.showErrorMessage(
        l10n.t(
          'The {0} extension is disabled in settings. Enable it to use its features',
          EXTENSION_DISPLAY_NAME,
        ),
      );
      this.hasDisabledWarningBeenShown = true;
    }

    return false;
  }

  /**
   * Registers workspace selection command for multi-root workspaces.
   */
  private registerWorkspaceCommands(): void {
    const disposableChangeWorkspace = commands.registerCommand(
      `${EXTENSION_ID}.${CommandIds.ChangeWorkspace}`,
      async () => {
        const pickerPlaceholder = l10n.t('Select a workspace folder to use');
        const selectedFolder = await window.showWorkspaceFolderPick({
          placeHolder: pickerPlaceholder,
        });

        if (selectedFolder) {
          this.context.globalState.update(
            ContextKeys.SelectedWorkspaceFolder,
            selectedFolder.uri.toString(),
          );

          const updatedWorkspaceConfig = workspace.getConfiguration(
            EXTENSION_ID,
            selectedFolder.uri,
          );
          this.config.update(updatedWorkspaceConfig);

          this.config.workspaceSelection = selectedFolder.uri.fsPath;

          window.showInformationMessage(
            l10n.t('Switched to workspace folder: {0}', selectedFolder.name),
          );
        }
      },
    );

    this.context.subscriptions.push(disposableChangeWorkspace);
  }

  /**
   * Registers note-related commands and the notes explorer tree view.
   */
  private registerNoteCommands(): void {
    this.notesService = new NotesService(this.config);
    this.notesController = new NotesController(this.config, this.notesService);

    const withEnabledGuard = <TArgs extends unknown[]>(
      callback: (...args: TArgs) => Promise<void> | void,
    ) => {
      return (...args: TArgs) => {
        if (!this.isExtensionEnabled()) {
          return;
        }
        return callback(...args);
      };
    };

    const noteCommands = [
      {
        id: CommandIds.CreateProjectNote,
        handler: withEnabledGuard(() =>
          this.notesController?.createProjectNote(),
        ),
      },
      {
        id: CommandIds.OpenProjectNote,
        handler: withEnabledGuard(() =>
          this.notesController?.openProjectNote(),
        ),
      },
      {
        id: CommandIds.InsertNoteLink,
        handler: withEnabledGuard(() => this.notesController?.insertNoteLink()),
      },
    ];

    noteCommands.forEach(({ id, handler }) => {
      const disposable = commands.registerCommand(
        `${EXTENSION_ID}.${id}`,
        handler,
      );

      this.context.subscriptions.push(disposable);
    });
  }

  private registerNavigationProviders(): void {
    if (!this.notesController || !this.notesService) {
      return;
    }

    const provider = new MarkdownWikiLinkNavigationProvider(
      this.notesController,
    );
    const hoverProvider = new MarkdownWikiLinkHoverProvider(this.notesService);
    const disposables = provider.register();
    const hoverDisposable = hoverProvider.register();
    this.context.subscriptions.push(...disposables, hoverDisposable);
  }

  private registerWikiLinkNoteRenameWatcher(): void {
    if (!this.notesController) {
      return;
    }

    const watcher = new NoteRenameWatcherProvider(this.notesController);
    this.context.subscriptions.push(watcher.register());
  }

  /**
   * Creates sidebar tree views (files, modules, entities, DTOs, methods) and their refresh commands.
   */
  private registerTreeViews(): void {
    if (!this.notesService) {
      return;
    }

    this.notesTreeProvider = new NotesTreeProvider(this.notesService);
    this.notesTreeProvider.startWatching();

    const notesTreeView = window.createTreeView(
      `${EXTENSION_ID}.${ViewIds.NotesExplorer}`,
      {
        treeDataProvider: this.notesTreeProvider,
        showCollapseAll: true,
      },
    );

    this.context.subscriptions.push(notesTreeView, {
      dispose: () => this.notesTreeProvider?.dispose(),
    });

    const disposableRefreshList = commands.registerCommand(
      `${EXTENSION_ID}.${CommandIds.RefreshNotesExplorer}`,
      async () => {
        if (!this.isExtensionEnabled()) {
          return;
        }

        await this.notesTreeProvider?.refresh();
      },
    );

    this.context.subscriptions.push(disposableRefreshList);

    const disposableSwitchProjection = commands.registerCommand(
      `${EXTENSION_ID}.${CommandIds.SwitchTreeProjection}`,
      async () => {
        if (!this.isExtensionEnabled() || !this.notesTreeProvider) {
          return;
        }

        await this.notesTreeProvider.pickProjection();
      },
    );

    this.context.subscriptions.push(disposableSwitchProjection);

    const refreshAllProviders = () => {
      this.notesTreeProvider?.refresh();
    };

    const disposableCreateFiles =
      workspace.onDidCreateFiles(refreshAllProviders);
    const disposableDeleteFiles =
      workspace.onDidDeleteFiles(refreshAllProviders);
    const disposableRenameFiles =
      workspace.onDidRenameFiles(refreshAllProviders);

    if (this.notesTreeProvider) {
      this.providers.push(this.notesTreeProvider);
    }

    this.context.subscriptions.push(
      disposableCreateFiles,
      disposableDeleteFiles,
      disposableRenameFiles,
    );
  }

  /**
   * Watches note-related filesystem events and refreshes all registered providers.
   */
  private registerFileWatchers(): void {
    if (!this.notesService) {
      return;
    }

    /**
     * Debounced refresh to avoid excessive UI updates
     * when multiple filesystem events fire together.
     */
    let refreshTimeout: NodeJS.Timeout | undefined;

    const scheduleRefresh = () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      refreshTimeout = setTimeout(() => {
        this.providers.forEach((provider) => provider.refresh());
      }, 150);
    };

    const notesDir = this.notesService.getNotesDirectoryUri();

    if (!notesDir) {
      return;
    }

    /**
     * Watch only markdown files inside the notes directory.
     */
    const watcher = workspace.createFileSystemWatcher(
      new RelativePattern(notesDir, '**/*.md'),
    );

    /**
     * Refresh providers when notes change.
     */
    watcher.onDidCreate(() => {
      clearCache();
      scheduleRefresh();
    });

    watcher.onDidDelete(() => {
      clearCache();
      scheduleRefresh();
    });

    watcher.onDidChange(() => {
      clearCache();
      scheduleRefresh();
    });

    // Register disposables for automatic cleanup.
    this.context.subscriptions.push(watcher);
  }

  /**
   * Registers the ContextViewProvider to provide the graph view in the extension.
   * The provider is responsible for rendering the webview and handling communication with it.
   */
  private registerGraphView(): void {
    if (!this.notesService) {
      return;
    }

    this.graphProvider = new ContextViewProvider(
      this.context.extensionUri,
      this.notesService,
    );

    const disposableGraphView = window.registerWebviewViewProvider(
      ContextViewProvider.viewType,
      this.graphProvider,
    );

    this.providers.push(this.graphProvider);
    this.context.subscriptions.push(this.graphProvider, disposableGraphView);
  }

  /**
   * Registers the feedback tree view and its action commands (about, report, rate, support).
   */
  private registerFeedbackCommands(): void {
    const feedbackProvider = new FeedbackProvider(new FeedbackController());

    const disposableFeedbackTreeView = window.createTreeView(
      `${EXTENSION_ID}.${ViewIds.FeedbackView}`,
      {
        treeDataProvider: feedbackProvider,
      },
    );

    const feedbackCommands = [
      {
        id: CommandIds.FeedbackAboutUs,
        handler: () => feedbackProvider.controller.aboutUs(),
      },
      {
        id: CommandIds.FeedbackReportIssues,
        handler: () => feedbackProvider.controller.reportIssues(),
      },
      {
        id: CommandIds.FeedbackRateUs,
        handler: () => feedbackProvider.controller.rateUs(),
      },
      {
        id: CommandIds.FeedbackSupportUs,
        handler: () => feedbackProvider.controller.supportUs(),
      },
    ];

    const feedbackDisposables = feedbackCommands.map(({ id, handler }) => {
      return commands.registerCommand(`${EXTENSION_ID}.${id}`, handler);
    });

    this.context.subscriptions.push(
      feedbackProvider,
      disposableFeedbackTreeView,
      ...feedbackDisposables,
    );
  }
}
