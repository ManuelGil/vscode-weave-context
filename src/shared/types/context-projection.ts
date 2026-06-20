export type ContextNodeRole = 'focus' | 'backlink' | 'outgoing';

/** Minimal node shape for Context View visualization. */
export interface ContextNode {
  filePath: string;
  title: string;
  role: ContextNodeRole;
}

/** Explicit wikilink relationship between notes. */
export interface ContextEdge {
  sourceFilePath: string;
  targetReference: string;
  targetFilePath?: string;
}

/** Serializable projection sent from the extension host to the webview. */
export interface ContextProjection {
  nodes: ContextNode[];
  edges: ContextEdge[];
}
