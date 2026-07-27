import Graph from 'graphology';
import Sigma from 'sigma';

import type { ContextEdge } from '@src/shared/types/context-projection';

import type {
  HoverDetails,
  RenderNode,
  RenderPayload,
  RendererEvents,
  RendererInteraction,
} from '../types/context.types';

const MAX_VISIBLE_LABEL_LENGTH = 18;
const FOCUS_LABEL_LENGTH = 28;
const SECONDARY_LABEL_LENGTH = 12;
const SECONDARY_NODE_SIZE = 5;
const NEIGHBOR_NODE_SIZE = 9;
const FOCUS_NODE_SIZE = 16;
const HIGHLIGHTED_NODE_SIZE = 11;
const FOCUS_BORDER_SIZE = 2.6;
const FOCUS_EDGE_SIZE = 2.4;
const NEIGHBOR_EDGE_SIZE = 1.15;
const SECONDARY_EDGE_SIZE = 0.75;
const ACTIVE_EDGE_SIZE = 2.6;
const DIMMED_EDGE_SIZE = 0.55;
const LABEL_OFFSET_Y = 6;

/** Visual weight by hop distance from the active note. */
const DEPTH_OPACITY: Record<number, number> = {
  0: 1,
  1: 0.92,
  2: 0.38,
  3: 0.24,
};

const depthOpacity = (depth: number): number => {
  return DEPTH_OPACITY[depth] ?? DEPTH_OPACITY[3];
};

const buildDepthMap = (
  nodes: RenderNode[],
  edges: ContextEdge[],
): Map<string, number> => {
  const focusNode = nodes.find((node) => node.role === 'focus');

  if (!focusNode) {
    return new Map(nodes.map((node) => [node.id, 0]));
  }

  const adjacency = new Map<string, Set<string>>();

  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }

  for (const edge of edges) {
    if (!edge.targetFilePath) {
      continue;
    }

    adjacency.get(edge.sourceFilePath)?.add(edge.targetFilePath);
    adjacency.get(edge.targetFilePath)?.add(edge.sourceFilePath);
  }

  const depths = new Map<string, number>();
  const queue = [focusNode.id];

  depths.set(focusNode.id, 0);

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

  for (const node of nodes) {
    if (!depths.has(node.id)) {
      depths.set(node.id, 3);
    }
  }

  return depths;
};

const edgeDepthOpacity = (
  sourceId: string,
  targetId: string,
  depthMap: Map<string, number>,
): number => {
  const sourceDepth = depthMap.get(sourceId) ?? 3;
  const targetDepth = depthMap.get(targetId) ?? 3;

  return Math.min(depthOpacity(sourceDepth), depthOpacity(targetDepth));
};

let themeColorProbe: HTMLDivElement | undefined;

/** Resolves a theme CSS variable to a computed color Sigma can render. */
const cssVar = (name: string): string => {
  if (!themeColorProbe) {
    themeColorProbe = document.createElement('div');
    themeColorProbe.style.display = 'none';
    document.documentElement.appendChild(themeColorProbe);
  }

  themeColorProbe.style.backgroundColor = `var(${name})`;
  const backgroundColor = getComputedStyle(themeColorProbe).backgroundColor;
  themeColorProbe.style.backgroundColor = '';

  if (
    backgroundColor &&
    backgroundColor !== 'transparent' &&
    backgroundColor !== 'rgba(0, 0, 0, 0)'
  ) {
    return backgroundColor;
  }

  themeColorProbe.style.color = `var(${name})`;
  const color = getComputedStyle(themeColorProbe).color;
  themeColorProbe.style.color = '';

  return color || cssVar('--vscode-foreground');
};

const withAlpha = (color: string, alpha: number): string => {
  const match = color.match(/rgba?\(([^)]+)\)/);

  if (!match) {
    return color;
  }

  const parts = match[1].split(',').map((part) => part.trim());

  if (parts.length < 3) {
    return color;
  }

  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
};

const truncateLabel = (
  label: string,
  maxLength = MAX_VISIBLE_LABEL_LENGTH,
): string => {
  const trimmed = label.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
};

const shouldShowNodeLabel = (
  nodeId: string,
  depth: number,
  hoveredNodeId: string | null,
): boolean => {
  if (depth <= 1) {
    return true;
  }

  return hoveredNodeId === nodeId;
};

const labelLengthForDepth = (depth: number): number => {
  if (depth === 0) {
    return FOCUS_LABEL_LENGTH;
  }

  if (depth === 1) {
    return MAX_VISIBLE_LABEL_LENGTH;
  }

  return SECONDARY_LABEL_LENGTH;
};

