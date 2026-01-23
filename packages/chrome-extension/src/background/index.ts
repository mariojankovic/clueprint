/**
 * Background Service Worker
 * Manages state, WebSocket connection to MCP server, and message routing
 */

import {
  DEFAULT_SETTINGS,
  type ExtensionState,
  type InspectCapture,
  type FreeSelectCapture,
  type FlowRecording,
  type FlowEvent,
  type ConsoleEntry,
  type NetworkEntry,
  type DOMSnapshot,
  type ExtensionSettings,
} from '../types';

// Extension state
const state: ExtensionState = {
  isActive: false,
  isRecording: false,
  isBuffering: false,
  currentSelection: null,
  currentRecording: null,
  snapshots: new Map(),
  consoleBuffer: [],
  networkBuffer: [],
  mcpConnected: false,
};

// Flow recording state
let recordingStartTime: number | null = null;
let recordingEvents: FlowEvent[] = [];

// Ring buffer state (background capture)
let ringBuffer: FlowEvent[] = [];
let bufferPruneInterval: ReturnType<typeof setInterval> | null = null;
const BUFFER_MAX_AGE_MS = 30_000;

// WebSocket connection to MCP server
let ws: WebSocket | null = null;
const WS_PORT = 7007;
const WS_RECONNECT_DELAY = 3000;
const WS_KEEPALIVE_ALARM = 'ws-keepalive';

// Settings
let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };

/**
 * Initialize the background service worker
 */
function initialize(): void {
  console.log('[AI DevTools] Background service worker started');

  // Load settings from storage
  loadSettings();

  // Restore buffering state
  chrome.storage.local.get('isBuffering').then(({ isBuffering: wasBuffering }) => {
    if (wasBuffering) {
      startBuffering();
    }
  });

  // Connect to MCP server
  connectToMCPServer();

  // Listen for messages
  chrome.runtime.onMessage.addListener(handleMessage);

  // Listen for keyboard commands
  chrome.commands.onCommand.addListener(handleCommand);

  // Listen for tab updates
  chrome.tabs.onUpdated.addListener(handleTabUpdated);

  // Listen for extension icon click
  chrome.action.onClicked.addListener(handleActionClick);

  // Set up periodic keep-alive alarm for WebSocket reconnection
  // This persists across service worker restarts unlike setTimeout
  chrome.alarms.create(WS_KEEPALIVE_ALARM, { periodInMinutes: 0.5 }); // 30 seconds (Chrome minimum)
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === WS_KEEPALIVE_ALARM) {
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        connectToMCPServer();
      }
    }
  });
}

/**
 * Load settings from storage
 */
async function loadSettings(): Promise<void> {
  try {
    const stored = await chrome.storage.sync.get('settings');
    if (stored.settings) {
      settings = { ...DEFAULT_SETTINGS, ...stored.settings };
    }
  } catch (error) {
    console.warn('[AI DevTools] Failed to load settings:', error);
  }
}

/**
 * Connect to MCP server via WebSocket
 */
