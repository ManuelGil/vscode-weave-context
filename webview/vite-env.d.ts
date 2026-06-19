/// <reference types="vite/client" />

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};

interface Window {
  ContextWorkerUri?: string;
}