const drawNodeLabelBelow = (
  context: CanvasRenderingContext2D,
  data: {
    x: number;
    y: number;
    size: number;
    label?: string | null;
    labelColor?: string;
    labelSize?: number;
    labelWeight?: string;
  },
  settings: {
    labelSize: number;
    labelFont: string;
    labelWeight: string;
    labelColor: { attribute?: string; color?: string };
  },
): void => {
  if (!data.label) {
    return;
  }

  const fontSize = data.labelSize ?? settings.labelSize;
  const font = settings.labelFont;
  const weight = data.labelWeight ?? settings.labelWeight;
  const color =
    data.labelColor ??
    (settings.labelColor.attribute
      ? cssVar('--graph-label-color')
      : settings.labelColor.color ?? cssVar('--graph-label-color'));

  context.fillStyle = color;
  context.font = `${weight} ${fontSize}px ${font}`;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText(data.label, data.x, data.y + data.size + LABEL_OFFSET_Y);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
};

export type ContextRenderer = {
  mount: (
    container: HTMLDivElement,
    interaction: RendererInteraction,
    events: RendererEvents,
    getConnectionDetails: (nodeId: string) => Omit<HoverDetails, 'x' | 'y'>,
  ) => void;
  syncPayload: (payload: RenderPayload) => void;
  refresh: () => void;
  getSigma: () => Sigma | undefined;
  dispose: () => void;
};

