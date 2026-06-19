<script setup lang="ts">
import Graph from "graphology";
import Sigma from "sigma";
import { onBeforeUnmount, onMounted, useTemplateRef } from "vue";

import type { Note } from "@src/shared/types/note";

/**
 * Render-only node shape produced by the worker.
 *
 * This is intentionally separate from Note.
 * The worker is responsible for transforming semantic data
 * into visual data.
 */
type RenderNode = {
  id: string;
  label: string;
  x: number;
  y: number;
};

/**
 * Render payload returned by the worker.
 *
 * Future:
 * - edges will be populated from explicit wikilinks only.
 * - no inferred relationships.
 */
type RenderPayload = {
  type: "render";
  nodes: RenderNode[];
  edges: [];
};

const containerRef = useTemplateRef<HTMLDivElement>("container");

let worker: Worker | undefined;
let workerBlobUrl: string | undefined;

let graph: Graph | undefined;
let renderer: Sigma | undefined;

/**
 * Render graph into Sigma.
 *
 * Current phase:
 * - nodes only
 * - no edges
 *
 * Future:
 * - explicit wikilink edges
 * - incremental graph updates
 */
const renderGraph = (nodes: RenderNode[]): void => {
  const container = containerRef.value;

  if (!container) {
    return;
  }

  if (!graph) {
    graph = new Graph();
    renderer = new Sigma(graph, container);
  } else {
    graph.clear();
  }

  for (const node of nodes) {
    graph.addNode(node.id, {
      x: node.x,
      y: node.y,
      size: 8,
      label: node.label,
    });
  }

  renderer?.refresh();
};

/**
 * Handle messages coming from the Extension Host.
 *
 * Current contract:
 *
 * context:update
 *   -> Note[]
 *
 * Future:
 * ContextProjection
 */
const handleHostMessage = (
  event: MessageEvent<{ type?: string; notes?: Note[] }>,
): void => {
  const message = event.data;

  if (message.type !== "context:update") {
    return;
  }

  if (!Array.isArray(message.notes)) {
    return;
  }

  worker?.postMessage({
    type: "transform",
    notes: message.notes,
  });
};

/**
 * Initialize worker.
 *
 * IMPORTANT:
 *
 * VSCode Webviews cannot directly instantiate workers from
 * asWebviewUri(...) URLs because of browser same-origin restrictions.
 *
 * The worker script must be:
 *
 * asWebviewUri
 *   -> fetch
 *   -> Blob
 *   -> blob:
 *   -> Worker
 *
 * This pattern is already used successfully in the React implementation.
 */
const initializeWorker = async (): Promise<void> => {
  const workerUrl = window.ContextWorkerUri;

  if (!workerUrl) {
    console.error("[ContextView] Worker URL not available.");
    return;
  }

  const response = await fetch(workerUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch worker script (${response.status})`);
  }

  const source = await response.text();

  const blob = new Blob([source], {
    type: "application/javascript",
  });

  workerBlobUrl = URL.createObjectURL(blob);

  worker = new Worker(workerBlobUrl);

  worker.onmessage = (event: MessageEvent<RenderPayload>) => {
    if (event.data.type !== "render") {
      return;
    }

    renderGraph(event.data.nodes);
  };

  worker.onerror = (error) => {
    console.error("[ContextView] Worker error", error);
  };

  worker.onmessageerror = (error) => {
    console.error("[ContextView] Worker message error", error);
  };
};

onMounted(async () => {
  const vscode = acquireVsCodeApi();

  try {
    await initializeWorker();

    window.addEventListener("message", handleHostMessage);

    /**
     * Request initial data.
     *
     * We wait until:
     * - Vue mounted
     * - worker initialized
     * - listeners registered
     *
     * to avoid losing the first projection update.
     */
    vscode.postMessage({
      type: "context:ready",
    });
  } catch (error) {
    console.error("[ContextView] Failed to initialize worker", error);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("message", handleHostMessage);

  worker?.terminate();

  if (workerBlobUrl) {
    URL.revokeObjectURL(workerBlobUrl);
  }

  renderer?.kill();
  graph?.clear();

  worker = undefined;
  workerBlobUrl = undefined;
  renderer = undefined;
  graph = undefined;
});
</script>

<template>
  <div ref="container" class="graph-container" />
</template>

<style scoped>
.graph-container {
  width: 100%;
  height: 100%;
}
</style>
