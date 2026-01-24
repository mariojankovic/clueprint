/**
 * Content Script Entry Point
 * Runs on every page to enable element selection and monitoring
 */

import { mount, unmount } from 'svelte';
import { activateInspectMode, deactivateInspectMode, toggleInspectMode, initInspectMode, cleanupInspectMode, isInspectMode } from './selection/inspect-mode';
import { initFreeSelectMode, cleanupFreeSelectMode, activateFreeSelectDrag, deactivateFreeSelectDrag, toggleFreeSelectDrag, isFreeSelectMode } from './selection/free-select';
import { startConsoleMonitoring, stopConsoleMonitoring, getConsoleErrors, getConsoleBuffer } from './monitoring/console';
import { startPerformanceMonitoring, stopPerformanceMonitoring, getPerformanceSummary } from './monitoring/performance';
import { startNetworkMonitoring, stopNetworkMonitoring, getNetworkFailures, addNetworkEntry, getNetworkBuffer } from './monitoring/network';
import { startInteractionMonitoring, stopInteractionMonitoring } from './monitoring/interactions';
import FloatingWidget from '../shared/components/FloatingWidget.svelte';
import { DEFAULT_SETTINGS } from '../types';
import type { BrowserContext, NetworkEntry, ExtensionMessage } from '../types';

// Extension state
let isExtensionActive = false;
let isRecording = false;
let isBuffering = false;
let recordingIndicator: HTMLElement | null = null;
let recordingStartTime: number | null = null;
let recordingTimerInterval: number | null = null;
let floatingWidget: HTMLElement | null = null;
let widgetStateInterval: number | null = null;
let lastWidgetRecordingState = false;
let lastWidgetBufferingState = false;
let widgetHiddenForSelection = false;

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

  // Direct shortcut: Cmd+Shift+X for region select (bypass Chrome command system)
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      event.stopPropagation();
      if (isInspectMode()) deactivateInspectMode();
      toggleFreeSelectDrag();
    }
  }, true);

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener(handleMessage);

  // Notify background that content script is ready
  chrome.runtime.sendMessage({ type: 'CONTENT_READY' }).catch(() => {
    // Background not ready yet, that's OK
  });

  // Fetch initial state from background
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }).then((response: any) => {
    if (response?.isBuffering !== undefined) {
      isBuffering = response.isBuffering;
    }
  }).catch(() => {});

  // Show floating toolbar based on saved preference + domain allowlist
  chrome.storage.local.get(['widgetVisible', 'allowedDomains']).then(({ widgetVisible, allowedDomains }) => {
    if (widgetVisible === false) return;

    // Check domain allowlist (empty array = all sites allowed)
    const domains: string[] = allowedDomains ?? DEFAULT_SETTINGS.allowedDomains;
    if (domains.length > 0 && !isDomainAllowed(window.location.hostname, domains)) {
      return; // Don't show widget on non-allowed domains
    }

    createFloatingWidget();
  }).catch(() => {
    // On error, only show on localhost by default
    if (isDomainAllowed(window.location.hostname, DEFAULT_SETTINGS.allowedDomains)) {
      createFloatingWidget();
    }
  });

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
      if (isFreeSelectMode()) deactivateFreeSelectDrag();
      toggleInspectMode();
      sendResponse({ success: true });
      break;

    case 'TOGGLE_REGION':
      if (isInspectMode()) deactivateInspectMode();
      toggleFreeSelectDrag();
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
      // Update local state from background
      if (message.payload && typeof message.payload === 'object') {
        const status = message.payload as { isRecording?: boolean; isBuffering?: boolean };
        if (status.isRecording !== undefined) {
          if (status.isRecording && !isRecording) {
            showRecordingIndicator();
          } else if (!status.isRecording && isRecording) {
            hideRecordingIndicator();
          }
        }
        if (status.isBuffering !== undefined) {
          isBuffering = status.isBuffering;
          updateFloatingWidgetState();
        }
      }
      sendResponse({ success: true });
      break;

    case 'SHOW_WIDGET':
      createFloatingWidget();
      chrome.storage.local.set({ widgetVisible: true });
      sendResponse({ success: true, visible: true });
      break;

    case 'HIDE_WIDGET':
      closeWidget();
      chrome.storage.local.set({ widgetVisible: false });
      sendResponse({ success: true, visible: false });
      break;

    case 'TOGGLE_WIDGET':
      if (floatingWidget) {
        closeWidget();
      } else {
        createFloatingWidget();
      }
      chrome.storage.local.set({ widgetVisible: !!floatingWidget });
      sendResponse({ success: true, visible: !!floatingWidget });
      break;

    case 'GET_WIDGET_STATE':
      sendResponse({ visible: !!floatingWidget });
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
 * Create floating widget toolbar using Shadow DOM for style isolation
 */
