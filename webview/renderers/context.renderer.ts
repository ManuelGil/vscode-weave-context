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

const MAX_VISIBLE_LABEL_LENGTH = 28;
const PROGRESSIVE_LABEL_THRESHOLD = 6;
const UNIFIED_NODE_SIZE = 8;
const FOCUS_NODE_SIZE = 13;
const HIGHLIGHTED_NODE_SIZE = 12;
const FOCUS_BORDER_SIZE = 2;
const ACTIVE_EDGE_SIZE = 2.5;
const DIMMED_EDGE_SIZE = 1;
const DEFAULT_EDGE_SIZE = 1.5;
const LABEL_OFFSET_Y = 4;

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

const isFocusNeighbor = (
  nodeId: string,
  focusId: string,
  edges: ContextEdge[],
): boolean => {
  return edges.some((edge) => {
    if (!edge.targetFilePath) {
      return false;
    }

    return (
      (edge.sourceFilePath === focusId && edge.targetFilePath === nodeId) ||
      (edge.targetFilePath === focusId && edge.sourceFilePath === nodeId)
    );
  });
};

const shouldShowNodeLabel = (
  nodeId: string,
  nodes: RenderNode[],
  edges: ContextEdge[],
  hoveredNodeId: string | null,
): boolean => {
  if (nodes.length <= PROGRESSIVE_LABEL_THRESHOLD) {
    return true;
  }

  const focusNode = nodes.find((node) => node.role === 'focus');

  if (!focusNode) {
    return true;
  }

  if (nodeId === focusNode.id || isFocusNeighbor(nodeId, focusNode.id, edges)) {
    return true;
  }

  return hoveredNodeId === nodeId;
};

const drawNodeLabelBelow = (
  context: CanvasRenderingContext2D,
  data: {
    x: number;
    y: number;
    size: number;
    label?: string | null;
    labelColor?: string;
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

  const fontSize = settings.labelSize;
  const font = settings.labelFont;
  const weight = settings.labelWeight;
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
      isSelected ||
      isHovered ||
      isNodeConnectedToSelection(node);
    const isFocus = role === 'focus';
    const rawLabel = renderNode?.label ?? '';
    const showLabel = shouldShowNodeLabel(
      node,
      latestNodes,
      latestEdges,
      interaction.hoveredNodeId,
    );

    let size = UNIFIED_NODE_SIZE;
    if (isFocus) {
      size = FOCUS_NODE_SIZE;
    }
    if (isHighlighted && !isFocus) {
      size = HIGHLIGHTED_NODE_SIZE;
    }

    let nodeColor = cssVar('--graph-node-default-color');
    let borderColor = cssVar('--graph-node-default-border');
    let borderSize = 0.8;

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

    let zIndex = 0;
    if (isFocus && isSelected) {
      zIndex = 3;
    } else if (isHighlighted) {
      zIndex = 2;
    } else if (isFocus) {
      zIndex = 1;
    }

    return {
      ...data,
      color: nodeColor,
      borderColor,
      borderSize,
      size,
      label: showLabel
        ? truncateLabel(rawLabel, MAX_VISIBLE_LABEL_LENGTH)
        : '',
      labelColor: cssVar('--graph-label-color'),
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

    let edgeColor = cssVar('--graph-edge-color');
    let edgeSize = DEFAULT_EDGE_SIZE;
    let edgeZIndex = 0;

    if (activeInteraction) {
      if (highlighted) {
        edgeColor = withAlpha(cssVar('--graph-edge-highlight'), 1);
        edgeSize = ACTIVE_EDGE_SIZE;
        edgeZIndex = 1;
      } else {
        edgeColor = cssVar('--graph-edge-dimmed');
        edgeSize = DIMMED_EDGE_SIZE;
      }
    } else if (highlighted) {
      edgeColor = cssVar('--graph-edge-highlight');
      edgeSize = ACTIVE_EDGE_SIZE;
      edgeZIndex = 1;
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

      graph.addEdgeWithKey(edgeId, source, target, {
        size: 2,
        color: defaultEdgeColor,
        type: 'arrow',
        zIndex: 0,
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
      stagePadding: 28,
      labelDensity: 1,
      labelGridCellSize: 80,
      labelRenderedSizeThreshold: 0,
      labelFont: 'var(--vscode-font-family)',
      labelSize: 11,
      labelWeight: '600',
      labelColor: { attribute: 'labelColor' },
      defaultDrawNodeLabel: drawNodeLabelBelow,
      minEdgeThickness: 1,
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
