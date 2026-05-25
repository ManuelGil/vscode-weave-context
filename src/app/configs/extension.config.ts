/**
 * Workspace configuration for the extension.
 */

import { WorkspaceConfiguration } from 'vscode';

import { TreeProjectionMode } from '../types';
import {
  DEFAULT_ENABLE_SETTING,
  DEFAULT_NOTES_ROOT_SETTING,
  DEFAULT_TREE_PROJECTION_SETTING,
} from './constants.config';

export class ExtensionConfig {
  /** Whether the extension is enabled. */
  enable: boolean;

  /** Selected workspace folder path. */
  workspaceSelection: string | undefined;

  /** Relative or absolute notes root used as semantic discovery boundary. */
  notesRoot: string;

  /** Active tree projection mode. */
  treeProjection: TreeProjectionMode;

  /** Creates configuration from workspace settings. */
  constructor(readonly config: WorkspaceConfiguration) {
    this.enable = config.get<boolean>('enable', DEFAULT_ENABLE_SETTING);
    this.workspaceSelection = config.get<string>('workspaceSelection');
    this.notesRoot = config.get<string>(
      'notesRoot',
      DEFAULT_NOTES_ROOT_SETTING,
    );
    this.treeProjection = config.get<TreeProjectionMode>(
      'treeProjection',
      DEFAULT_TREE_PROJECTION_SETTING,
    );
  }

  /** Refreshes cached settings from VS Code configuration. */
  update(config: WorkspaceConfiguration): void {
    this.enable = config.get<boolean>('enable', this.enable);
    this.workspaceSelection = config.get<string>('workspaceSelection');
    this.notesRoot = config.get<string>('notesRoot', this.notesRoot);
    this.treeProjection = config.get<TreeProjectionMode>(
      'treeProjection',
      this.treeProjection,
    );
  }
}
