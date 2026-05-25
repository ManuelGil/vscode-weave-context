import {
  Command,
  ThemeIcon,
  TreeItem,
  TreeItemCollapsibleState,
  TreeItemLabel,
  Uri,
} from 'vscode';

/**
 * Represents a tree node in the explorer view, extending VS Code's TreeItem with additional properties.
 *
 * Supports tree structure building with parent-child relationships and optional metadata
 * (line number, range) for editor navigation and highlighting.
 */
export class NodeModel extends TreeItem {
  /**
   * Child nodes (if any). Automatically manages collapsible state.
   */
  children?: NodeModel[];

  /**
   * Creates a tree node with automatic collapsible state inference.
   *
   * @param label - Display text or TreeItemLabel object.
   * @param iconPath - Optional icon (Theme icon, URI, or light/dark pair).
   * @param command - Optional command to execute on click.
   * @param resourceUri - Optional URI for file/folder reference.
   * @param contextValue - Optional context value for tree item menus.
   * @param children - Optional child nodes.
   */
  constructor(
    label: string | TreeItemLabel,
    iconPath?: string | Uri | { light: Uri; dark: Uri } | ThemeIcon,
    command?: Command,
    resourceUri?: Uri,
    contextValue?: string,
    children?: NodeModel[],
  ) {
    super(
      label,
      children
        ? TreeItemCollapsibleState.Expanded
        : TreeItemCollapsibleState.None,
    );
    this.iconPath = iconPath;
    this.resourceUri = resourceUri;
    this.command = command;
    this.contextValue = contextValue;
    this.children = children;
  }

  /**
   * Replaces child nodes and updates collapsible state.
   */
  setChildren(children: NodeModel[]): void {
    this.collapsibleState = TreeItemCollapsibleState.Expanded;
    this.children = children;
  }

  /**
   * Returns whether this node has child nodes.
   */
  hasChildren(): boolean {
    return !!(this.children && this.children.length);
  }
}