function connectToMCPServer(): void {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

  try {
    ws = new WebSocket(`ws://localhost:${settings.serverPort}`);

    ws.onopen = () => {
      console.log('[AI DevTools] Connected to MCP server');
      state.mcpConnected = true;
      broadcastStatus();
    };

    ws.onclose = () => {
      console.log('[AI DevTools] Disconnected from MCP server');
      state.mcpConnected = false;
      ws = null;
      broadcastStatus();

      // Attempt immediate reconnect (backup to alarm-based reconnection)
      setTimeout(connectToMCPServer, WS_RECONNECT_DELAY);
    };

    ws.onerror = (error) => {
      console.warn('[AI DevTools] WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      handleMCPMessage(JSON.parse(event.data));
    };
  } catch (error) {
    console.warn('[AI DevTools] Failed to connect to MCP server:', error);
    setTimeout(connectToMCPServer, WS_RECONNECT_DELAY);
  }
}

/**
 * Send message to MCP server
 */
function sendToMCP(message: object): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Handle messages from MCP server
 */
function handleMCPMessage(message: { type: string; id?: string; payload?: unknown }): void {
  switch (message.type) {
    case 'GET_SELECTION':
      sendToMCP({
        type: 'SELECTION_RESPONSE',
        id: message.id,
        payload: state.currentSelection,
      });
      break;

    case 'GET_DIAGNOSTICS':
      getActiveTabDiagnostics().then(diagnostics => {
        sendToMCP({
          type: 'DIAGNOSTICS_RESPONSE',
          id: message.id,
          payload: diagnostics,
        });
      });
      break;

    case 'START_RECORDING':
      startFlowRecording();
      sendToMCP({
        type: 'RECORDING_STARTED',
        id: message.id,
      });
      break;

    case 'STOP_RECORDING':
      const recording = stopFlowRecording();
      sendToMCP({
        type: 'RECORDING_RESPONSE',
        id: message.id,
        payload: recording,
      });
      break;

    case 'GET_RECORDING':
      sendToMCP({
        type: 'RECORDING_RESPONSE',
        id: message.id,
        payload: state.currentRecording,
      });
      break;

    case 'SNAPSHOT_DOM':
      snapshotDOM(message.payload as { selector?: string }).then(snapshot => {
        sendToMCP({
          type: 'SNAPSHOT_RESPONSE',
          id: message.id,
          payload: snapshot,
        });
      });
      break;

    case 'DIFF_SNAPSHOTS':
      const diff = diffSnapshots(message.payload as { before: string; after: string });
      sendToMCP({
        type: 'DIFF_RESPONSE',
        id: message.id,
        payload: diff,
      });
      break;

    case 'GET_RECENT_ACTIVITY':
      sendToMCP({
        type: 'RECENT_ACTIVITY_RESPONSE',
        id: message.id,
        payload: getBufferAsRecording(),
      });
      break;

    case 'PING':
      sendToMCP({ type: 'PONG', id: message.id });
      break;
  }
}

/**
 * Handle messages from content scripts or popup
 */
function handleMessage(
  message: { type: string; payload?: unknown },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  switch (message.type) {
    case 'ELEMENT_SELECTED':
      state.currentSelection = message.payload as InspectCapture;
      sendToMCP({ type: 'ELEMENT_SELECTED', payload: state.currentSelection });

      // Add to recording if active
      if (state.isRecording && recordingStartTime) {
        recordingEvents.push({
          time: Date.now() - recordingStartTime,
          type: 'element_select',
          data: { selector: (message.payload as InspectCapture).element.selector },
        });
      }

      addToBuffer('element_select', { selector: (message.payload as InspectCapture).element.selector });

      sendResponse({ success: true });
      break;

    case 'REGION_SELECTED':
      state.currentSelection = message.payload as FreeSelectCapture;
      sendToMCP({ type: 'REGION_SELECTED', payload: state.currentSelection });
      sendResponse({ success: true });
      break;

    case 'GET_BROWSER_CONTEXT':
      // Forward to content script
      sendResponse({
        errors: state.consoleBuffer.filter(e => e.type === 'error'),
        networkFailures: state.networkBuffer.filter(e => e.status && e.status >= 400),
      });
      break;

    case 'CONSOLE_EVENT':
      const consoleEntry = message.payload as ConsoleEntry;
      state.consoleBuffer.push(consoleEntry);

      // Keep buffer size limited
      while (state.consoleBuffer.length > settings.maxConsoleEntries) {
        state.consoleBuffer.shift();
      }

      // Add to recording if active
      if (state.isRecording && recordingStartTime) {
        recordingEvents.push({
          time: Date.now() - recordingStartTime,
          type: `console_${consoleEntry.type}` as FlowEvent['type'],
          data: { message: consoleEntry.message, source: consoleEntry.source },
        });
      }

      addToBuffer(`console_${consoleEntry.type}` as FlowEvent['type'], {
        message: consoleEntry.message,
        source: consoleEntry.source,
      });

      sendResponse({ success: true });
      break;

    case 'NETWORK_EVENT':
      const networkEntry = message.payload as NetworkEntry;
      state.networkBuffer.push(networkEntry);

      // Keep buffer size limited
      while (state.networkBuffer.length > settings.maxNetworkEntries) {
        state.networkBuffer.shift();
      }

      // Add to recording if active
      if (state.isRecording && recordingStartTime) {
        const eventType = networkEntry.status && networkEntry.status >= 400
          ? 'network_error'
          : 'network_response';
        recordingEvents.push({
          time: Date.now() - recordingStartTime,
          type: eventType,
          data: {
            url: networkEntry.url,
            method: networkEntry.method,
            status: networkEntry.status,
            statusText: networkEntry.statusText,
          },
        });
      }

      addToBuffer(
        (networkEntry.status && networkEntry.status >= 400 ? 'network_error' : 'network_response') as FlowEvent['type'],
        {
          url: networkEntry.url,
          method: networkEntry.method,
          status: networkEntry.status,
          statusText: networkEntry.statusText,
        }
      );

      sendResponse({ success: true });
      break;

    case 'INTERACTION_EVENT':
      // Add user interaction to recording if active
      if (state.isRecording && recordingStartTime) {
        const interaction = message.payload as { type: string; data: Record<string, unknown> };
        recordingEvents.push({
          time: Date.now() - recordingStartTime,
          type: interaction.type as FlowEvent['type'],
          data: interaction.data,
        });
      }
      {
        const interaction = message.payload as { type: string; data: Record<string, unknown> };
        addToBuffer(interaction.type as FlowEvent['type'], interaction.data);
      }
      sendResponse({ success: true });
      break;

    case 'CAPTURE_SCREENSHOT':
      captureScreenshot(sender.tab?.id).then(dataUrl => {
        sendResponse({ dataUrl });
      });
      return true; // Async response

    case 'GET_STATUS':
      sendResponse({
        isActive: state.isActive,
        isRecording: state.isRecording,
        isBuffering: state.isBuffering,
        hasSelection: state.currentSelection !== null,
        mcpConnected: state.mcpConnected,
      });
      break;

    case 'START_RECORDING':
      startFlowRecording();
      sendResponse({ success: true });
      break;

    case 'STOP_RECORDING':
      const rec = stopFlowRecording();
      sendToMCP({ type: 'RECORDING_STOPPED', payload: rec });
      sendResponse({ success: true, recording: rec });
      break;

    case 'CONTENT_READY':
      state.isActive = true;
      sendResponse({ success: true });
      break;

    case 'TOGGLE_BUFFER':
      if (state.isBuffering) {
        stopBuffering();
      } else {
        startBuffering();
      }
      sendResponse({ success: true, isBuffering: state.isBuffering });
      break;

    case 'SEND_BUFFER':
      const bufferRecording = getBufferAsRecording();
      if (bufferRecording) {
        state.currentRecording = bufferRecording;
        sendToMCP({ type: 'BUFFER_RECORDING', payload: bufferRecording });
      }
      sendResponse({ success: true, recording: bufferRecording });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true; // Keep channel open for async responses
}

/**
 * Handle keyboard commands
 */
async function handleCommand(command: string): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  switch (command) {
    case 'toggle-inspect':
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_INSPECT' }).catch(() => {});
      break;
    case 'toggle-region':
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_REGION' }).catch(() => {});
      break;
  }
}

/**
 * Handle extension icon click
 */
async function handleActionClick(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id) return;

  // Toggle inspect mode in content script
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_INSPECT' });
  } catch (error) {
    console.warn('[AI DevTools] Failed to toggle inspect mode:', error);
  }
}