function createFloatingWidget(): void {
  if (floatingWidget) return;

  // Create host element
  floatingWidget = document.createElement('div');
  floatingWidget.id = 'ai-devtools-widget-host';
  floatingWidget.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483646;';

  const shadow = floatingWidget.attachShadow({ mode: 'closed' });

  // Minimal styles for Shadow DOM reset
  const style = document.createElement('style');
  style.textContent = ':host { all: initial; }';
  shadow.appendChild(style);

  // Create mount target
  const target = document.createElement('div');
  shadow.appendChild(target);

  // Mount Svelte component
  const widgetInstance = mount(FloatingWidget, {
    target,
    props: {
      isRecording,
      isBuffering,
      isInspectActive: isInspectMode(),
      isRegionActive: isFreeSelectMode(),
      onInspect: () => activateInspectMode(true),
      onRegion: () => activateFreeSelectDrag(),
      onStartRecording: () => chrome.runtime.sendMessage({ type: 'START_RECORDING' }),
      onStopRecording: () => chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }),
      onSendBuffer: () => chrome.runtime.sendMessage({ type: 'SEND_BUFFER' }),
      onClose: () => { closeWidget(); chrome.storage.local.set({ widgetVisible: false }); },
    },
  });

  document.body.appendChild(floatingWidget);

  // Make it draggable
  makeDraggable(floatingWidget, target);

  // Store instance for updates
  (floatingWidget as any)._instance = widgetInstance;
  (floatingWidget as any)._target = target;

  // Update state periodically
  updateFloatingWidgetState();
  widgetStateInterval = window.setInterval(updateFloatingWidgetState, 200);
}

/**
 * Close the floating widget with exit animation
 */
function closeWidget(): void {
  widgetHiddenForSelection = false;
  if (widgetStateInterval) {
    clearInterval(widgetStateInterval);
    widgetStateInterval = null;
  }
  if (floatingWidget) {
    const target = (floatingWidget as any)._target as HTMLElement | undefined;
    const widgetDiv = target?.querySelector('[class*="widget-enter"], [class*="widget-exit"]') as HTMLElement | null;

    if (widgetDiv) {
      widgetDiv.classList.remove('widget-enter');
      widgetDiv.classList.add('widget-exit');
      const widget = floatingWidget;
      setTimeout(() => {
        const instance = (widget as any)._instance;
        if (instance) unmount(instance);
        widget.remove();
      }, 250);
    } else {
      const instance = (floatingWidget as any)._instance;
      if (instance) unmount(instance);
      floatingWidget.remove();
    }
    floatingWidget = null;
  }
}

/**
 * Update floating widget to reflect current state
 */
