/**
 * Console interception and error monitoring
 */

import type { ConsoleEntry } from '../../types';

// Store original console methods
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

// Console buffer with max size
const MAX_BUFFER_SIZE = 100;
const consoleBuffer: ConsoleEntry[] = [];

// Whether interception is active
let isIntercepting = false;

/**
 * Format console arguments to string
 */
function formatArgs(args: unknown[]): string {
  return args.map(arg => {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    try {
      return JSON.stringify(arg, null, 2);
    } catch {
      return String(arg);
    }
  }).join(' ');
}

/**
 * Get stack trace (first 3 meaningful lines)
 */
function getStackTrace(): string | undefined {
  const error = new Error();
  const stack = error.stack;
  if (!stack) return undefined;

  const lines = stack.split('\n').slice(3); // Skip Error, getStackTrace, and intercept wrapper
  const meaningful = lines
    .filter(line => !line.includes('console.ts')) // Skip our own code
    .slice(0, 3)
    .join('\n');

  return meaningful || undefined;
}

/**
 * Parse source from stack trace
 */
function parseSource(stack?: string): string | undefined {
  if (!stack) return undefined;

  // Match patterns like "at Component (file.js:42:10)" or "file.js:42"
  const match = stack.match(/(?:at\s+)?(?:.*?\s+\()?(.*?):(\d+)(?::\d+)?(?:\))?/);
  if (match) {
    const file = match[1].split('/').pop() || match[1];
    return `${file}:${match[2]}`;
  }

  return undefined;
}

/**
 * Send console event to background for recording
 */
function sendToRecording(entry: ConsoleEntry): void {
  // Send the ConsoleEntry directly - background expects this format
  chrome.runtime.sendMessage({
    type: 'CONSOLE_EVENT',
    payload: entry
  }).catch(() => {
    // Background not available, ignore
  });
}

/**
 * Add entry to buffer (with deduplication and size limit)
 */
function addToBuffer(entry: ConsoleEntry): void {
  // Check for duplicate (same message in last 5 entries)
  const recent = consoleBuffer.slice(-5);
  const duplicate = recent.find(e => e.message === entry.message && e.type === entry.type);

  if (duplicate) {
    duplicate.count = (duplicate.count || 1) + 1;
    return;
  }

  // Add new entry
  consoleBuffer.push(entry);

  // Send to background for recording (errors and warnings only to avoid noise)
  if (entry.type === 'error' || entry.type === 'warn') {
    sendToRecording(entry);
  }

  // Enforce max size
  while (consoleBuffer.length > MAX_BUFFER_SIZE) {
    consoleBuffer.shift();
  }
}

/**
 * Intercept console methods
 */
function interceptConsole(): void {
  console.log = (...args: unknown[]) => {
    addToBuffer({
      type: 'log',
      message: formatArgs(args),
      timestamp: Date.now(),
    });
    originalConsole.log(...args);
  };

  console.warn = (...args: unknown[]) => {
    const stack = getStackTrace();
    addToBuffer({
      type: 'warn',
      message: formatArgs(args),
      stack,
      source: parseSource(stack),
      timestamp: Date.now(),
    });
    originalConsole.warn(...args);
  };

  console.error = (...args: unknown[]) => {
    const stack = getStackTrace();
    addToBuffer({
      type: 'error',
      message: formatArgs(args),
      stack,
      source: parseSource(stack),
      timestamp: Date.now(),
    });
    originalConsole.error(...args);
  };
}

/**
 * Restore original console methods
 */
function restoreConsole(): void {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}

/**
 * Handle global errors
 */
function handleError(event: ErrorEvent): void {
  const source = event.filename
    ? `${event.filename.split('/').pop()}:${event.lineno}:${event.colno}`
    : undefined;

  addToBuffer({
    type: 'error',
    message: event.message,
    stack: event.error?.stack?.split('\n').slice(0, 3).join('\n'),
    source,
    timestamp: Date.now(),
  });
}

/**
 * Handle unhandled promise rejections
 */
function handleRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason;
  const message = reason instanceof Error
    ? `Unhandled Promise: ${reason.message}`
    : `Unhandled Promise: ${String(reason)}`;

  addToBuffer({
    type: 'error',
    message,
    stack: reason?.stack?.split('\n').slice(0, 3).join('\n'),
    timestamp: Date.now(),
  });
}

/**
 * Start console monitoring
 */
export function startConsoleMonitoring(): void {
  if (isIntercepting) return;

  isIntercepting = true;
  interceptConsole();

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  console.log('[AI DevTools] Console monitoring started');
}

/**
 * Stop console monitoring
 */
export function stopConsoleMonitoring(): void {
  if (!isIntercepting) return;

  isIntercepting = false;
  restoreConsole();

  window.removeEventListener('error', handleError);
  window.removeEventListener('unhandledrejection', handleRejection);
}

/**
 * Get console buffer (all entries)
 */
export function getConsoleBuffer(): ConsoleEntry[] {
  return [...consoleBuffer];
}

/**
 * Get only error entries
 */
export function getConsoleErrors(): ConsoleEntry[] {
  return consoleBuffer.filter(entry => entry.type === 'error');
}

/**
 * Get only warning entries
 */
export function getConsoleWarnings(): ConsoleEntry[] {
  return consoleBuffer.filter(entry => entry.type === 'warn');
}

/**
 * Clear console buffer
 */
export function clearConsoleBuffer(): void {
  consoleBuffer.length = 0;
}

/**
 * Get deduplicated errors with counts
 */
export function getDeduplicatedErrors(): Array<{ message: string; source: string; count: number }> {
  const errors = getConsoleErrors();
  const grouped = new Map<string, { message: string; source: string; count: number }>();

  for (const error of errors) {
    const key = `${error.message}|${error.source || ''}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += error.count || 1;
    } else {
      grouped.set(key, {
        message: error.message,
        source: error.source || 'unknown',
        count: error.count || 1,
      });
    }
  }

  return Array.from(grouped.values());
}