/**
 * Handle tab updates (navigation, refresh)
 */
function handleTabUpdated(
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  _tab: chrome.tabs.Tab
): void {
  if (changeInfo.status === 'loading') {
    // Clear selection on navigation
    state.currentSelection = null;

    // Add navigation event to recording
    if (state.isRecording && recordingStartTime) {
      recordingEvents.push({
        time: Date.now() - recordingStartTime,
        type: changeInfo.url ? 'navigation' : 'refresh',
        data: { url: changeInfo.url },
      });
    }

    addToBuffer(
      (changeInfo.url ? 'navigation' : 'refresh') as FlowEvent['type'],
      { url: changeInfo.url }
    );
  }
}

/**
 * Capture screenshot of a tab
 */
async function captureScreenshot(tabId?: number): Promise<string | null> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
      format: 'jpeg',
      quality: Math.round(settings.screenshotQuality * 100),
    });
    return dataUrl;
  } catch (error) {
    console.warn('[AI DevTools] Screenshot capture failed:', error);
    return null;
  }
}

/**
 * Start flow recording
 */
async function startFlowRecording(): Promise<void> {
  state.isRecording = true;
  recordingStartTime = Date.now();
  recordingEvents = [];
  state.currentRecording = null;

  // Capture initial page context
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      recordingEvents.push({
        time: 0,
        type: 'navigation' as FlowEvent['type'],
        data: {
          url: tab.url,
          title: tab.title,
          event: 'recording_start',
        },
      });
    }
  } catch {
    // Ignore errors getting tab info
  }

  // Notify content scripts
  broadcastToAllTabs({ type: 'RECORDING_STARTED' });
}

