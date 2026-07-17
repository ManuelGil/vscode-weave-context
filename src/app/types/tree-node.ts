import { Uri } from 'vscode';

/**
 * Collapsible semantic grouping node used by projection modes like `category`, `tags`, and `project`.
 * Flat, deterministic, and lightweight - groups have labels only and are expandable to file children.
 *
 * VS Code TreeView provider specific model - NOT reusable outside this extension.
 */
export type SemanticGroupTreeNode = {
  type: 'semanticGroup';
  label: string;
  projection: 'category' | 'type' | 'tags' | 'project';
  key: string;
};

/** Folder node representing a directory in the workspace notes folder. */
export type FolderTreeNode = {
  type: 'folder';
  uri: Uri;
  label: string;
};

/** File node representing a markdown file in the workspace notes folder. */
export type FileTreeNode = {
  type: 'file';
  uri: Uri;
  title?: string;
};

/**
 * Union of all tree node types used in the notes explorer.
 *
 * Supports three active projection modes:
 * - Semantic grouping (category, tags, project)
 * - Folder hierarchy (filesystem structure)
 * - Individual files
 *
 * VS Code TreeView provider specific model - NOT reusable outside this extension.
 */
export type NotesTreeNode =
  | SemanticGroupTreeNode
  | FolderTreeNode
  | FileTreeNode;
