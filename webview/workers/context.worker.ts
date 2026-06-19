/// <reference lib="webworker" />

import type { Note } from '../../src/shared/types/note';

type TransformMessage = {
  type: 'transform';
  notes: Note[];
};

type RenderNode = {
  id: string;
  label: string;
  x: number;
  y: number;
};

type RenderPayload = {
  type: 'render';
  nodes: RenderNode[];
  edges: [];
};

self.onmessage = (event: MessageEvent<TransformMessage>) => {
  const message = event.data;

  if (message.type !== 'transform') {
    return;
  }

  const notes = message.notes;
  const count = notes.length;
  const radius = Math.max(50, count * 12);

  const nodes: RenderNode[] = notes.map((note, index) => {
    const angle = count > 0 ? (2 * Math.PI * index) / count : 0;

    return {
      id: note.filePath,
      label: note.title,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });

  const payload: RenderPayload = {
    type: 'render',
    nodes,
    edges: [],
  };

  self.postMessage(payload);
};
