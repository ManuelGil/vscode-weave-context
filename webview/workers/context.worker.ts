/// <reference lib="webworker" />

import type {
  LayoutProjection,
  RenderPayload,
} from '../types/context.types';

type TransformMessage = {
  type: 'transform';
  projection: LayoutProjection;
};

self.onmessage = (
  event: MessageEvent<TransformMessage>,
) => {
  const message = event.data;

  if (message.type !== 'transform') {
    return;
  }

  const payload: RenderPayload = {
    type: 'render',
    nodes: message.projection.nodes,
    edges: message.projection.edges,
    renderableEdgeCount:
      message.projection.renderableEdgeCount,
  };

  self.postMessage(payload);
};
