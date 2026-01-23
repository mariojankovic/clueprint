// =============================================================================
// Core Types for AI Browser DevTools
// =============================================================================

// Intent types for element/region selection
export type Intent = 'tag' | 'fix' | 'beautify' | 'other';

// Event types for flow recording
export type EventType =
  | 'refresh'
  | 'navigation'
  | 'click'
  | 'input'
  | 'scroll'
  | 'network_request'
  | 'network_response'
  | 'network_error'
  | 'console_log'
  | 'console_warn'
  | 'console_error'
  | 'dom_mutation'
  | 'layout_shift'
  | 'element_select'
  | 'form_submit'
  | 'keypress'
  | 'mouse_move'
  | 'clipboard'
  | 'selection'
  | 'focus'
  | 'blur';

// =============================================================================
// Element Capture Types
// =============================================================================

export interface ElementRect {
  width: number;
  height: number;
  top: number;
  left: number;
}

export interface LayoutStyles {
  display: string;
  position: string;
  float?: string;
  flex?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  grid?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gap?: string;
}

export interface SizeStyles {
  width: string;
  height: string;
  minWidth?: string;
  maxWidth?: string;
  minHeight?: string;
  maxHeight?: string;
}

export interface SpacingStyles {
  margin: string;
  padding: string;
  boxSizing: string;
}

export interface VisualStyles {
  background: string;
  backgroundColor?: string;
  border: string;
  borderRadius: string;
  boxShadow?: string;
  opacity: string;
}

export interface TextStyles {
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  color: string;
  fontFamily?: string;
}

export interface ElementStyles {
  layout: LayoutStyles;
  size: SizeStyles;
  spacing: SpacingStyles;
  visual: VisualStyles;
  text?: TextStyles;
}

export interface ParentInfo {
  selector: string;
  tag: string;
  styles: Partial<LayoutStyles>;
}

export interface SiblingInfo {
  selector: string;
  size: { width: number; height: number };
  classes: string[];
  isSelected: boolean;
  anomaly?: string;
}

export interface CSSRule {
  source: string;
  selector: string;
  properties: Record<string, string>;
  isOverriding?: boolean;
}

// =============================================================================
// Console & Network Types
// =============================================================================

export interface ConsoleEntry {
  type: 'log' | 'warn' | 'error';
  message: string;
  stack?: string;
  source?: string;
  timestamp: number;
  count?: number;
}

export interface NetworkEntry {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  duration?: number;
  transferSize?: number;
  initiatorType?: string;
  initiator?: string;
  responseBody?: string;
  timestamp: number;
}

// =============================================================================
// Performance Types
// =============================================================================

export interface CLSEntry {
  value: number;
  sources?: Array<{
    selector: string;
    previousRect: DOMRectReadOnly;
    currentRect: DOMRectReadOnly;
  }>;
  timestamp: number;
}

export interface LCPEntry {
  value: number;
  element: string;
}

export interface LongTask {
  duration: number;
  startTime: number;
  source?: string;
}

// =============================================================================
// Capture Result Types
// =============================================================================

export interface BrowserContext {
  errors: ConsoleEntry[];
  networkFailures: NetworkEntry[];
  layoutShifts?: CLSEntry[];
}

export interface Diagnosis {
  suspected: string[];
  unusual: string[];
  relatedErrors: string[];
}

export interface InspectCapture {
  mode: 'inspect';
  intent: Intent;
  timestamp: number;
  element: {
    selector: string;
    tag: string;
    id?: string;
    classes: string[];
    text: string;
    attributes: Record<string, string>;
    rect: ElementRect;
    styles: ElementStyles;
  };

  parent: ParentInfo;
  siblings: SiblingInfo[];
  cssRules: CSSRule[];
  browserContext: BrowserContext;
  diagnosis: Diagnosis;
  screenshot?: string;
}

export interface AestheticStyles {
  colors: string[];
  typography: Partial<TextStyles>;
  spacing: Partial<SpacingStyles>;
  borderRadius?: string;
}

export interface RegionElement {
  selector: string;
  tag: string;
  text: string;
  role: string;
  styles: AestheticStyles;
  hasInteractionStates: boolean;
}

export interface AestheticAnalysis {
  issues: string[];
  suggestions: string[];
  colorPalette: string[];
}

export interface FreeSelectCapture {
  mode: 'free-select';
  intent: Intent;
  timestamp: number;

  region: ElementRect;
  screenshot: string;
  elements: RegionElement[];
  structure: string;
  aestheticAnalysis?: AestheticAnalysis;
  browserContext: BrowserContext;
}

// =============================================================================
// Flow Recording Types
// =============================================================================

export interface FlowEvent {
  time: number;
  type: EventType;
  data: Record<string, unknown>;
}

export interface NetworkEvent extends FlowEvent {
  type: 'network_request' | 'network_response' | 'network_error';
  data: {
    url: string;
    method: string;
    status?: number;
    statusText?: string;
    duration?: number;
    responseBody?: string;
    initiator?: string;
  };
}

