import type { ContextProjection } from '@src/shared/types/context-projection';

import type { LayoutProjection } from '../types/context.types';

import { layoutWithDagre } from './dagre-focus.layout';

/** Assigns layout coordinates and structural edges for Context View rendering. */
export function layoutContextProjection(
  projection: ContextProjection,
): LayoutProjection {
  const { nodes, edges } = layoutWithDagre(projection);

  return {
    nodes,
    edges,
    renderableEdgeCount: edges.length,
  };
}