/**
 * Stop flow recording
 */
function stopFlowRecording(): FlowRecording | null {
  if (!state.isRecording || !recordingStartTime) return null;

  const duration = Date.now() - recordingStartTime;

  // Generate summary
  const summary = {
    totalEvents: recordingEvents.length,
    clicks: recordingEvents.filter(e => e.type === 'click').length,
    inputs: recordingEvents.filter(e => e.type === 'input').length,
    scrolls: recordingEvents.filter(e => e.type === 'scroll').length,
    navigations: recordingEvents.filter(e => e.type === 'navigation' || e.type === 'refresh').length,
    networkRequests: recordingEvents.filter(e => e.type === 'network_request' || e.type === 'network_response').length,
    networkErrors: recordingEvents.filter(e => e.type === 'network_error').length,
    consoleErrors: recordingEvents.filter(e => e.type === 'console_error').length,
    layoutShifts: recordingEvents.filter(e => e.type === 'layout_shift').length,
  };

  // Generate diagnosis
  const diagnosis = generateFlowDiagnosis(recordingEvents, duration);

  const recording: FlowRecording = {
    mode: 'flow',
    duration,
    startTime: recordingStartTime,
    events: recordingEvents,
    finalSelection: state.currentSelection || undefined,
    summary,
    diagnosis,
  };

  state.isRecording = false;
  state.currentRecording = recording;
  recordingStartTime = null;
  recordingEvents = [];

  // Notify content scripts
  broadcastToAllTabs({ type: 'RECORDING_STOPPED' });

  return recording;
}

// =============================================================================
// Ring Buffer (Background Capture)
// =============================================================================

/**
 * Start background buffering
 */
function startBuffering(): void {
  state.isBuffering = true;
  ringBuffer = [];

  // Prune stale events every 5 seconds
  bufferPruneInterval = setInterval(pruneBuffer, 5000);

  // Persist toggle state
  chrome.storage.local.set({ isBuffering: true });

  broadcastStatus();
}

/**
 * Stop background buffering
 */
function stopBuffering(): void {
  state.isBuffering = false;
  ringBuffer = [];

  if (bufferPruneInterval) {
    clearInterval(bufferPruneInterval);
    bufferPruneInterval = null;
  }

  chrome.storage.local.set({ isBuffering: false });

  broadcastStatus();
}

/**
 * Prune events older than 30 seconds from ring buffer
 */
function pruneBuffer(): void {
  const cutoff = Date.now() - BUFFER_MAX_AGE_MS;
  const firstValidIndex = ringBuffer.findIndex(e => e.time >= cutoff);
  if (firstValidIndex > 0) {
    ringBuffer = ringBuffer.slice(firstValidIndex);
  } else if (firstValidIndex === -1 && ringBuffer.length > 0) {
    ringBuffer = [];
  }
}

/**
 * Add event to ring buffer (if buffering is active)
 */
function addToBuffer(type: FlowEvent['type'], data: Record<string, unknown>): void {
  if (!state.isBuffering) return;

  ringBuffer.push({
    time: Date.now(), // absolute timestamp
    type,
    data,
  });

  // Safety valve for high-frequency events
  if (ringBuffer.length > 5000) {
    pruneBuffer();
  }
}

/**
 * Get buffer contents as a FlowRecording
 */
