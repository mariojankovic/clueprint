/**
 * Shared state across MCP server instances via filesystem
 * This allows multiple MCP processes to share the same browser state
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { InspectCapture, FreeSelectCapture, FlowRecording } from './types/index.js';

const STATE_DIR = join(tmpdir(), 'ai-browser-devtools');
const SELECTION_FILE = join(STATE_DIR, 'current-selection.json');
const RECORDING_FILE = join(STATE_DIR, 'current-recording.json');
const RECORDING_STATE_FILE = join(STATE_DIR, 'is-recording.json');
const CONNECTION_STATE_FILE = join(STATE_DIR, 'connection.json');

// Ensure state directory exists
if (!existsSync(STATE_DIR)) {
  mkdirSync(STATE_DIR, { recursive: true });
}

export function saveSelection(selection: InspectCapture | FreeSelectCapture | null): void {
  try {
    if (selection === null) {
      writeFileSync(SELECTION_FILE, JSON.stringify(null));
    } else {
      writeFileSync(SELECTION_FILE, JSON.stringify(selection));
    }
  } catch (error) {
    console.error('[SharedState] Failed to save selection:', error);
  }
}

export function loadSelection(): InspectCapture | FreeSelectCapture | null {
  try {
    if (!existsSync(SELECTION_FILE)) {
      return null;
    }
    const data = readFileSync(SELECTION_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[SharedState] Failed to load selection:', error);
    return null;
  }
}

export function saveRecording(recording: FlowRecording | null): void {
  try {
    if (recording === null) {
      writeFileSync(RECORDING_FILE, JSON.stringify(null));
    } else {
      writeFileSync(RECORDING_FILE, JSON.stringify(recording));
    }
  } catch (error) {
    console.error('[SharedState] Failed to save recording:', error);
  }
}

export function loadRecording(): FlowRecording | null {
  try {
    if (!existsSync(RECORDING_FILE)) {
      return null;
    }
    const data = readFileSync(RECORDING_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[SharedState] Failed to load recording:', error);
    return null;
  }
}

export function saveRecordingState(isRecording: boolean): void {
  try {
    writeFileSync(RECORDING_STATE_FILE, JSON.stringify({ isRecording }));
  } catch (error) {
    console.error('[SharedState] Failed to save recording state:', error);
  }
}

export function loadRecordingState(): boolean {
  try {
    if (!existsSync(RECORDING_STATE_FILE)) {
      return false;
    }
    const data = readFileSync(RECORDING_STATE_FILE, 'utf-8');
    const state = JSON.parse(data);
    return state.isRecording || false;
  } catch (error) {
    console.error('[SharedState] Failed to load recording state:', error);
    return false;
  }
}

export function saveConnectionState(connected: boolean): void {
  try {
    writeFileSync(CONNECTION_STATE_FILE, JSON.stringify({
      connected,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('[SharedState] Failed to save connection state:', error);
  }
}

export function loadConnectionState(): boolean {
  try {
    if (!existsSync(CONNECTION_STATE_FILE)) {
      return false;
    }
    const data = readFileSync(CONNECTION_STATE_FILE, 'utf-8');
    const state = JSON.parse(data);
    // Consider stale if older than 60 seconds (missed heartbeats)
    const age = Date.now() - (state.timestamp || 0);
    if (age > 60000) {
      return false;
    }
    return state.connected || false;
  } catch (error) {
    console.error('[SharedState] Failed to load connection state:', error);
    return false;
  }
}
