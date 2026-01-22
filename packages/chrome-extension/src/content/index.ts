/**
 * Content Script Entry Point
 * Runs on every page to enable element selection and monitoring
 */

import { activateInspectMode, deactivateInspectMode, toggleInspectMode, initInspectMode, cleanupInspectMode, isInspectMode } from './selection/inspect-mode';
import { initFreeSelectMode, cleanupFreeSelectMode, activateFreeSelectDrag, isFreeSelectMode } from './selection/free-select';
import { startConsoleMonitoring, stopConsoleMonitoring, getConsoleErrors, getConsoleBuffer } from './monitoring/console';
import { startPerformanceMonitoring, stopPerformanceMonitoring, getPerformanceSummary } from './monitoring/performance';
import { startNetworkMonitoring, stopNetworkMonitoring, getNetworkFailures, addNetworkEntry, getNetworkBuffer } from './monitoring/network';
import { startInteractionMonitoring, stopInteractionMonitoring } from './monitoring/interactions';
import type { BrowserContext, NetworkEntry, ExtensionMessage } from '../types';

// Extension state
let isExtensionActive = false;
let isRecording = false;
let recordingIndicator: HTMLElement | null = null;
let recordingStartTime: number | null = null;
let recordingTimerInterval: number | null = null;
let floatingWidget: HTMLElement | null = null;
let widgetStateInterval: number | null = null;

/**
 * Inject Plus Jakarta Sans font for UI elements
 */
function injectFont(): void {
  if (document.getElementById('clueprint-font')) return;

  const link = document.createElement('link');
  link.id = 'clueprint-font';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap';
  document.head.appendChild(link);
}

/**
 * Initialize the extension on this page
 */
function initialize(): void {
  console.log('[Clueprint] Content script loaded');

  // Inject font for UI
  injectFont();

  // Start monitoring immediately
  startConsoleMonitoring();
  startPerformanceMonitoring();
  startNetworkMonitoring();
  startInteractionMonitoring();

  // Initialize selection modes
  initInspectMode();
  initFreeSelectMode();

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener(handleMessage);

  // Notify background that content script is ready
  chrome.runtime.sendMessage({ type: 'CONTENT_READY' }).catch(() => {
    // Background not ready yet, that's OK
  });

  // Show floating toolbar by default
  createFloatingWidget();

  isExtensionActive = true;
}

/**
 * Handle messages from background script or popup
 */
function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  switch (message.type) {
    case 'ACTIVATE_INSPECT':
      activateInspectMode();
      sendResponse({ success: true });
      break;

    case 'DEACTIVATE_INSPECT':
      deactivateInspectMode();
      sendResponse({ success: true });
      break;

    case 'TOGGLE_INSPECT':
      toggleInspectMode();
      sendResponse({ success: true });
      break;

    case 'GET_BROWSER_CONTEXT':
      sendResponse(getBrowserContext());
      break;

    case 'GET_DIAGNOSTICS':
      sendResponse(getPageDiagnostics());
      break;

    case 'GET_CONSOLE_BUFFER':
      sendResponse(getConsoleBuffer());
      break;

    case 'GET_NETWORK_BUFFER':
      sendResponse(getNetworkBuffer());
      break;

    case 'GET_PERFORMANCE':
      sendResponse(getPerformanceSummary());
      break;

    case 'NETWORK_EVENT':
      // Receive detailed network info from DevTools panel
      if (message.payload) {
        addNetworkEntry(message.payload as NetworkEntry);
      }
      sendResponse({ success: true });
      break;

    case 'PING':
      sendResponse({ success: true, active: isExtensionActive });
      break;

    case 'RECORDING_STARTED':
      showRecordingIndicator();
      sendResponse({ success: true });
      break;

    case 'RECORDING_STOPPED':
      hideRecordingIndicator();
      sendResponse({ success: true });
      break;

    case 'STATUS_UPDATE':
      // Update local recording state from background
      if (message.payload && typeof message.payload === 'object') {
        const status = message.payload as { isRecording?: boolean };
        if (status.isRecording !== undefined) {
          if (status.isRecording && !isRecording) {
            showRecordingIndicator();
          } else if (!status.isRecording && isRecording) {
            hideRecordingIndicator();
          }
        }
      }
      sendResponse({ success: true });
      break;

    case 'SHOW_WIDGET':
      createFloatingWidget();
      sendResponse({ success: true });
      break;

    case 'HIDE_WIDGET':
      if (floatingWidget) {
        floatingWidget.remove();
        floatingWidget = null;
      }
      sendResponse({ success: true });
      break;

    case 'TOGGLE_WIDGET':
      if (floatingWidget) {
        floatingWidget.remove();
        floatingWidget = null;
      } else {
        createFloatingWidget();
      }
      sendResponse({ success: true, visible: !!floatingWidget });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true; // Keep channel open for async response
}