export interface ClickEvent extends FlowEvent {
  type: 'click';
  data: {
    selector: string;
    text: string;
    result?: 'navigation' | 'modal_opened' | 'state_change' | 'nothing';
  };
}

export interface ConsoleEvent extends FlowEvent {
  type: 'console_log' | 'console_warn' | 'console_error';
  data: {
    message: string;
    stack?: string;
    source?: string;
  };
}

export interface FlowSummary {
  totalEvents: number;
  clicks: number;
  inputs: number;
  scrolls: number;
  navigations: number;
  networkRequests: number;
  networkErrors: number;
  consoleErrors: number;
  layoutShifts: number;
}

export interface FlowDiagnosis {
  suspectedIssue: string;
  timeline: string;
  rootCause?: string;
}

export interface FlowRecording {
  mode: 'flow';
  duration: number;
  startTime: number;
  events: FlowEvent[];
  finalSelection?: InspectCapture | FreeSelectCapture;
  summary: FlowSummary;
  diagnosis: FlowDiagnosis;
}

// =============================================================================
// Page Diagnostics Types
// =============================================================================

export interface PageDiagnostics {
  mode: 'diagnostics';
  url: string;
  timestamp: number;

  errors: Array<{
    message: string;
    source: string;
    count: number;
  }>;

  networkFailures: Array<{
    url: string;
    method: string;
    status: number;
    statusText: string;
  }>;

  performance: {
    lcp?: LCPEntry;
    cls: {
      value: number;
      shifts: Array<{ element: string; delta: number }>;
    };
    longTasks: LongTask[];
  };

  accessibility: {
    missingAltText: number;
    lowContrast: number;
    missingLabels: number;
  };

  warnings: string[];
}

// =============================================================================
// DOM Snapshot Types
// =============================================================================

export interface DOMSnapshot {
  id: string;
  timestamp: number;
  url: string;
  selector?: string;
  elements: Map<string, {
    selector: string;
    classes: string[];
    size: { width: number; height: number };
    inlineStyles: string;
  }>;
}

export interface DOMDiff {
  before: string;
  after: string;
  changes: Array<{
    selector: string;
    type: 'added' | 'removed' | 'changed';
    changes?: {
      classes?: { added: string[]; removed: string[] };
      size?: { before: { width: number; height: number }; after: { width: number; height: number } };
      styles?: Array<{ property: string; before: string; after: string }>;
    };
  }>;
}

// =============================================================================
// Message Types (for Chrome extension messaging)
// =============================================================================

export type MessageType =
  | 'INSPECT_ELEMENT'
  | 'FREE_SELECT_REGION'
  | 'GET_SELECTION'
  | 'GET_DIAGNOSTICS'
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'GET_RECORDING'
  | 'SNAPSHOT_DOM'
  | 'NETWORK_EVENT'
  | 'CONSOLE_EVENT'
  | 'EXTENSION_STATUS'
  | 'CONNECT_MCP'
  | 'TOGGLE_INSPECT'
  | 'TOGGLE_REGION'
  | 'ACTIVATE_INSPECT'
  | 'DEACTIVATE_INSPECT'
  | 'SHOW_WIDGET'
  | 'HIDE_WIDGET'
  | 'TOGGLE_WIDGET'
  | 'GET_WIDGET_STATE'
  | 'GET_CONSOLE_BUFFER'
  | 'GET_NETWORK_BUFFER'
  | 'GET_PERFORMANCE'
  | 'PING'
  | 'RECORDING_STARTED'
  | 'RECORDING_STOPPED'
  | 'TOGGLE_BUFFER'
  | 'SEND_BUFFER'
  | 'GET_RECENT_ACTIVITY'
  | 'STATUS_UPDATE';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

// =============================================================================
// Extension State
// =============================================================================

export interface ExtensionState {
  isActive: boolean;
  isRecording: boolean;
  isBuffering: boolean;
  currentSelection: InspectCapture | FreeSelectCapture | null;
  currentRecording: FlowRecording | null;
  snapshots: Map<string, DOMSnapshot>;
  consoleBuffer: ConsoleEntry[];
  networkBuffer: NetworkEntry[];
  mcpConnected: boolean;
}

// =============================================================================
// Settings Types
// =============================================================================

export interface ExtensionSettings {
  inspectShortcut: string;
  freeSelectShortcut: string;
  captureConsole: boolean;
  captureNetwork: boolean;
  capturePerformance: boolean;
  maxConsoleEntries: number;
  maxNetworkEntries: number;
  cssDetailLevel: 0 | 1 | 2 | 3;
  screenshotQuality: number;
  screenshotMaxWidth: number;
  serverPort: number;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  inspectShortcut: 'Alt+Click',
  freeSelectShortcut: 'Ctrl+Shift+Drag',
  captureConsole: true,
  captureNetwork: true,
  capturePerformance: true,
  maxConsoleEntries: 50,
  maxNetworkEntries: 50,
  cssDetailLevel: 1,
  screenshotQuality: 0.7,
  screenshotMaxWidth: 800,
  serverPort: 7007,
};
