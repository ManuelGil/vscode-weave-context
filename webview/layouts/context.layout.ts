import type {
  ContextEdge,
  ContextProjection,
} from '@src/shared/types/context-projection';

import type { LayoutProjection } from '../types/context.types';

import { layoutWithDagre } from './dagre-focus.layout';

/** Returns edges that can be drawn (both endpoints present in the projection). */
export function getRenderableEdges(
  projection: ContextProjection,
): ContextEdge[] {
  const nodeIds = new Set(projection.nodes.map((node) => node.filePath));

  return projection.edges.filter(
    (edge) =>
      edge.targetFilePath &&
      nodeIds.has(edge.sourceFilePath) &&
      nodeIds.has(edge.targetFilePath),
  );
}

/** Assigns layout coordinates to a host ContextProjection. */
export function layoutContextProjection(
  projection: ContextProjection,
): LayoutProjection {
  const edges = getRenderableEdges(projection);
  const nodes = layoutWithDagre(projection);

  return {
    nodes,
    edges,
    renderableEdgeCount: edges.length,
  };
}
