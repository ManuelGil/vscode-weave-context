import {
  Event,
  EventEmitter,
  FileSystemWatcher,
  FileType,
  l10n,
  QuickPickItem,
  RelativePattern,
  ThemeIcon,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  Uri,
  window,
  workspace,
} from 'vscode';

import {
  buildSemanticGroups,
  filterNotesByGroup,
  sortByLabel,
} from '../helpers';
import { NotesService } from '../services/notes.service';
import {
  FileTreeNode,
  FolderTreeNode,
  NotesTreeNode,
  SemanticGroupTreeNode,
  TreeProjectionMode,
} from '../types';

/**
 * Supplies the "Project notes" explorer view with one leaf per Markdown note.
 *
 * Lists `.md` notes recursively, and refreshes when notes change on disk.
 */
export class NotesTreeProvider implements TreeDataProvider<NotesTreeNode> {
  private readonly _onDidChangeTreeData = new EventEmitter<void>();
  readonly onDidChangeTreeData: Event<void> = this._onDidChangeTreeData.event;

  private watcher: FileSystemWatcher | undefined;

  private activeProjection: TreeProjectionMode;

  constructor(private readonly notesService: NotesService) {
    this.activeProjection = notesService.config.treeProjection;
  }

  getTreeItem(element: NotesTreeNode): TreeItem {
    if (this.isFolderNode(element)) {
      const item = new TreeItem(
        element.label,
        TreeItemCollapsibleState.Collapsed,
      );
      item.iconPath = new ThemeIcon('folder');
      return item;
    }

    if (this.isSemanticGroupNode(element)) {
      const item = new TreeItem(
        element.label,
        TreeItemCollapsibleState.Collapsed,
      );
      item.iconPath = new ThemeIcon('symbol-namespace');
      return item;
    }

    if (this.isFileNode(element)) {
      const label = element.title?.trim()
        ? element.title
        : workspace.asRelativePath(element.uri, false).split('/').pop();
      const item = new TreeItem(label ?? '', TreeItemCollapsibleState.None);
      item.resourceUri = element.uri;
      item.iconPath = new ThemeIcon('file');
      item.description = workspace.asRelativePath(element.uri, false);
      item.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [element.uri],
      };
      return item;
    }

