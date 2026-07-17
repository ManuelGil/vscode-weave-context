/**
 * Tree view projection models and configuration.
 *
 * Defines how notes are organized and grouped in the VS Code tree explorer.
 * These concepts are specific to the tree view UI and not reusable outside this extension.
 */

/**
 * Generic projection mode identifier.
 *
 * Determines how notes are grouped in the tree view:
 * - 'filesystem': Group by filesystem structure
 * - 'category': Group by note category field
 * - 'type': Group by note type field
 * - 'tags': Group by note tags
 * - 'project': Group by project metadata
 */
export type TreeProjectionMode =
  | 'filesystem'
  | 'category'
  | 'type'
  | 'tags'
  | 'project';

/**
 * Minimal shape required for tree projection operations.
 *
 * This intentionally avoids coupling to application-specific models
 * but is defined here as a UI projection contract, not a reusable domain concept.
 */
export interface ProjectableNote {
  title?: string;
  category?: string;
  type?: string;
  project?: string;
  tags?: string[];
}

/**
 * Lightweight semantic group structure for tree grouping operations.
 *
 * Can be adapted later by factories or UI layers.
 * Specific to VS Code tree view projection logic.
 */
export interface SemanticGroup<TKey = string> {
  key: TKey;
  projection: TreeProjectionMode;
}

/**
 * Fallback label mapping for projection modes.
 *
 * Used when projection values are empty or undefined to provide
 * sensible default display labels in the tree view.
 */
export type ProjectionFallbackLabels = Record<TreeProjectionMode, string>;

/**
 * Canonical fallback labels for each projection mode.
 *
 * Centralized configuration used by tree projection operations throughout the application.
 * VS Code extension specific - not portable to other contexts.
 */
export const DEFAULT_PROJECTION_FALLBACKS: ProjectionFallbackLabels = {
  category: 'General Context',
  type: 'Untyped',
  tags: 'Untagged',
  project: 'Unassigned Project',
  filesystem: 'Root',
};