function updateFloatingWidgetState(): void {
  if (!floatingWidget) return;

  const widgetTarget = (floatingWidget as any)._target as HTMLElement | undefined;
  const widgetDiv = widgetTarget?.querySelector('[class*="widget-enter"], [class*="widget-exit"]') as HTMLElement | null
    ?? widgetTarget?.firstElementChild as HTMLElement | null;

  // Animate widget hide/show during selection modes
  const selectionActive = isInspectMode() || isFreeSelectMode();
  if (selectionActive && !widgetHiddenForSelection) {
    widgetHiddenForSelection = true;
    if (widgetDiv) {
      widgetDiv.classList.remove('widget-enter');
      widgetDiv.classList.add('widget-exit');
    }
    setTimeout(() => {
      if (floatingWidget) {
        floatingWidget.style.pointerEvents = 'none';
        floatingWidget.style.visibility = 'hidden';
      }
    }, 250);
  } else if (!selectionActive && widgetHiddenForSelection) {
    widgetHiddenForSelection = false;
    floatingWidget.style.pointerEvents = '';
    floatingWidget.style.visibility = '';
    if (widgetDiv) {
      widgetDiv.classList.remove('widget-exit');
      widgetDiv.classList.add('widget-enter');
    }
  }

  // Only remount if recording or buffering state changed
  if (isRecording === lastWidgetRecordingState && isBuffering === lastWidgetBufferingState) return;
  lastWidgetRecordingState = isRecording;
  lastWidgetBufferingState = isBuffering;

  const target = (floatingWidget as any)._target as HTMLElement | undefined;
  const oldInstance = (floatingWidget as any)._instance;
  if (!target || !oldInstance) return;

  // Remount with updated props
  unmount(oldInstance);
  const newInstance = mount(FloatingWidget, {
    target,
    props: {
      isRecording,
      isBuffering,
      isInspectActive: isInspectMode(),
      isRegionActive: isFreeSelectMode(),
      onInspect: () => activateInspectMode(true),
      onRegion: () => activateFreeSelectDrag(),
      onStartRecording: () => chrome.runtime.sendMessage({ type: 'START_RECORDING' }),
      onStopRecording: () => chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }),
      onSendBuffer: () => chrome.runtime.sendMessage({ type: 'SEND_BUFFER' }),
      onClose: () => { closeWidget(); chrome.storage.local.set({ widgetVisible: false }); },
    },
  });
  (floatingWidget as any)._instance = newInstance;
}

/**
 * Make an element draggable via its drag handle
 * @param element - The element to move (host element)
 * @param handleContainer - Optional container to listen for drag handle (for Shadow DOM)
 */
function makeDraggable(element: HTMLElement, handleContainer?: HTMLElement): void {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const target = handleContainer || element;
  target.addEventListener('mousedown', (e: MouseEvent) => {
    // Only drag from the drag handle
    const dragHandle = (e.target as HTMLElement).closest('[data-drag-handle]');
    if (!dragHandle) return;

    isDragging = true;

    // Get element's current position
    const rect = element.getBoundingClientRect();

    // Calculate offset from mouse to element's top-left corner
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    // Lock the width before changing positioning
    element.style.width = `${rect.width}px`;

    // Switch to absolute positioning from top-left
    element.style.transform = 'none';
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.bottom = 'auto';

    element.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging) return;

    // Position element so mouse stays at same relative position
    element.style.left = `${e.clientX - offsetX}px`;
    element.style.top = `${e.clientY - offsetY}px`;
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
  closeWidget();
  isExtensionActive = false;
}

/**
 * Check if a hostname matches the allowed domains list.
 * Supports exact match and wildcard prefix (*.example.com).
 */
function isDomainAllowed(hostname: string, allowedDomains: string[]): boolean {
  for (const domain of allowedDomains) {
    if (domain.startsWith('*.')) {
      // Wildcard: *.vercel.app matches foo.vercel.app
      const suffix = domain.slice(1); // .vercel.app
      if (hostname.endsWith(suffix) || hostname === domain.slice(2)) {
        return true;
      }
    } else {
      if (hostname === domain) return true;
    }
  }
  return false;
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Cleanup on unload
window.addEventListener('beforeunload', cleanup);
