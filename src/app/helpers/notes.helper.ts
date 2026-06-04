/** Small note utilities shared by controllers, providers, and helpers. */

import {
  DEFAULT_PROJECTION_FALLBACKS,
  ProjectableNote,
  SemanticGroup,
  TreeProjectionMode,
} from '../types';
import { normalizeString } from './text-normalization.helper';

/** Normalizes tags into a trimmed, duplicate-free list. */
const normalizeTags = (tags?: string[]): string[] => {
  if (!Array.isArray(tags)) {
    return [];
  }

  const normalizedTags = tags
    .map((tag) => normalizeString(tag))
    .filter(Boolean);

  return Array.from(new Set(normalizedTags));
};

/**
 * Resolves projection keys for a note.
 *
 * Examples:
 *
 * category -> ['Backend']
 * project  -> ['Auth Revamp']
 * tags     -> ['urgent', 'api']
 *
 * Empty values automatically resolve to fallback labels.
 *
 * @param note Source note.
 * @param projection Active projection mode.
 * @returns Projection keys.
 */
export const resolveProjectionKeys = (
  note: ProjectableNote,
  projection: TreeProjectionMode,
): string[] => {
  const fallbackLabel = DEFAULT_PROJECTION_FALLBACKS[projection] ?? 'Unknown';

  if (projection === 'category') {
    const category = normalizeString(note.category);

    return [category || fallbackLabel];
  }

  if (projection === 'project') {
    const project = normalizeString(note.project);

    return [project || fallbackLabel];
  }

  if (projection === 'tags') {
    const normalizedTags = normalizeTags(note.tags);

    return normalizedTags.length > 0 ? normalizedTags : [fallbackLabel];
  }

  return [];
};

/**
 * Builds semantic groups from a collection of notes.
 *
 * The resulting groups are unique and alphabetically sorted.
 *
 * @param notes Source notes collection.
 * @param projection Active projection mode.
 * @returns Semantic groups.
 */
export const buildSemanticGroups = <T extends ProjectableNote>(
  notes: T[],
  projection: TreeProjectionMode,
): SemanticGroup[] => {
  const uniqueGroupKeys = new Set<string>();

  for (const note of notes) {
    const projectionKeys = resolveProjectionKeys(note, projection);

    for (const key of projectionKeys) {
      uniqueGroupKeys.add(key);
    }
  }

  return Array.from(uniqueGroupKeys)
    .sort((leftKey, rightKey) => leftKey.localeCompare(rightKey))
    .map((key) => ({
      key,
      projection,
    }));
};

/**
 * Filters notes belonging to a semantic group.
 *
 * @param notes Source notes collection.
 * @param group Semantic group.
 * @returns Matching notes.
 */
export const filterNotesByGroup = <T extends ProjectableNote>(
  notes: T[],
  group: SemanticGroup,
): T[] => {
  return notes.filter((note) => {
    const projectionKeys = resolveProjectionKeys(note, group.projection);
    return projectionKeys.includes(group.key);
  });
};

/**
 * Generic alphabetical sorter for objects exposing a label-like selector.
 *
 * @param items Collection to sort.
 * @param selector Value selector.
 * @returns New sorted array.
 */
export const sortByLabel = <T>(
  items: T[],
  selector: (item: T) => string,
): T[] => {
  return [...items].sort((leftItem, rightItem) => {
    return selector(leftItem).localeCompare(selector(rightItem));
  });
};
