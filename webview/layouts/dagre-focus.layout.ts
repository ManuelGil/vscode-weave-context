import dagre from 'dagre';

import type {
  ContextEdge,
  ContextProjection,
} from '@src/shared/types/context-projection';

import type { RenderNode } from '../types/context.types';

const DAGRE_GRAPH_OPTIONS = {
  rankdir: 'LR',
  nodesep: 40,
  ranksep: 80,
  marginx: 20,
  marginy: 20,
} as const;

const NODE_WIDTH = 60;
const NODE_HEIGHT = 24;
const COMPONENT_GAP = 40;
const DEFAULT_NODE_SIZE = 8;

type LayoutPosition = {
  x: number;
  y: number;
};

function renderableEdges(projection: ContextProjection): ContextEdge[] {
  const nodeIds = new Set(projection.nodes.map((node) => node.filePath));

  return projection.edges.filter(
    (edge) =>
      edge.targetFilePath &&
      nodeIds.has(edge.sourceFilePath) &&
      nodeIds.has(edge.targetFilePath),
  );
}

/** Assigns layout coordinates via Dagre from a host ContextProjection. */
export function layoutWithDagre(projection: ContextProjection): RenderNode[] {
  if (projection.nodes.length === 0) {
    return [];
  }

  const edges = renderableEdges(projection);
  const positions = runDagreLayout(projection, edges);
  const separatedPositions = separateOverlappingComponents(
    projection,
    edges,
    positions,
  );

  return projection.nodes.map((node) => {
    const position = separatedPositions.get(node.filePath)!;

    return {
      id: node.filePath,
      label: node.title,
      x: position.x,
      y: position.y,
      size: DEFAULT_NODE_SIZE,
      role: node.role,
    };
  });
}

function runDagreLayout(
  projection: ContextProjection,
  edges: ContextEdge[],
): Map<string, LayoutPosition> {
  const graph = new dagre.graphlib.Graph();

  graph.setGraph({ ...DAGRE_GRAPH_OPTIONS });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of projection.nodes) {
    graph.setNode(node.filePath, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  }

  const addedEdges = new Set<string>();

  for (const contextEdge of edges) {
    if (!contextEdge.targetFilePath) {
      continue;
    }

    const edgeKey = `${contextEdge.sourceFilePath}->${contextEdge.targetFilePath}`;

    if (addedEdges.has(edgeKey)) {
      continue;
    }

    addedEdges.add(edgeKey);
    graph.setEdge(contextEdge.sourceFilePath, contextEdge.targetFilePath);
  }

  dagre.layout(graph);

  const positions = new Map<string, LayoutPosition>();

  for (const node of projection.nodes) {
    const layoutNode = graph.node(node.filePath);

    positions.set(node.filePath, {
      x: layoutNode.x,
      y: layoutNode.y,
    });
  }

  return positions;
}

type ComponentBounds = {
  nodeIds: string[];
  minX: number;
  maxX: number;
};

function separateOverlappingComponents(
  projection: ContextProjection,
  edges: ContextEdge[],
  positions: Map<string, LayoutPosition>,
): Map<string, LayoutPosition> {
  const components = findConnectedComponents(projection, edges);

  if (components.length <= 1) {
    return positions;
  }

  const componentBounds = components
    .map((nodeIds) => toComponentBounds(nodeIds, positions))
    .sort((left, right) => left.minX - right.minX);

  const adjusted = new Map(positions);
  let previousMaxX = Number.NEGATIVE_INFINITY;

  for (const bounds of componentBounds) {
    const overlap = bounds.minX < previousMaxX + COMPONENT_GAP;

    if (!overlap) {
      previousMaxX = bounds.maxX;
      continue;
    }

    const shiftX = previousMaxX + COMPONENT_GAP - bounds.minX;

    for (const nodeId of bounds.nodeIds) {
      const current = adjusted.get(nodeId)!;

      adjusted.set(nodeId, {
        x: current.x + shiftX,
        y: current.y,
      });
    }

    previousMaxX = bounds.maxX + shiftX;
  }

  return adjusted;
}

function findConnectedComponents(
  projection: ContextProjection,
  edges: ContextEdge[],
): string[][] {
  const adjacency = new Map<string, Set<string>>();

  for (const node of projection.nodes) {
    adjacency.set(node.filePath, new Set());
  }

  for (const contextEdge of edges) {
    if (!contextEdge.targetFilePath) {
      continue;
    }

    adjacency.get(contextEdge.sourceFilePath)?.add(contextEdge.targetFilePath);
    adjacency.get(contextEdge.targetFilePath)?.add(contextEdge.sourceFilePath);
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of [...projection.nodes].sort((left, right) =>
    left.filePath.localeCompare(right.filePath),
  )) {
    if (visited.has(node.filePath)) {
      continue;
    }

    const component: string[] = [];
    const queue = [node.filePath];

    visited.add(node.filePath);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      component.push(currentId);

      for (const neighborId of adjacency.get(currentId) ?? []) {
        if (visited.has(neighborId)) {
          continue;
        }

        visited.add(neighborId);
        queue.push(neighborId);
      }
    }

    component.sort((left, right) => left.localeCompare(right));
    components.push(component);
  }

  return components;
}

function toComponentBounds(
  nodeIds: string[],
  positions: Map<string, LayoutPosition>,
): ComponentBounds {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;

  for (const nodeId of nodeIds) {
    const position = positions.get(nodeId)!;
    const halfWidth = NODE_WIDTH / 2;

    minX = Math.min(minX, position.x - halfWidth);
    maxX = Math.max(maxX, position.x + halfWidth);
  }

  return { nodeIds, minX, maxX };
}