export function createContextRenderer(): ContextRenderer {
  let graph: Graph | undefined;
  let renderer: Sigma | undefined;
  let latestNodes: RenderNode[] = [];
  let latestEdges: ContextEdge[] = [];
  let nodeDepthMap = new Map<string, number>();
  let interaction: RendererInteraction = {
    hoveredNodeId: null,
    selectedNodeId: null,
  };
  let getConnectionDetails: (
    nodeId: string,
  ) => Omit<HoverDetails, 'x' | 'y'> = () => ({
    title: '',
    incoming: [],
    outgoing: [],
  });
  let events: RendererEvents = {
    onHover: () => {},
    onSelectionChange: () => {},
  };

  const isNodeConnectedToSelection = (nodeId: string): boolean => {
    if (!interaction.selectedNodeId) {
      return false;
    }

    return latestEdges.some((edge) => {
      if (!edge.targetFilePath) {
        return false;
      }

      return (
        (edge.sourceFilePath === interaction.selectedNodeId &&
          edge.targetFilePath === nodeId) ||
        (edge.targetFilePath === interaction.selectedNodeId &&
          edge.sourceFilePath === nodeId)
      );
    });
  };

  const isEdgeHighlighted = (source: string, target: string): boolean => {
    if (
      interaction.selectedNodeId &&
      (source === interaction.selectedNodeId ||
        target === interaction.selectedNodeId)
    ) {
      return true;
    }

    if (
      interaction.hoveredNodeId &&
      (source === interaction.hoveredNodeId ||
        target === interaction.hoveredNodeId)
    ) {
      return true;
    }

    return false;
  };

  const hasActiveInteraction = (): boolean => {
    return Boolean(
      interaction.hoveredNodeId || interaction.selectedNodeId,
    );
  };

  const applyNodeReducer = (node: string, data: Record<string, unknown>) => {
    const renderNode = latestNodes.find((entry) => entry.id === node);
    const role = renderNode?.role ?? 'outgoing';
    const isSelected = interaction.selectedNodeId === node;
    const isHovered = interaction.hoveredNodeId === node;
    const isHighlighted =
      isSelected || isHovered || isNodeConnectedToSelection(node);
    const isFocus = role === 'focus';
    const nodeDepth = nodeDepthMap.get(node) ?? 3;
    const rawLabel = renderNode?.label ?? '';
    const showLabel = shouldShowNodeLabel(
      node,
      nodeDepth,
      interaction.hoveredNodeId,
    );

    let size = SECONDARY_NODE_SIZE;
    if (isFocus) {
      size = FOCUS_NODE_SIZE;
    } else if (nodeDepth <= 1) {
      size = NEIGHBOR_NODE_SIZE;
    }

    if (isHighlighted && !isFocus) {
      size = Math.max(size, HIGHLIGHTED_NODE_SIZE);
    }

    let nodeColor = cssVar('--graph-node-default-color');
    let borderColor = cssVar('--graph-node-default-border');
    let borderSize = 0.6;

    if (nodeDepth <= 1 && !isFocus) {
      nodeColor = cssVar('--graph-node-neighbor-color');
      borderColor = cssVar('--graph-node-neighbor-border');
      borderSize = 1;
    }

    if (isFocus) {
      nodeColor = cssVar('--graph-node-focus-color');
      borderColor = cssVar('--graph-node-focus-border');
      borderSize = FOCUS_BORDER_SIZE;
    }

    if (isHighlighted && !isFocus) {
      nodeColor = cssVar('--graph-node-highlight');
      borderColor = cssVar('--graph-node-highlight');
      borderSize = 1.4;
    }

    if (isHighlighted && isFocus) {
      borderSize = FOCUS_BORDER_SIZE + 0.4;
    }

    const depthAlpha = depthOpacity(nodeDepth);
    const visualAlpha = isHighlighted ? Math.max(depthAlpha, 0.95) : depthAlpha;

    nodeColor = withAlpha(nodeColor, visualAlpha);
    borderColor = withAlpha(borderColor, visualAlpha);

    let zIndex = 0;
    if (isFocus) {
      zIndex = isSelected || isHovered ? 4 : 3;
    } else if (isHighlighted) {
      zIndex = 2;
    } else if (nodeDepth <= 1) {
      zIndex = 1;
    }

    const labelColorVar =
      isFocus || nodeDepth <= 1
        ? '--graph-label-color'
        : '--graph-label-muted';

    return {
      ...data,
      color: nodeColor,
      borderColor,
      borderSize,
      size,
      label: showLabel
        ? truncateLabel(rawLabel, labelLengthForDepth(nodeDepth))
        : '',
      labelColor: withAlpha(cssVar(labelColorVar), visualAlpha),
      labelSize: isFocus ? 13 : nodeDepth <= 1 ? 11 : 10,
      labelWeight: isFocus ? '700' : '600',
      zIndex,
    };
  };

  const applyEdgeReducer = (edge: string, data: Record<string, unknown>) => {
    if (!graph?.hasEdge(edge)) {
      return data;
    }

    const source = graph.source(edge);
    const target = graph.target(edge);
    const highlighted = isEdgeHighlighted(source, target);
    const activeInteraction = hasActiveInteraction();
    const edgeAlpha = edgeDepthOpacity(source, target, nodeDepthMap);
    const focusId = latestNodes.find((entry) => entry.role === 'focus')?.id;
    const touchesFocus =
      focusId !== undefined &&
      (source === focusId || target === focusId);
    const sourceDepth = nodeDepthMap.get(source) ?? 3;
    const targetDepth = nodeDepthMap.get(target) ?? 3;
    const minDepth = Math.min(sourceDepth, targetDepth);

    let edgeColor = withAlpha(cssVar('--graph-edge-color'), edgeAlpha);
    let edgeSize = SECONDARY_EDGE_SIZE;
    let edgeZIndex = 0;

    if (touchesFocus) {
      edgeColor = withAlpha(
        cssVar('--graph-edge-focus'),
        Math.max(edgeAlpha, 0.88),
      );
      edgeSize = FOCUS_EDGE_SIZE;
      edgeZIndex = 2;
    } else if (minDepth <= 1) {
      edgeColor = withAlpha(
        cssVar('--graph-edge-color'),
        Math.min(edgeAlpha, 0.55),
      );
      edgeSize = NEIGHBOR_EDGE_SIZE;
      edgeZIndex = 1;
    } else {
      edgeColor = withAlpha(
        cssVar('--graph-edge-color'),
        Math.min(edgeAlpha, 0.22),
      );
      edgeSize = SECONDARY_EDGE_SIZE;
      edgeZIndex = 0;
    }

    if (activeInteraction) {
      if (highlighted) {
        edgeColor = withAlpha(cssVar('--graph-edge-highlight'), 1);
        edgeSize = ACTIVE_EDGE_SIZE;
        edgeZIndex = 2;
      } else {
        edgeColor = withAlpha(
          cssVar('--graph-edge-dimmed'),
          Math.min(edgeAlpha, 0.22),
        );
        edgeSize = DIMMED_EDGE_SIZE;
        edgeZIndex = 0;
      }
    }

    return {
      ...data,
      color: edgeColor,
      size: edgeSize,
      zIndex: edgeZIndex,
    };
  };

  const syncGraphNodes = (nodes: RenderNode[]) => {
    if (!graph) {
      return;
    }

    const nextIds = new Set(nodes.map((node) => node.id));
    const defaultNodeColor = cssVar('--graph-node-default-color');

    for (const existingId of graph.nodes()) {
      if (!nextIds.has(existingId)) {
        graph.dropNode(existingId);
      }
    }

    for (const node of nodes) {
      const attributes = {
        x: node.x,
        y: node.y,
        size: node.size,
        label: node.label,
        color: defaultNodeColor,
      };

      if (graph.hasNode(node.id)) {
        graph.mergeNodeAttributes(node.id, attributes);
      } else {
        graph.addNode(node.id, attributes);
      }
    }
  };

  const addRenderableEdges = (edges: ContextEdge[]): void => {
    if (!graph) {
      return;
    }

    const nodeIds = new Set(latestNodes.map((node) => node.id));
    const defaultEdgeColor = cssVar('--graph-edge-color');
    const focusId = latestNodes.find((entry) => entry.role === 'focus')?.id;

    for (const contextEdge of edges) {
      const source = contextEdge.sourceFilePath;
      const target = contextEdge.targetFilePath;

      if (!target || !nodeIds.has(source) || !nodeIds.has(target)) {
        continue;
      }

      const edgeId = `${source}->${target}`;

      if (graph.hasEdge(edgeId)) {
        continue;
      }

      const touchesFocus =
        focusId !== undefined &&
        (source === focusId || target === focusId);

      graph.addEdgeWithKey(edgeId, source, target, {
        size: touchesFocus ? FOCUS_EDGE_SIZE : NEIGHBOR_EDGE_SIZE,
        color: defaultEdgeColor,
        type: touchesFocus ? 'arrow' : 'line',
        zIndex: touchesFocus ? 1 : 0,
      });
    }
  };

  const ensureMounted = (container: HTMLDivElement) => {
    if (graph || renderer) {
      return;
    }

    graph = new Graph({ multi: true });
    renderer = new Sigma(graph, container, {
      defaultEdgeType: 'arrow',
      renderEdgeLabels: false,
      stagePadding: 36,
      labelDensity: 0.7,
      labelGridCellSize: 100,
      labelRenderedSizeThreshold: 0,
      labelFont: 'var(--vscode-font-family)',
      labelSize: 11,
      labelWeight: '600',
      labelColor: { attribute: 'labelColor' },
      defaultDrawNodeLabel: drawNodeLabelBelow,
      minEdgeThickness: 0.8,
      minCameraRatio: 0.04,
      maxCameraRatio: 4,
    });

    renderer.resize(true);
    renderer.getCamera().setState({
      x: 0.5,
      y: 0.5,
      ratio: 1,
      angle: 0,
    });
    renderer.setSetting('nodeReducer', applyNodeReducer);
    renderer.setSetting('edgeReducer', applyEdgeReducer);

    renderer.on('enterNode', ({ node, event }) => {
      interaction.hoveredNodeId = node;
      events.onHover({
        ...getConnectionDetails(node),
        x: event.x,
        y: event.y,
      });
      renderer?.refresh();
    });

    renderer.on('leaveNode', () => {
      interaction.hoveredNodeId = null;
      events.onHover(null);
      renderer?.refresh();
    });

    renderer.on('clickNode', ({ node }) => {
      interaction.selectedNodeId =
        interaction.selectedNodeId === node ? null : node;
      events.onSelectionChange();
      renderer?.refresh();
    });

    renderer.on('clickStage', () => {
      interaction.selectedNodeId = null;
      events.onSelectionChange();
      renderer?.refresh();
    });
  };

  return {
    mount(container, nextInteraction, nextEvents, nextGetConnectionDetails) {
      interaction = nextInteraction;
      events = nextEvents;
      getConnectionDetails = nextGetConnectionDetails;
      ensureMounted(container);
    },

    syncPayload(payload) {
      latestNodes = payload.nodes;
      latestEdges = payload.edges;
      nodeDepthMap = buildDepthMap(latestNodes, latestEdges);
      syncGraphNodes(latestNodes);
      graph?.clearEdges();
      addRenderableEdges(latestEdges);
      renderer?.refresh();
    },

    refresh() {
      renderer?.refresh();
    },

    getSigma() {
      return renderer;
    },

    dispose() {
      renderer?.kill();
      graph?.clear();
      graph = undefined;
      renderer = undefined;
      latestNodes = [];
      latestEdges = [];
      nodeDepthMap = new Map();
      themeColorProbe?.remove();
      themeColorProbe = undefined;
    },
  };
}

export function getNodeConnectionDetails(
  nodeId: string,
  nodes: RenderNode[],
  edges: ContextEdge[],
): Omit<HoverDetails, 'x' | 'y'> {
  const titleForNodeId = (id: string): string => {
    const node = nodes.find((entry) => entry.id === id);

    return node?.title ?? node?.label ?? id;
  };

  const incoming = new Set<string>();
  const outgoing = new Set<string>();

  for (const edge of edges) {
    if (!edge.targetFilePath) {
      continue;
    }

    if (edge.targetFilePath === nodeId) {
      incoming.add(titleForNodeId(edge.sourceFilePath));
    }

    if (edge.sourceFilePath === nodeId) {
      outgoing.add(titleForNodeId(edge.targetFilePath));
    }
  }

  return {
    title: titleForNodeId(nodeId),
    incoming: [...incoming].sort((left, right) => left.localeCompare(right)),
    outgoing: [...outgoing].sort((left, right) => left.localeCompare(right)),
  };
}
