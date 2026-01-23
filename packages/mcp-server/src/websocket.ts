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
let connectedClient: WebSocket | null = null; // Extension connection (server mode)
let relayClient: WebSocket | null = null; // Connection to primary server (relay mode)
let relayClients: Set<WebSocket> = new Set(); // Relay MCP clients connected to this server

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
    // Determine which connection to use: direct extension or relay
    const target = (connectedClient && connectedClient.readyState === WebSocket.OPEN)
      ? connectedClient
      : (relayClient && relayClient.readyState === WebSocket.OPEN)
        ? relayClient
        : null;

    if (!target) {
      reject(new Error('Extension not connected. The browser extension WebSocket may have disconnected. Try reloading the extension or refreshing the page.'));
      return;
    }

    const id = generateRequestId();
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request timed out: ${type}`));
    }, timeoutMs);

    pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout });

    target.send(JSON.stringify({ type, id, payload }));
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

      case 'BUFFER_RECORDING':
        currentRecording = message.payload as FlowRecording;
        saveRecording(currentRecording);
        console.error('[MCP] Buffer recording received:', currentRecording?.summary.totalEvents, 'events');
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
 * Connect as a relay client to an existing WebSocket server
 */
function connectAsRelay(port: number): void {
  if (relayClient && relayClient.readyState === WebSocket.OPEN) return;

  try {
    relayClient = new WebSocket(`ws://localhost:${port}`);

    relayClient.on('open', () => {
      console.error('[MCP] Connected as relay client to primary server');
      // Identify ourselves as a relay client
      relayClient!.send(JSON.stringify({ type: 'MCP_RELAY_IDENTIFY' }));
    });

    relayClient.on('message', (data) => {
      handleMessage(data.toString());
    });

    relayClient.on('close', () => {
      console.error('[MCP] Relay connection closed, reconnecting...');
      relayClient = null;
      setTimeout(() => connectAsRelay(port), 3000);
    });

    relayClient.on('error', () => {
      // Error will be followed by close event
    });
  } catch (error) {
    console.error('[MCP] Failed to connect as relay:', error);
    setTimeout(() => connectAsRelay(port), 3000);
  }
}

/**
 * Handle a message from a relay client (on the server side)
 * Forwards requests to the extension and relays responses back
 */
function handleRelayRequest(relayWs: WebSocket, message: { type: string; id?: string; payload?: unknown }): void {
  if (!message.id || !connectedClient || connectedClient.readyState !== WebSocket.OPEN) {
    // Can't forward without an id or without extension connection
    if (message.id) {
      relayWs.send(JSON.stringify({ id: message.id, error: 'Extension not connected to primary server' }));
    }
    return;
  }

  // Forward to extension with a mapped ID
  const relayId = generateRequestId();
  const timeout = setTimeout(() => {
    pendingRequests.delete(relayId);
    relayWs.send(JSON.stringify({ id: message.id, error: 'Request timed out' }));
  }, 10000);

  pendingRequests.set(relayId, {
    resolve: (value: unknown) => {
      relayWs.send(JSON.stringify({ id: message.id, payload: value }));
    },
    reject: (error: Error) => {
      relayWs.send(JSON.stringify({ id: message.id, error: error.message }));
    },
    timeout,
  });

  connectedClient.send(JSON.stringify({ type: message.type, id: relayId, payload: message.payload }));
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
        console.error(`[MCP] Port ${port} already in use - connecting as relay client`);
        connectAsRelay(port);
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
        // Default to extension — relay clients will re-identify themselves immediately
        // Only replace if no existing open extension connection
        if (!connectedClient || connectedClient.readyState !== WebSocket.OPEN) {
          console.error('[MCP] Extension connected');
          connectedClient = ws;
          saveConnectionState(true);
        }

        ws.on('message', (data) => {
          const msgStr = data.toString();
          try {
            const msg = JSON.parse(msgStr);

            // Check if this client is identifying as a relay
            if (msg.type === 'MCP_RELAY_IDENTIFY') {
              console.error('[MCP] Client re-identified as relay');
              relayClients.add(ws);
              // Unset as extension if it was set
              if (connectedClient === ws) {
                connectedClient = null;
              }
              return;
            }

            // If it's a known relay client, forward its requests to extension
            if (relayClients.has(ws)) {
              handleRelayRequest(ws, msg);
              return;
            }

            // Extension message
            handleMessage(msgStr);
          } catch {
            handleMessage(msgStr);
          }
        });

        ws.on('close', () => {
          if (relayClients.has(ws)) {
            console.error('[MCP] Relay client disconnected');
            relayClients.delete(ws);
          } else if (connectedClient === ws) {
            console.error('[MCP] Extension disconnected');
            connectedClient = null;
            saveConnectionState(false);
          }
        });

        ws.on('error', (error) => {
          console.error('[MCP] WebSocket error:', error);
        });

        // Send ping periodically and refresh connection state
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN && connectedClient === ws) {
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
  // Check direct extension connection (primary server mode)
  if (connectedClient !== null && connectedClient.readyState === WebSocket.OPEN) {
    return true;
  }
  // Check relay connection (secondary process mode)
  if (relayClient !== null && relayClient.readyState === WebSocket.OPEN) {
    return true;
  }
  // Fall back to shared state file
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
 * Request recent activity buffer from extension
 */
export async function requestRecentActivity(): Promise<FlowRecording | null> {
  return sendRequest<FlowRecording | null>('GET_RECENT_ACTIVITY');
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
