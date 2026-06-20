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

const MAX_VISIBLE_LABEL_LENGTH = 22;
const UNIFIED_NODE_SIZE = 8;
const FOCUS_NODE_SIZE = 10;
const HIGHLIGHTED_NODE_SIZE = 12;

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

  return color || '#cccccc';
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

  const applyNodeReducer = (node: string, data: Record<string, unknown>) => {
    const renderNode = latestNodes.find((entry) => entry.id === node);
    const role = renderNode?.role ?? 'outgoing';
    const isHighlighted =
      interaction.selectedNodeId === node ||
      interaction.hoveredNodeId === node ||
      isNodeConnectedToSelection(node);
    const isFocus = role === 'focus';
    const rawLabel = renderNode?.label ?? '';

    let size = UNIFIED_NODE_SIZE;
    if (isFocus) {
      size = FOCUS_NODE_SIZE;
    }
    if (isHighlighted) {
      size = HIGHLIGHTED_NODE_SIZE;
    }

    let nodeColor = cssVar('--graph-node-outgoing-color');
    let borderColor = cssVar('--graph-node-outgoing-border');
    let borderSize = 0.8;

    if (role === 'backlink') {
      nodeColor = cssVar('--graph-node-backlink-color');
      borderColor = cssVar('--graph-node-backlink-border');
    }

    if (isFocus) {
      nodeColor = cssVar('--graph-node-focus-color');
      borderColor = cssVar('--graph-node-focus-border');
      borderSize = 1.2;
    }

    if (isHighlighted) {
      nodeColor = cssVar('--graph-node-highlight');
      borderColor = cssVar('--graph-node-highlight');
      borderSize = 1.4;
    }

    return {
      ...data,
      color: nodeColor,
      borderColor,
      borderSize,
      size,
      label: truncateLabel(rawLabel, isFocus ? 28 : MAX_VISIBLE_LABEL_LENGTH),
      labelColor: cssVar('--graph-label-color'),
      zIndex: isHighlighted ? 2 : isFocus ? 1 : 0,
    };
  };

  const applyEdgeReducer = (edge: string, data: Record<string, unknown>) => {
    if (!graph?.hasEdge(edge)) {
      return data;
    }

    const source = graph.source(edge);
    const target = graph.target(edge);
    const highlighted = isEdgeHighlighted(source, target);

    const edgeColor = cssVar(
      highlighted ? '--graph-edge-highlight' : '--graph-edge-color',
    );

    return {
      ...data,
      color: edgeColor,
      size: highlighted ? 3 : 2,
      zIndex: highlighted ? 1 : 0,
    };
  };

  const syncGraphNodes = (nodes: RenderNode[]) => {
    if (!graph) {
      return;
    }

    const nextIds = new Set(nodes.map((node) => node.id));
    const defaultNodeColor = cssVar('--graph-node-outgoing-color');

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
      minEdgeThickness: 2,
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
    return nodes.find((node) => node.id === id)?.label ?? id;
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