function getBufferAsRecording(): FlowRecording | null {
  pruneBuffer();

  if (ringBuffer.length === 0) return null;

  const oldest = ringBuffer[0].time;
  const newest = ringBuffer[ringBuffer.length - 1].time;
  const duration = newest - oldest;

  // Convert absolute timestamps to relative
  const events: FlowEvent[] = ringBuffer.map(e => ({
    ...e,
    time: e.time - oldest,
  }));

  const summary = {
    totalEvents: events.length,
    clicks: events.filter(e => e.type === 'click').length,
    inputs: events.filter(e => e.type === 'input').length,
    scrolls: events.filter(e => e.type === 'scroll').length,
    navigations: events.filter(e => e.type === 'navigation' || e.type === 'refresh').length,
    networkRequests: events.filter(e => e.type === 'network_request' || e.type === 'network_response').length,
    networkErrors: events.filter(e => e.type === 'network_error').length,
    consoleErrors: events.filter(e => e.type === 'console_error').length,
    layoutShifts: events.filter(e => e.type === 'layout_shift').length,
  };

  const diagnosis = generateFlowDiagnosis(events, duration);

  return {
    mode: 'flow',
    duration,
    startTime: oldest,
    events,
    summary,
    diagnosis,
  };
}

/**
 * Generate diagnosis from flow events
 */
function generateFlowDiagnosis(events: FlowEvent[], duration: number): {
  suspectedIssue: string;
  timeline: string;
  rootCause?: string;
} {
  const errorEvents = events.filter(e => e.type === 'console_error' || e.type === 'network_error');
  const clickEvents = events.filter(e => e.type === 'click');

  let suspectedIssue = 'No obvious issues detected';
  let rootCause: string | undefined;

  // Check for errors after clicks
  for (const click of clickEvents) {
    const errorsAfterClick = errorEvents.filter(
      e => e.time > click.time && e.time < click.time + 1000
    );
    if (errorsAfterClick.length > 0) {
      suspectedIssue = `Error occurred after clicking ${(click.data as { selector?: string }).selector || 'element'}`;
      rootCause = (errorsAfterClick[0].data as { message?: string }).message;
      break;
    }
  }

  // Build timeline
  const timeline = events
    .slice(0, 10)
    .map(e => {
      const time = (e.time / 1000).toFixed(1);
      const emoji = getEventEmoji(e.type);
      const desc = getEventDescription(e);
      return `${time}s ${emoji} ${desc}`;
    })
    .join('\n');

  return { suspectedIssue, timeline, rootCause };
}

/**
 * Get emoji for event type
 */
function getEventEmoji(type: string): string {
  const emojis: Record<string, string> = {
    refresh: '🔄',
    navigation: '🔄',
    click: '🖱️',
    input: '⌨️',
    scroll: '📜',
    network_request: '📤',
    network_response: '✅',
    network_error: '❌',
    console_log: '📝',
    console_warn: '⚠️',
    console_error: '❌',
    dom_mutation: '🔀',
    layout_shift: '📐',
    element_select: '👆',
    form_submit: '📋',
    keypress: '⌨️',
    mouse_move: '🔍',
  };
  return emojis[type] || '•';
}

/**
 * Get description for event
 */
