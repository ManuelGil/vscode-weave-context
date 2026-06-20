import type {
  ContextEdge,
  ContextNodeRole,
} from '@src/shared/types/context-projection';

/** Node with layout coordinates ready for Graphology / Sigma. */
export type RenderNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  size: number;
  role: ContextNodeRole;
};

/** Positions and edges resolved on the main thread before worker handoff. */
export type LayoutProjection = {
  nodes: RenderNode[];
  edges: ContextEdge[];
  renderableEdgeCount: number;
};

export type RenderPayload = {
  type: 'render';
  nodes: RenderNode[];
  edges: ContextEdge[];
  renderableEdgeCount: number;
};

export type HoverDetails = {
  title: string;
  incoming: string[];
  outgoing: string[];
  x: number;
  y: number;
};

/** Topology-only node shape before coordinates are assigned. */
export type VisualNode = {
  id: string;
  label: string;
  role: ContextNodeRole;
};

/** What the Context View intends to show — no coordinates yet. */
export type VisualProjection = {
  focusId: string;
  nodes: VisualNode[];
  edges: ContextEdge[];
  renderableEdges: ContextEdge[];
};

export type RendererInteraction = {
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
};

export type RendererEvents = {
  onHover: (details: HoverDetails | null) => void;
  onSelectionChange: () => void;
};