    // Non-file nodes default to empty entries.
    return new TreeItem('', TreeItemCollapsibleState.None);
  }

  getCurrentProjection(): TreeProjectionMode {
    return this.activeProjection;
  }

  setProjection(nextProjection: TreeProjectionMode): void {
    if (this.activeProjection === nextProjection) {
      return;
    }

    this.activeProjection = nextProjection;
    this.refresh();
  }

  async pickProjection(): Promise<void> {
    const baseOptions: Array<QuickPickItem & { value: TreeProjectionMode }> = [
      { label: l10n.t('Filesystem'), value: 'filesystem' },
      { label: l10n.t('Category'), value: 'category' },
      { label: l10n.t('Type'), value: 'type' },
      { label: l10n.t('Tags'), value: 'tags' },
      { label: l10n.t('Project'), value: 'project' },
    ];

    const items = baseOptions.map((option) => ({
      ...option,
      description:
        option.value === this.activeProjection ? l10n.t('Active') : undefined,
    }));

    const selection = await window.showQuickPick(items, {
      placeHolder: l10n.t('Select a tree projection'),
    });

    if (!selection) {
      return;
    }

    this.setProjection(selection.value);
  }

  async getChildren(element?: NotesTreeNode): Promise<NotesTreeNode[]> {
    try {
      const root = this.notesService.getNotesDirectoryUri();
      if (!root) {
        return [];
      }

      const projection = this.activeProjection;

      // Root level: projection-aware listing
      if (!element) {
        if (projection === 'filesystem') {
          return this.readDirChildren(root);
        }

        const notes = await this.notesService.getAllNotes();

        return buildSemanticGroups(notes, projection).map(
          (group): SemanticGroupTreeNode => ({
            type: 'semanticGroup',
            label: group.key,
            projection: group.projection as SemanticGroupTreeNode['projection'],
            key: group.key,
          }),
        );
      }

      if (this.isFolderNode(element)) {
        return this.readDirChildren(element.uri);
      }

      if (this.isSemanticGroupNode(element)) {
        const notes = await this.notesService.getAllNotes();

        const children = filterNotesByGroup(notes, element).map(
          (note): FileTreeNode => ({
            type: 'file',
            uri: Uri.file(note.filePath),
            title: note.title,
          }),
        );

        return sortByLabel(
          children,
          (node) => node.title?.trim() || node.uri.fsPath,
        );
      }

      // Files have no children
      return [];
    } catch (error) {
      console.error('NotesTreeProvider getChildren:', error);
      window.showErrorMessage(
        l10n.t(
          'Could not load project notes in the explorer. See the developer console for details.',
        ),
      );
      return [];
    }
  }

  /**
   * Subscribes to filesystem changes under the notes directory so the tree stays in sync.
   */
  startWatching(): void {
    void (async () => {
      try {
        await this.attachWatcher();
      } catch (error) {
        console.error('NotesTreeProvider attach watcher:', error);
        window.showErrorMessage(
          l10n.t(
            'Could not watch the notes folder. See the developer console for details.',
          ),
        );
      }
    })();
  }

  /**
   * Triggers a refresh of the entire tree view.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Releases the filesystem watcher.
   */
  dispose(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    this._onDidChangeTreeData.dispose();
  }

  /**
   * Attaches a filesystem watcher to the notes directory so the tree refreshes when `.md` files change.
   * @private
   */
  private async attachWatcher(): Promise<void> {
    this.watcher?.dispose();
    this.watcher = undefined;

    const dir = this.notesService.getNotesDirectoryUri();
    if (!dir) {
      return;
    }

    this.watcher = workspace.createFileSystemWatcher(
      new RelativePattern(dir, '**/*.md'),
    );
    const fire = () => this._onDidChangeTreeData.fire();
    this.watcher.onDidChange(fire);
    this.watcher.onDidCreate(fire);
    this.watcher.onDidDelete(fire);
  }

  /**
   * Runtime type guard for folder nodes.
   */
  private isFolderNode(node: NotesTreeNode): node is FolderTreeNode {
    return node.type === 'folder';
  }

  /**
   * Runtime type guard for file nodes.
   */
  private isFileNode(node: NotesTreeNode): node is FileTreeNode {
    return node.type === 'file';
  }

  /**
   * Runtime type guard for semantic grouping nodes.
   */
  private isSemanticGroupNode(
    node: NotesTreeNode,
  ): node is SemanticGroupTreeNode {
    return node.type === 'semanticGroup';
  }

  /**
   * Reads directory children and returns folder and markdown file nodes (non-recursive).
   */
  private async readDirChildren(dirUri: Uri): Promise<NotesTreeNode[]> {
    const entries = await workspace.fs.readDirectory(dirUri);
    const folders: FolderTreeNode[] = [];
    const files: FileTreeNode[] = [];

    for (const [name, type] of entries) {
      const entryUri = Uri.joinPath(dirUri, name);
      if (type === FileType.Directory) {
        folders.push({ type: 'folder', uri: entryUri, label: name });
        continue;
      }

      if (type === FileType.File && name.match(/\.md$/i)) {
        // Derive title from frontmatter via NotesService.getNote
        let title: string | undefined;
        try {
          const note = await this.notesService.getNote(entryUri);
          if (note) {
            title = note.title;
          }
        } catch {
          // ignore read errors for individual files
        }

        files.push({ type: 'file', uri: entryUri, title });
      }
    }

    // Sort folders first, then files; both alphabetically
    const sortedFolders = sortByLabel(folders, (folder) => folder.label);
    const sortedFiles = sortByLabel(
      files,
      (file) => file.title?.trim() || file.uri.fsPath,
    );

    return [...sortedFolders, ...sortedFiles];
  }
}