/**
 * Get current browser context (errors + network failures)
 */
function getBrowserContext(): BrowserContext {
  return {
    errors: getConsoleErrors(),
    networkFailures: getNetworkFailures(),
  };
}

/**
 * Get full page diagnostics
 */
function getPageDiagnostics() {
  const performance = getPerformanceSummary();
  const errors = getConsoleErrors();
  const networkFailures = getNetworkFailures();

  // Check accessibility issues
  const accessibility = checkAccessibility();

  return {
    mode: 'diagnostics' as const,
    url: window.location.href,
    timestamp: Date.now(),
    errors: deduplicateErrors(errors),
    networkFailures: networkFailures.map(f => ({
      url: f.url,
      method: f.method,
      status: f.status || 0,
      statusText: f.statusText || 'Unknown',
    })),
    performance: {
      lcp: performance.lcp,
      cls: performance.cls,
      longTasks: performance.longTasks,
    },
    accessibility,
    warnings: generateWarnings(errors, networkFailures, performance),
  };
}

/**
 * Deduplicate errors with count
 */
function deduplicateErrors(errors: ReturnType<typeof getConsoleErrors>) {
  const grouped = new Map<string, { message: string; source: string; count: number }>();

  for (const error of errors) {
    const key = `${error.message}|${error.source || ''}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += error.count || 1;
    } else {
      grouped.set(key, {
        message: error.message.slice(0, 200),
        source: error.source || 'unknown',
        count: error.count || 1,
      });
    }
  }

  return Array.from(grouped.values());
}

/**
 * Check basic accessibility issues
 */
function checkAccessibility(): {
  missingAltText: number;
  lowContrast: number;
  missingLabels: number;
} {
  let missingAltText = 0;
  let missingLabels = 0;

  // Check images without alt text
  const images = document.querySelectorAll('img');
  for (const img of images) {
    if (!img.alt && !img.getAttribute('aria-label')) {
      missingAltText++;
    }
  }

  // Check form inputs without labels
  const inputs = document.querySelectorAll('input, select, textarea');
  for (const input of inputs) {
    const id = input.id;
    if (!id) {
      missingLabels++;
      continue;
    }
    const label = document.querySelector(`label[for="${id}"]`);
    if (!label && !input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')) {
      missingLabels++;
    }
  }

  return {
    missingAltText,
    lowContrast: 0, // Would need more complex analysis
    missingLabels,
  };
}

/**
 * Generate warning messages based on diagnostics
 */
function generateWarnings(
  errors: ReturnType<typeof getConsoleErrors>,
  networkFailures: ReturnType<typeof getNetworkFailures>,
  performance: ReturnType<typeof getPerformanceSummary>
): string[] {
  const warnings: string[] = [];

  if (errors.length > 5) {
    warnings.push(`${errors.length} console errors detected`);
  }

  if (networkFailures.length > 0) {
    warnings.push(`${networkFailures.length} failed network requests`);
  }

  if (performance.cls.value > 0.1) {
    warnings.push(`High CLS (${performance.cls.value.toFixed(3)}) - layout instability detected`);
  }

  if (performance.lcp && performance.lcp.value > 2500) {
    warnings.push(`Slow LCP (${(performance.lcp.value / 1000).toFixed(1)}s) - main content loading slowly`);
  }

  if (performance.longTasks.length > 3) {
    warnings.push(`${performance.longTasks.length} long tasks detected - possible jank`);
  }

  return warnings;
}

/**
 * Show recording indicator with timer
 */
function showRecordingIndicator(): void {
  if (recordingIndicator) return;

  isRecording = true;
  recordingStartTime = Date.now();

  recordingIndicator = document.createElement('div');
  recordingIndicator.id = 'ai-devtools-recording-indicator';
  recordingIndicator.innerHTML = `<span class="ai-devtools-timer">0:00</span>`;
  document.body.appendChild(recordingIndicator);

  // Update timer every second
  recordingTimerInterval = window.setInterval(() => {
    if (!recordingIndicator || !recordingStartTime) return;
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timerEl = recordingIndicator.querySelector('.ai-devtools-timer');
    if (timerEl) {
      timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }, 1000);

  // Update floating widget if exists
  updateFloatingWidgetState();
}

/**
 * Hide recording indicator
 */
function hideRecordingIndicator(): void {
  isRecording = false;
  recordingStartTime = null;

  if (recordingTimerInterval) {
    clearInterval(recordingTimerInterval);
    recordingTimerInterval = null;
  }

  if (recordingIndicator) {
    recordingIndicator.remove();
    recordingIndicator = null;
  }

  // Update floating widget if exists
  updateFloatingWidgetState();
}

/**
 * Create floating widget toolbar
 */
function createFloatingWidget(): void {
  if (floatingWidget) return;

  floatingWidget = document.createElement('div');
  floatingWidget.id = 'ai-devtools-floating-widget';
  floatingWidget.innerHTML = `
    <div class="ai-devtools-drag-handle" data-drag-handle>
      <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
        <circle cx="1" cy="1" r="1"/><circle cx="5" cy="1" r="1"/>
        <circle cx="1" cy="5" r="1"/><circle cx="5" cy="5" r="1"/>
        <circle cx="1" cy="9" r="1"/><circle cx="5" cy="9" r="1"/>
      </svg>
    </div>
    <button class="ai-devtools-widget-btn" data-action="inspect" data-tooltip="Inspect Element">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 9l5 12 1.774-5.226L21 14 9 9z"/>
        <path d="M16.071 16.071l4.243 4.243"/>
        <path d="M7.188 2.239l.777 2.897M5.136 7.965l-2.897-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"/>
      </svg>
    </button>
    <button class="ai-devtools-widget-btn" data-action="region" data-tooltip="Select Region">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/>
        <path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/>
        <path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/>
        <path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/>
        <path d="M9 9l3 8 1-3 3-1-7-4z"/>
      </svg>
    </button>
    <div class="ai-devtools-widget-divider"></div>
    <button class="ai-devtools-widget-btn ai-devtools-record-btn" data-action="record" data-tooltip="Record Flow">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="7"/>
      </svg>
    </button>
    <button class="ai-devtools-widget-btn" data-action="diagnostics" data-tooltip="Page Health">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
    </button>
    <div class="ai-devtools-widget-divider"></div>
    <button class="ai-devtools-widget-btn ai-devtools-close-btn" data-action="close" data-tooltip="Close">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>
  `;

  document.body.appendChild(floatingWidget);

  // Make it draggable
  makeDraggable(floatingWidget);

  // Add event listeners
  floatingWidget.addEventListener('click', handleWidgetClick);

  // Update state initially and periodically (to catch mode deactivations from Escape, etc.)
  updateFloatingWidgetState();
  widgetStateInterval = window.setInterval(updateFloatingWidgetState, 200);
}

/**
 * Handle widget button clicks
 */
function handleWidgetClick(e: Event): void {
  const target = e.target as HTMLElement;
  const btn = target.closest('[data-action]') as HTMLElement;
  if (!btn) return;

  const action = btn.dataset.action;
  switch (action) {
    case 'inspect':
      activateInspectMode(true); // Pass true for manual mode (click without Option key)
      break;
    case 'region':
      activateFreeSelectDrag(true); // Pass true for manual mode (drag without Cmd+Shift)
      break;
    case 'record':
      toggleRecording();
      break;
    case 'diagnostics':
      runDiagnostics();
      break;
    case 'close':
      if (widgetStateInterval) {
        clearInterval(widgetStateInterval);
        widgetStateInterval = null;
      }
      if (floatingWidget) {
        floatingWidget.remove();
        floatingWidget = null;
      }
      break;
  }
}

/**
 * Toggle recording state
 */
function toggleRecording(): void {
  if (isRecording) {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  } else {
    chrome.runtime.sendMessage({ type: 'START_RECORDING' });
  }
}

/**
 * Run diagnostics and show toast
 */
function runDiagnostics(): void {
  const diagnostics = getPageDiagnostics();
  const errorCount = diagnostics.errors.length;
  const networkCount = diagnostics.networkFailures.length;
  const warnings = diagnostics.warnings.length;

  if (errorCount === 0 && networkCount === 0 && warnings === 0) {
    showToast('Page looks healthy!', 'success');
  } else {
    showToast(`Found: ${errorCount} errors, ${networkCount} network failures`, 'warning');
  }
}

/**
 * Update floating widget to reflect current state
 */
function updateFloatingWidgetState(): void {
  if (!floatingWidget) return;

  // Hide widget during selection modes to prevent self-selection
  const selectionActive = isInspectMode() || isFreeSelectMode();
  floatingWidget.style.display = selectionActive ? 'none' : 'flex';

  // Update record button
  const recordBtn = floatingWidget.querySelector('.ai-devtools-record-btn');
  if (recordBtn) {
    if (isRecording) {
      recordBtn.classList.add('recording');
    } else {
      recordBtn.classList.remove('recording');
    }
  }

  // Update inspect button
  const inspectBtn = floatingWidget.querySelector('[data-action="inspect"]');
  if (inspectBtn) {
    if (isInspectMode()) {
      inspectBtn.classList.add('active');
    } else {
      inspectBtn.classList.remove('active');
    }
  }

  // Update region button
  const regionBtn = floatingWidget.querySelector('[data-action="region"]');
  if (regionBtn) {
    if (isFreeSelectMode()) {
      regionBtn.classList.add('active');
    } else {
      regionBtn.classList.remove('active');
    }
  }
}

/**
 * Show a toast notification using Shadow DOM for style isolation
 */
function showToast(message: string, type: 'info' | 'success' | 'warning' = 'info'): void {
  // Remove existing toast
  const existing = document.getElementById('ai-devtools-toast');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = 'ai-devtools-toast';
  host.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
  `;

  const shadow = host.attachShadow({ mode: 'closed' });

  // Type-specific accent color
  const accentColor = type === 'warning' ? '#fbbf24' : type === 'success' ? '#34d399' : '#a5b4fc';

  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
    }
    .toast {
      background: rgba(0, 0, 0, 0.96);
      color: #ffffff;
      padding: 14px 20px;
      border-radius: 16px;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(32px) saturate(200%);
      -webkit-backdrop-filter: blur(32px) saturate(200%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: slideUp 0.2s ease-out;
    }
    .toast::before {
      content: '';
      width: 8px;
      height: 8px;
      background: ${accentColor};
      border-radius: 50%;
      flex-shrink: 0;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;

  shadow.appendChild(style);
  shadow.appendChild(toast);
  document.body.appendChild(host);

  setTimeout(() => host.remove(), 2500);
}

/**
 * Make an element draggable via its drag handle
 */
function makeDraggable(element: HTMLElement): void {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  element.addEventListener('mousedown', (e: MouseEvent) => {
    // Only drag from the drag handle
    const dragHandle = (e.target as HTMLElement).closest('[data-drag-handle]');
    if (!dragHandle) return;

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    // Get the actual position on screen
    const rect = element.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    // Remove centering transform and switch to absolute positioning
    element.style.transform = 'none';
    element.style.left = `${initialLeft}px`;
    element.style.top = `${initialTop}px`;
    element.style.bottom = 'auto';

    element.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    element.style.left = `${initialLeft + deltaX}px`;
    element.style.top = `${initialTop + deltaY}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      element.style.cursor = '';
      isDragging = false;
    }
  });
}

/**
 * Cleanup on page unload
 */
function cleanup(): void {
  stopConsoleMonitoring();
  stopPerformanceMonitoring();
  stopNetworkMonitoring();
  stopInteractionMonitoring();
  cleanupFreeSelectMode();
  cleanupInspectMode();
  hideRecordingIndicator();
  if (widgetStateInterval) {
    clearInterval(widgetStateInterval);
    widgetStateInterval = null;
  }
  if (floatingWidget) {
    floatingWidget.remove();
    floatingWidget = null;
  }
  isExtensionActive = false;
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Cleanup on unload
window.addEventListener('beforeunload', cleanup);
