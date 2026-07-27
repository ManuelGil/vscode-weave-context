import dagre from 'dagre';

import type {
  ContextEdge,
  ContextProjection,
} from '@src/shared/types/context-projection';

import type { RenderNode } from '../types/context.types';

const DAGRE_GRAPH_OPTIONS = {
  rankdir: 'LR',
  align: 'UL',
  nodesep: 56,
  ranksep: 110,
  edgesep: 18,
  marginx: 28,
  marginy: 28,
} as const;

const NODE_WIDTH = 132;
const NODE_HEIGHT = 44;
const FOCUS_NODE_WIDTH = 168;
const FOCUS_NODE_HEIGHT = 56;
const DEFAULT_NODE_SIZE = 7;
const FOCUS_LAYOUT_SIZE = 12;

/** Clear space reserved around the active note during composition. */
const FOCUS_CLEARANCE = 120;
/** Neighbor region: near the focus, along the main LR axis. */
const NEIGHBOR_RADIUS = 168;
/** Secondary region: further out, still readable as a distinct zone. */
const SECONDARY_RADIUS = 310;
/** Max angular fan (radians) for each side of a region. */
const NEIGHBOR_FAN = 1.15;
const SECONDARY_FAN = 1.45;

type LayoutPosition = {
  x: number;
  y: number;
};

function visibleLabelFromFilePath(filePath: string): string {
  const segments = filePath.split(/[/\\]/);
  const basename = segments[segments.length - 1] ?? filePath;
  const extensionIndex = basename.lastIndexOf('.');

  if (extensionIndex <= 0) {
    return basename;
  }

  return basename.slice(0, extensionIndex);
}

function renderableEdges(projection: ContextProjection): ContextEdge[] {
  const nodeIds = new Set(projection.nodes.map((node) => node.filePath));

  return projection.edges.filter(
    (edge) =>
      edge.targetFilePath &&
      nodeIds.has(edge.sourceFilePath) &&
      nodeIds.has(edge.targetFilePath),
  );
}

function buildDepthMap(
  projection: ContextProjection,
  edges: ContextEdge[],
  focusId: string,
): Map<string, number> {
  const adjacency = new Map<string, Set<string>>();

  for (const node of projection.nodes) {
    adjacency.set(node.filePath, new Set());
  }

  for (const edge of edges) {
    if (!edge.targetFilePath) {
      continue;
    }

    adjacency.get(edge.sourceFilePath)?.add(edge.targetFilePath);
    adjacency.get(edge.targetFilePath)?.add(edge.sourceFilePath);
  }

  const depths = new Map<string, number>();
  const queue = [focusId];

  depths.set(focusId, 0);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentDepth = depths.get(currentId)!;

    for (const neighborId of adjacency.get(currentId) ?? []) {
      if (depths.has(neighborId)) {
        continue;
      }

      depths.set(neighborId, currentDepth + 1);
      queue.push(neighborId);
    }
  }

  for (const node of projection.nodes) {
    if (!depths.has(node.filePath)) {
      depths.set(node.filePath, 3);
    }
  }

  return depths;
}

/**
 * Keeps only edges that explain context structure:
 * - focus spokes (immediate relations)
 * - neighbor ↔ secondary links (extended knowledge)
 *
 * Drops peripheral cross-links that densify the view without answering
 * "where am I / what is related / what else belongs here".
 */
function selectContextStructureEdges(
  edges: ContextEdge[],
  depthMap: Map<string, number>,
  focusId: string,
): ContextEdge[] {
  return edges.filter((edge) => {
    if (!edge.targetFilePath) {
      return false;
    }

    if (
      edge.sourceFilePath === focusId ||
      edge.targetFilePath === focusId
    ) {
      return true;
    }

    const sourceDepth = depthMap.get(edge.sourceFilePath) ?? 99;
    const targetDepth = depthMap.get(edge.targetFilePath) ?? 99;
    const minDepth = Math.min(sourceDepth, targetDepth);
    const maxDepth = Math.max(sourceDepth, targetDepth);

    return minDepth === 1 && maxDepth >= 2;
  });
}

/**
 * Places nodes into focus-centered regions.
 *
 * Dagre supplies side (left/right) and vertical order.
 * This compositor maps each depth layer onto an arc-shaped zone so the
 * result keeps hierarchy without rigid columns.
 */
