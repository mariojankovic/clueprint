/**
 * MCP Server Types
 * Mirrors extension types for communication
 */

// Intent types
export type Intent = 'fix' | 'beautify' | 'other';

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
  | 'mouse_move';

// Element capture
export interface ElementRect {
  width: number;
  height: number;
  top: number;
  left: number;
}

export interface ElementStyles {
  layout: Record<string, string>;
  size: Record<string, string>;
  spacing: Record<string, string>;
  visual: Record<string, string>;
  text?: Record<string, string>;
}

export interface ParentInfo {
  selector: string;
  tag: string;
  styles: Record<string, string>;
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

export interface BrowserContext {
  errors: ConsoleEntry[];
  networkFailures: NetworkEntry[];
  layoutShifts?: Array<{
    value: number;
    sources?: Array<{ selector: string }>;
  }>;
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
  userInstruction?: string;
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

export interface FreeSelectCapture {
  mode: 'free-select';
  intent: Intent;
  userNote?: string;
  timestamp: number;
  region: ElementRect;
  screenshot: string;
  elements: Array<{
    selector: string;
    tag: string;
    text: string;
    role: string;
    styles: Record<string, unknown>;
    hasInteractionStates: boolean;
  }>;
  structure: string;
  aestheticAnalysis?: {
    issues: string[];
    suggestions: string[];
    colorPalette: string[];
  };
  browserContext: BrowserContext;
}

export interface FlowEvent {
  time: number;
  type: EventType;
  data: Record<string, unknown>;
}

export interface FlowRecording {
  mode: 'flow';
  duration: number;
  startTime: number;
  events: FlowEvent[];
  finalSelection?: InspectCapture | FreeSelectCapture;
  summary: {
    totalEvents: number;
    clicks: number;
    inputs: number;
    scrolls: number;
    navigations: number;
    networkRequests: number;
    networkErrors: number;
    consoleErrors: number;
    layoutShifts: number;
  };
  diagnosis: {
    suspectedIssue: string;
    timeline: string;
    rootCause?: string;
  };
}

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
    lcp?: { value: number; element: string };
    cls: {
      value: number;
      shifts: Array<{ element: string; delta: number }>;
    };
    longTasks: Array<{ duration: number; startTime: number }>;
  };
  accessibility: {
    missingAltText: number;
    lowContrast: number;
    missingLabels: number;
  };
  warnings: string[];
}

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

// MCP Tool responses
export interface ToolResponse {
  content: Array<{
    type: 'text' | 'image';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
