/**
 * WebSocket Server for Chrome Extension Communication
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import {
  saveSelection,
  loadSelection,
  saveRecording,
  loadRecording,
  saveRecordingState,
  loadRecordingState,
  saveConnectionState,
  loadConnectionState,
} from './shared-state.js';
import type {
  InspectCapture,
  FreeSelectCapture,
  FlowRecording,
  PageDiagnostics,
  DOMSnapshot,
  DOMDiff,
} from './types/index.js';

const DEFAULT_PORT = 7007;

// Current state from extension
let currentSelection: InspectCapture | FreeSelectCapture | null = null;
let currentRecording: FlowRecording | null = null;
let isRecording = false;
let connectedClient: WebSocket | null = null;

// Pending requests waiting for response
const pendingRequests = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}>();

let requestIdCounter = 0;

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${++requestIdCounter}_${Date.now()}`;
}

/**
 * Send request to extension and wait for response
 */
async function sendRequest<T>(type: string, payload?: unknown, timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!connectedClient || connectedClient.readyState !== WebSocket.OPEN) {
      reject(new Error('Extension not connected'));
      return;
    }

    const id = generateRequestId();
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request timed out: ${type}`));
    }, timeoutMs);

    pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout });

    connectedClient.send(JSON.stringify({ type, id, payload }));
  });
}

/**
 * Handle incoming message from extension
 */
function handleMessage(data: string): void {
  try {
    const message = JSON.parse(data);

    // Handle response to pending request
    if (message.id && pendingRequests.has(message.id)) {
      const pending = pendingRequests.get(message.id)!;
      clearTimeout(pending.timeout);
      pendingRequests.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message.payload);
      }
      return;
    }

    // Handle push messages from extension
    switch (message.type) {
      case 'ELEMENT_SELECTED':
        currentSelection = message.payload as InspectCapture;
        saveSelection(currentSelection); // Save to shared state
        console.error('[MCP] Element selected:', currentSelection.element.selector);
        break;

      case 'REGION_SELECTED':
        currentSelection = message.payload as FreeSelectCapture;
        saveSelection(currentSelection); // Save to shared state
        console.error('[MCP] Region selected:', `${currentSelection.region.width}x${currentSelection.region.height}`);
        break;

      case 'RECORDING_STOPPED':
        currentRecording = message.payload as FlowRecording;
        isRecording = false;
        saveRecording(currentRecording); // Save to shared state
        saveRecordingState(false); // Save recording state
        console.error('[MCP] Recording stopped:', currentRecording?.summary.totalEvents, 'events');
        break;

      case 'PONG':
        // Connection alive
        break;

      default:
        console.error('[MCP] Unknown message type:', message.type);
    }
  } catch (error) {
    console.error('[MCP] Failed to parse message:', error);
  }
}

/**
 * Create and start WebSocket server
 */
export function createWebSocketServer(port = DEFAULT_PORT): Promise<WebSocketServer | null> {
  return new Promise<WebSocketServer | null>((resolve) => {
    const httpServer = createServer();

    // Handle port-in-use error before trying to bind
    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`[MCP] Port ${port} already in use - MCP server will run without WebSocket (extension connection not available)`);
        resolve(null);
      } else {
        console.error('[MCP] HTTP server error:', error);
        resolve(null);
      }
    });

    httpServer.listen(port, () => {
      const wss = new WebSocketServer({ server: httpServer });

      console.error(`[MCP] WebSocket server listening on port ${port}`);

      wss.on('connection', (ws) => {
        console.error('[MCP] Extension connected');
        connectedClient = ws;
        saveConnectionState(true);

        ws.on('message', (data) => {
          handleMessage(data.toString());
        });

        ws.on('close', () => {
          console.error('[MCP] Extension disconnected');
          if (connectedClient === ws) {
            connectedClient = null;
            saveConnectionState(false);
          }
        });

        ws.on('error', (error) => {
          console.error('[MCP] WebSocket error:', error);
        });

        // Send ping periodically and refresh connection state
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING' }));
            saveConnectionState(true); // Refresh timestamp
          }
        }, 30000);

        ws.on('close', () => clearInterval(pingInterval));
      });

      resolve(wss);
    });
  });
}

/**
 * Check if extension is connected
 * Checks both in-memory connection and shared state file
 */
export function isExtensionConnected(): boolean {
  // First check in-memory connection (for the process with WebSocket server)
  if (connectedClient !== null && connectedClient.readyState === WebSocket.OPEN) {
    return true;
  }
  // Fall back to shared state (for MCP instances spawned by Claude Code)
  return loadConnectionState();
}

/**
 * Get current selection
 */
export function getCurrentSelection(): InspectCapture | FreeSelectCapture | null {
  // Load from shared state to get updates from other processes
  const sharedSelection = loadSelection();
  if (sharedSelection) {
    currentSelection = sharedSelection;
  }
  return currentSelection;
}

/**
 * Clear current selection
 */
export function clearSelection(): void {
  currentSelection = null;
}

/**
 * Get current recording
 */
export function getCurrentRecording(): FlowRecording | null {
  // Load from shared state to get updates from other processes
  const sharedRecording = loadRecording();
  if (sharedRecording) {
    currentRecording = sharedRecording;
  }
  return currentRecording;
}

/**
 * Check if recording is in progress
 */
export function isRecordingActive(): boolean {
  // Load from shared state to get updates from other processes
  const sharedState = loadRecordingState();
  isRecording = sharedState;
  return isRecording;
}

/**
 * Request page diagnostics from extension
 */
export async function requestDiagnostics(): Promise<PageDiagnostics> {
  return sendRequest<PageDiagnostics>('GET_DIAGNOSTICS');
}

/**
 * Start flow recording
 */
export async function startRecording(): Promise<void> {
  await sendRequest('START_RECORDING');
  isRecording = true;
  currentRecording = null;
  saveRecordingState(true); // Save to shared state
  saveRecording(null); // Clear recording
}

/**
 * Stop flow recording
 */
export async function stopRecording(): Promise<FlowRecording> {
  const recording = await sendRequest<FlowRecording>('STOP_RECORDING');
  isRecording = false;
  currentRecording = recording;
  saveRecordingState(false); // Save to shared state
  saveRecording(recording); // Save recording
  return recording;
}

/**
 * Request DOM snapshot
 */
export async function requestSnapshot(selector?: string): Promise<DOMSnapshot> {
  return sendRequest<DOMSnapshot>('SNAPSHOT_DOM', { selector });
}

/**
 * Request DOM diff
 */
export async function requestDiff(before: string, after: string): Promise<DOMDiff> {
  return sendRequest<DOMDiff>('DIFF_SNAPSHOTS', { before, after });
}
