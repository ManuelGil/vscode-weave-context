import { Uri } from 'vscode';

/**
 * Per-operation shared state for note service operations.
 *
 * Avoids repeated filesystem scans within a single orchestrated call.
 * Not a global cache - state is discarded after the operation completes.
 *
 * Operational concern specific to VS Code notes service implementation.
 */
export type OperationContext = {
  noteUris?: Uri[];
};

// Note: Uri is not imported here to avoid circular dependency with shared types
// Consumers should import Uri separately from vscode
