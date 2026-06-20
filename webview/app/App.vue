<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";

import { layoutContextProjection } from "../layouts/context.layout";
import {
  createContextRenderer,
  getNodeConnectionDetails,
} from "../renderers/context.renderer";
import type {
  HoverDetails,
  RenderNode,
  RenderPayload,
} from "../types/context.types";

import type {
  ContextEdge,
  ContextProjection,
} from "@src/shared/types/context-projection";

const containerRef = useTemplateRef<HTMLDivElement>("container");

const hoveredNode = ref<string | null>(null);
const selectedNode = ref<string | null>(null);
const hoverDetails = ref<HoverDetails | null>(null);

let worker: Worker | undefined;
let workerBlobUrl: string | undefined;
let latestNodes: RenderNode[] = [];
let latestEdges: ContextEdge[] = [];

const interaction = {
  hoveredNodeId: null as string | null,
  selectedNodeId: null as string | null,
};

const contextRenderer = createContextRenderer();

const renderGraph = (payload: RenderPayload) => {
  const container = containerRef.value;

  if (!container) {
    return;
  }

  latestNodes = payload.nodes;
  latestEdges = payload.edges;

  contextRenderer.mount(
    container,
    interaction,
    {
      onHover(details) {
        hoverDetails.value = details;
        hoveredNode.value = interaction.hoveredNodeId;
      },
      onSelectionChange() {
        selectedNode.value = interaction.selectedNodeId;
      },
    },
    (nodeId) => getNodeConnectionDetails(nodeId, latestNodes, latestEdges),
  );

  contextRenderer.syncPayload(payload);
  contextRenderer.refresh();
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
  event: MessageEvent<{
    type?: string;
    projection?: ContextProjection;
  }>,
) => {
  const message = event.data;

  if (message.type !== "context:update") {
    return;
  }

  if (
    !message.projection ||
    !Array.isArray(message.projection.nodes) ||
    !Array.isArray(message.projection.edges)
  ) {
    return;
  }

  selectedNode.value = null;
  hoveredNode.value = null;
  hoverDetails.value = null;
  interaction.selectedNodeId = null;
  interaction.hoveredNodeId = null;

  const layoutProjection = layoutContextProjection(message.projection);

  worker?.postMessage({
    type: "transform",
    projection: layoutProjection,
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

    renderGraph(event.data);
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

  contextRenderer?.dispose();

  worker = undefined;
  workerBlobUrl = undefined;
  latestNodes = [];
  latestEdges = [];
});
</script>

<template>
  <div class="graph-shell">
    <div ref="container" class="graph-container" />
    <div
      v-if="hoverDetails"
      class="hover-tooltip"
      :style="{
        left: `${hoverDetails.x + 12}px`,
        top: `${hoverDetails.y + 12}px`,
      }"
    >
      <div class="hover-tooltip-title">{{ hoverDetails.title }}</div>
      <div class="hover-tooltip-summary">
        <div>Incoming ({{ hoverDetails.incoming.length }})</div>
        <div>Outgoing ({{ hoverDetails.outgoing.length }})</div>
      </div>
      <div v-if="hoverDetails.incoming.length > 0" class="hover-tooltip-section">
        <div class="hover-tooltip-label">Incoming:</div>
        <div
          v-for="item in hoverDetails.incoming"
          :key="`in-${item}`"
          class="hover-tooltip-item"
        >
          {{ item }}
        </div>
      </div>
      <div v-if="hoverDetails.outgoing.length > 0" class="hover-tooltip-section">
        <div class="hover-tooltip-label">Outgoing:</div>
        <div
          v-for="item in hoverDetails.outgoing"
          :key="`out-${item}`"
          class="hover-tooltip-item"
        >
          {{ item }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 240px;
}

.graph-container {
  width: 100%;
  height: 100%;
  min-height: 240px;
  background: transparent;
}

.hover-tooltip {
  position: absolute;
  z-index: 4;
  max-width: 240px;
  padding: 8px 10px;
  border: 1px solid var(--graph-tooltip-border, var(--vscode-widget-border));
  border-radius: var(--vscode-widget-border-radius, 4px);
  background: var(--graph-tooltip-background);
  box-shadow: var(--graph-tooltip-shadow);
  color: var(--vscode-foreground);
  font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
  font-size: var(--vscode-editor-font-size, var(--vscode-font-size));
  line-height: 1.45;
  pointer-events: none;
}

.hover-tooltip-title {
  margin-bottom: 4px;
  font-weight: 600;
}

.hover-tooltip-summary {
  margin-bottom: 6px;
  color: var(--graph-label-muted);
  font-size: calc(var(--vscode-font-size) * 0.9);
}

.hover-tooltip-section {
  margin-top: 6px;
}

.hover-tooltip-label {
  margin-bottom: 2px;
  color: var(--graph-label-muted);
  font-size: calc(var(--vscode-font-size) * 0.85);
  font-weight: 600;
}

.hover-tooltip-item {
  padding-left: 2px;
  overflow-wrap: anywhere;
}
</style>