function getEventDescription(event: FlowEvent): string {
  const data = event.data as Record<string, unknown>;
  switch (event.type) {
    case 'click':
      const clickText = data.text ? `"${(data.text as string).slice(0, 40)}"` : (data.selector as string || 'element');
      return `CLICK ${data.role || ''} ${clickText} at (${data.x}, ${data.y})`;
    case 'scroll':
      const section = data.nearSection ? ` near "${(data.nearSection as string).slice(0, 30)}"` : '';
      return `SCROLL ${data.direction || ''} to ${data.scrollPercent || 0}%${section}`;
    case 'input':
      return `INPUT ${data.inputType || 'text'} "${data.label || data.selector || ''}" (${data.valueLength || 0} chars)`;
    case 'form_submit':
      return `SUBMIT ${data.method} form → ${data.action || 'same page'} (${data.fieldCount} fields)`;
    case 'keypress':
      return `KEY ${data.combo || data.key} on ${data.target || 'page'}`;
    case 'mouse_move':
      return `HOVER ${data.role || ''} ${data.target || ''} at (${data.x}, ${data.y})`;
    case 'navigation':
      if (data.event === 'recording_start') {
        return `START on "${data.title || 'page'}" (${data.url})`;
      }
      return `NAVIGATE → ${data.url || 'unknown'}`;
    case 'refresh':
      return `REFRESH page`;
    case 'network_response':
      const urlPath = (data.url as string)?.split('?')[0]?.split('/').slice(-2).join('/') || data.url;
      return `${data.method} /${urlPath} → ${data.status}`;
    case 'network_error':
      const errPath = (data.url as string)?.split('?')[0]?.split('/').slice(-2).join('/') || data.url;
      return `${data.method} /${errPath} → ${data.status} FAILED: "${data.statusText}"`;
    case 'console_error':
      return `ERROR: "${(data.message as string)?.slice(0, 80)}"`;
    case 'console_warn':
      return `WARN: "${(data.message as string)?.slice(0, 60)}"`;
    default:
      return event.type.toUpperCase();
  }
}

/**
 * Get diagnostics from active tab
 */
async function getActiveTabDiagnostics(): Promise<unknown> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;

    return await chrome.tabs.sendMessage(tab.id, { type: 'GET_DIAGNOSTICS' });
  } catch (error) {
    console.warn('[AI DevTools] Failed to get diagnostics:', error);
    return null;
  }
}

/**
 * Take DOM snapshot
 */
async function snapshotDOM(options: { selector?: string }): Promise<DOMSnapshot | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'SNAPSHOT_DOM',
      payload: options,
    });

    if (response) {
      const snapshot = response as DOMSnapshot;
      state.snapshots.set(snapshot.id, snapshot);
      return snapshot;
    }

    return null;
  } catch (error) {
    console.warn('[AI DevTools] Failed to snapshot DOM:', error);
    return null;
  }
}

/**
 * Diff two DOM snapshots
 */
function diffSnapshots(options: { before: string; after: string }) {
  const before = state.snapshots.get(options.before);
  const after = state.snapshots.get(options.after);

  if (!before || !after) {
    return { error: 'Snapshot not found' };
  }

  // Simple diff implementation
  const changes: Array<{
    selector: string;
    type: 'added' | 'removed' | 'changed';
    changes?: object;
  }> = [];

  // Find removed/changed elements
  for (const [selector, beforeEl] of before.elements) {
    const afterEl = after.elements.get(selector);
    if (!afterEl) {
      changes.push({ selector, type: 'removed' });
    } else {
      const classChanges = diffArrays(beforeEl.classes, afterEl.classes);
      const sizeChanged = beforeEl.size.width !== afterEl.size.width ||
                          beforeEl.size.height !== afterEl.size.height;

      if (classChanges.added.length || classChanges.removed.length || sizeChanged) {
        changes.push({
          selector,
          type: 'changed',
          changes: {
            classes: classChanges.added.length || classChanges.removed.length ? classChanges : undefined,
            size: sizeChanged ? { before: beforeEl.size, after: afterEl.size } : undefined,
          },
        });
      }
    }
  }

  // Find added elements
  for (const [selector] of after.elements) {
    if (!before.elements.has(selector)) {
      changes.push({ selector, type: 'added' });
    }
  }

  return { before: options.before, after: options.after, changes };
}

/**
 * Diff two arrays
 */
function diffArrays(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  return {
    added: after.filter(x => !beforeSet.has(x)),
    removed: before.filter(x => !afterSet.has(x)),
  };
}

/**
 * Broadcast message to all tabs
 */
async function broadcastToAllTabs(message: object): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Tab doesn't have content script, ignore
      });
    }
  }
}

/**
 * Broadcast status to all listeners
 */
function broadcastStatus(): void {
  const status = {
    type: 'STATUS_UPDATE',
    isActive: state.isActive,
    isRecording: state.isRecording,
    isBuffering: state.isBuffering,
    mcpConnected: state.mcpConnected,
  };

  broadcastToAllTabs(status);

  // Also send to popup if open
  chrome.runtime.sendMessage(status).catch(() => {
    // Popup not open, ignore
  });
}

// Initialize on load
initialize();