function composeContextRegions(
  positions: Map<string, LayoutPosition>,
  depthMap: Map<string, number>,
  focusId: string,
  edges: ContextEdge[],
): Map<string, LayoutPosition> {
  const focus = positions.get(focusId);

  if (!focus) {
    return positions;
  }

  const degreeById = buildDegreeMap(edges);

  type RegionEntry = {
    id: string;
    side: -1 | 1;
    region: 1 | 2;
    sortY: number;
    degree: number;
  };

  const entries: RegionEntry[] = [];

  for (const [id, position] of positions) {
    if (id === focusId) {
      continue;
    }

    const depth = depthMap.get(id) ?? 2;

    entries.push({
      id,
      side: position.x < focus.x ? -1 : 1,
      region: depth <= 1 ? 1 : 2,
      sortY: position.y,
      degree: degreeById.get(id) ?? 0,
    });
  }

  const result = new Map<string, LayoutPosition>();
  result.set(focusId, { x: 0, y: 0 });

  const groups = new Map<string, RegionEntry[]>();

  for (const entry of entries) {
    const key = `${entry.side}:${entry.region}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    group.sort(
      (left, right) =>
        left.sortY - right.sortY || left.id.localeCompare(right.id),
    );

    const side = group[0].side;
    const region = group[0].region;
    const baseRadius = region === 1 ? NEIGHBOR_RADIUS : SECONDARY_RADIUS;
    const fan = region === 1 ? NEIGHBOR_FAN : SECONDARY_FAN;
    const baseAngle = side < 0 ? Math.PI : 0;
    const count = group.length;

    group.forEach((entry, index) => {
      const slot = count === 1 ? 0.5 : index / (count - 1);
      const angle = baseAngle + (slot - 0.5) * fan;

      // Deterministic radius variation from index + connectivity.
      const stagger = (index % 2 === 0 ? -1 : 1) * (region === 1 ? 14 : 22);
      const degreePush = Math.min(entry.degree, 5) * (region === 1 ? 6 : 9);
      const radius = Math.max(
        FOCUS_CLEARANCE + (region === 1 ? 0 : 90),
        baseRadius + stagger + degreePush,
      );

      result.set(entry.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    });
  }

  return result;
}

function buildDegreeMap(edges: ContextEdge[]): Map<string, number> {
  const degrees = new Map<string, number>();

  for (const edge of edges) {
    if (!edge.targetFilePath) {
      continue;
    }

    degrees.set(
      edge.sourceFilePath,
      (degrees.get(edge.sourceFilePath) ?? 0) + 1,
    );
    degrees.set(
      edge.targetFilePath,
      (degrees.get(edge.targetFilePath) ?? 0) + 1,
    );
  }

  return degrees;
}

/** Assigns layout coordinates via Dagre, then composes focus-centered regions. */
export function layoutWithDagre(projection: ContextProjection): {
  nodes: RenderNode[];
  edges: ContextEdge[];
} {
  if (projection.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const focusNode = projection.nodes.find((node) => node.role === 'focus');
  const allEdges = renderableEdges(projection);

  if (!focusNode) {
    const positions = runDagreLayout(projection, allEdges);

    return {
      nodes: projection.nodes.map((node) => {
        const position = positions.get(node.filePath)!;

        return {
          id: node.filePath,
          label: visibleLabelFromFilePath(node.filePath),
          title: node.title,
          x: position.x,
          y: position.y,
          size: DEFAULT_NODE_SIZE,
          role: node.role,
        };
      }),
      edges: allEdges,
    };
  }

  const focusId = focusNode.filePath;
  const depthMap = buildDepthMap(projection, allEdges, focusId);
  const structureEdges = selectContextStructureEdges(
    allEdges,
    depthMap,
    focusId,
  );
  const layoutEdges =
    structureEdges.length > 0 ? structureEdges : allEdges;
  const dagrePositions = runDagreLayout(projection, layoutEdges);
  const positions = composeContextRegions(
    dagrePositions,
    depthMap,
    focusId,
    layoutEdges,
  );

  return {
    nodes: projection.nodes.map((node) => {
      const position = positions.get(node.filePath)!;
      const isFocus = node.role === 'focus';
      const label = isFocus
        ? node.title?.trim() || visibleLabelFromFilePath(node.filePath)
        : visibleLabelFromFilePath(node.filePath);

      return {
        id: node.filePath,
        label,
        title: node.title,
        x: position.x,
        y: position.y,
        size: isFocus ? FOCUS_LAYOUT_SIZE : DEFAULT_NODE_SIZE,
        role: node.role,
      };
    }),
    edges: layoutEdges,
  };
}

function runDagreLayout(
  projection: ContextProjection,
  edges: ContextEdge[],
): Map<string, LayoutPosition> {
  const graph = new dagre.graphlib.Graph();

  graph.setGraph({ ...DAGRE_GRAPH_OPTIONS });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of projection.nodes) {
    const isFocus = node.role === 'focus';

    graph.setNode(node.filePath, {
      width: isFocus ? FOCUS_NODE_WIDTH : NODE_WIDTH,
      height: isFocus ? FOCUS_NODE_HEIGHT : NODE_HEIGHT,
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
