/**
 * Content Script Entry Point
 * Runs on every page to enable element selection and monitoring
 */

import { mount, unmount } from 'svelte';
import { activateInspectMode, deactivateInspectMode, initInspectMode, cleanupInspectMode, isInspectMode } from './selection/inspect-mode';
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
let recordingStartTime: number | null = null;
let floatingWidget: HTMLElement | null = null;
let widgetStateInterval: number | null = null;

// Widget state tracking (to avoid unnecessary remounts)
let lastWidgetRecordingState = false;
let lastWidgetBufferingState = false;
let lastWidgetSelectState = false;
let lastWidgetCollapsedState = false;
let lastWidgetCollapsedEdge: 'left' | 'right' | 'top' | 'bottom' | null = null;
let lastWidgetDraggingState = false;
let lastWidgetSkipAnimationState = false;
let lastWidgetToastMessage = '';

// Pending toast message for the widget
let widgetToastMessage = '';

// Drag state (accessible to widget)
let isWidgetDragging = false;
// Skip animation flag - persists briefly after drag ends to prevent entrance animation
let skipWidgetAnimation = false;
// Track the last visual state to determine if animation should play on transitions
type VisualState = 'recording' | 'toast' | 'select' | 'default' | 'collapsed';
let lastVisualState: VisualState | null = null;

/**
 * Get the current visual state of the widget
 */
function getVisualState(): VisualState {
  if (widgetCollapsed) return 'collapsed';
  if (isRecording) return 'recording';
  if (widgetToastMessage) return 'toast';
  if (isInspectMode() || isFreeSelectMode()) return 'select';
  return 'default';
}

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

  // Keyboard shortcut (Cmd+Shift+X) is handled via Chrome's commands API
  // in the background script. Users can customize it at chrome://extensions/shortcuts

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
        chrome.storage.local.set({ widgetVisible: false });
        sendResponse({ success: true, visible: false });
      } else {
        createFloatingWidget();
        chrome.storage.local.set({ widgetVisible: true });
        sendResponse({ success: true, visible: true });
      }
      break;

    case 'GET_WIDGET_STATE':
      sendResponse({ visible: !!floatingWidget });
      break;

    case 'SHOW_CAPTURE_TOAST':
      if (message.payload && typeof message.payload === 'object') {
        const { command } = message.payload as { command: string };
        if (command) {
          // Copy to clipboard
          navigator.clipboard.writeText(command).then(() => {
            // Show toast in floating widget
            showWidgetToast('Copied to clipboard');
          }).catch(() => {
            showWidgetToast('Capture complete');
          });
        }
      }
      sendResponse({ success: true });
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
 * Show recording state (timer is handled by floating widget)
 */
function showRecordingIndicator(): void {
  if (isRecording) return;

  isRecording = true;
  recordingStartTime = Date.now();

  // Update floating widget to show recording UI
  updateFloatingWidgetState();
}

/**
 * Hide recording state
 */
function hideRecordingIndicator(): void {
  isRecording = false;
  recordingStartTime = null;

  // Update floating widget to show normal UI
  updateFloatingWidgetState();
}

/**
 * Widget position stored as percentage from edges for responsive positioning
 */
interface WidgetPosition {
  // Position as percentage (0-100) from top-left
  xPercent: number;
  yPercent: number;
  // Collapsed state
  collapsed: boolean;
  collapsedEdge: 'left' | 'right' | 'top' | 'bottom' | null;
}

const EDGE_MARGIN = 24; // px from viewport edge
const COLLAPSE_THRESHOLD = 40; // px - how close to edge to show collapse preview
const SNAP_THRESHOLD = -10; // px - how far off-screen to actually collapse

// Widget state
let widgetCollapsed = false;
let widgetCollapsedEdge: 'left' | 'right' | 'top' | 'bottom' | null = null;

/**
 * Apply position from percentage coordinates
 */
function applyWidgetPosition(element: HTMLElement, pos: WidgetPosition): void {
  element.style.top = 'auto';
  element.style.bottom = 'auto';
  element.style.left = 'auto';
  element.style.right = 'auto';
  element.style.transform = 'none';
  element.style.width = 'auto';
  element.style.opacity = '1';

  if (pos.collapsed && pos.collapsedEdge) {
    // Collapsed to edge
    if (pos.collapsedEdge === 'left' || pos.collapsedEdge === 'right') {
      const yPx = (pos.yPercent / 100) * window.innerHeight;
      element.style.top = `${Math.max(EDGE_MARGIN, Math.min(window.innerHeight - 60, yPx))}px`;
      if (pos.collapsedEdge === 'left') {
        element.style.left = '0px';
      } else {
        element.style.right = '0px';
      }
    } else {
      // Top or bottom
      const xPx = (pos.xPercent / 100) * window.innerWidth;
      element.style.left = `${xPx}px`;
      element.style.transform = 'translateX(-50%)';
      if (pos.collapsedEdge === 'top') {
        element.style.top = '0px';
      } else {
        element.style.bottom = '0px';
      }
    }
  } else {
    // Normal position
    const xPx = (pos.xPercent / 100) * window.innerWidth;
    const yPx = (pos.yPercent / 100) * window.innerHeight;
    element.style.left = `${xPx}px`;
    element.style.top = `${yPx}px`;
    element.style.transform = 'translateX(-50%)'; // Center on position
  }
}

/**
 * Get default widget position (bottom center)
 */
function getDefaultPosition(): WidgetPosition {
  return {
    xPercent: 50,
    yPercent: 92,
    collapsed: false,
    collapsedEdge: null,
  };
}

/**
 * Expand widget from collapsed state
 */
function expandWidget(): void {
  if (!floatingWidget) return;

  const previousEdge = widgetCollapsedEdge;
  widgetCollapsed = false;
  widgetCollapsedEdge = null;

  // Get current position and restore appropriately based on which edge it was collapsed to
  chrome.storage.local.get('widgetPosition').then((stored) => {
    const pos = (stored.widgetPosition as WidgetPosition) || getDefaultPosition();
    pos.collapsed = false;
    pos.collapsedEdge = null;

    // Restore position based on previous edge
    if (previousEdge === 'left' || previousEdge === 'right') {
      pos.xPercent = 50; // Restore to center horizontally
    } else if (previousEdge === 'top' || previousEdge === 'bottom') {
      pos.yPercent = previousEdge === 'top' ? 15 : 85; // Move away from edge
    }

    applyWidgetPosition(floatingWidget!, pos);
    chrome.storage.local.set({ widgetPosition: pos });
    updateFloatingWidgetState();
  });
}

/**
 * Create floating widget toolbar using Shadow DOM for style isolation
 */
async function createFloatingWidget(): Promise<void> {
  if (floatingWidget) return;

  // Get saved position or default
  let savedPosition = getDefaultPosition();
  try {
    const stored = await chrome.storage.local.get('widgetPosition');
    if (stored.widgetPosition) {
      savedPosition = stored.widgetPosition as WidgetPosition;
    }
  } catch {
    // Use default
  }

  // Apply collapsed state
  widgetCollapsed = savedPosition.collapsed;
  widgetCollapsedEdge = savedPosition.collapsedEdge;

  // Create host element
  floatingWidget = document.createElement('div');
  floatingWidget.id = 'ai-devtools-widget-host';
  floatingWidget.style.cssText = 'position:fixed;z-index:2147483647;';
  applyWidgetPosition(floatingWidget, savedPosition);

  const shadow = floatingWidget.attachShadow({ mode: 'closed' });

  // Minimal styles for Shadow DOM reset
  const style = document.createElement('style');
  style.textContent = ':host { all: initial; }';
  shadow.appendChild(style);

  // Create mount target
  const target = document.createElement('div');
  shadow.appendChild(target);

  // Mount Svelte component
  const currentSelectState = isInspectMode() || isFreeSelectMode();
  const currentVisualState = getVisualState();
  // Only skip select animation when staying in select mode (prevents flicker on remount)
  // Animate for all other transitions including toast → select
  const skipSelectAnim = lastVisualState === 'select' && currentVisualState === 'select';

  const widgetInstance = mount(FloatingWidget, {
    target,
    props: {
      isRecording,
      isBuffering,
      isSelectActive: currentSelectState,
      isCollapsed: widgetCollapsed,
      collapsedEdge: widgetCollapsedEdge,
      isDragging: isWidgetDragging,
      skipAnimation: skipWidgetAnimation,
      skipSelectAnimation: skipSelectAnim,
      externalToast: widgetToastMessage,
      recordingStartTime: recordingStartTime ?? undefined,
      onSelect: () => activateFreeSelectDrag(),
      onStartRecording: () => chrome.runtime.sendMessage({ type: 'START_RECORDING' }),
      onStopRecording: () => chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }),
      onSendBuffer: () => chrome.runtime.sendMessage({ type: 'SEND_BUFFER' }),
      onExpand: expandWidget,
      onClose: () => { closeWidget(); chrome.storage.local.set({ widgetVisible: false }); },
    },
  });

  // Track visual state for next render
  lastVisualState = currentVisualState;

  document.body.appendChild(floatingWidget);

  // Make it draggable (only when not collapsed)
  makeDraggable(floatingWidget, target);

  // Store instance for updates
  (floatingWidget as any)._instance = widgetInstance;
  (floatingWidget as any)._target = target;

  // Handle viewport resize (e.g., when DevTools opens)
  const handleResize = () => {
    if (!floatingWidget) return;
    chrome.storage.local.get('widgetPosition').then((stored) => {
      const pos = (stored.widgetPosition as WidgetPosition) || getDefaultPosition();
      applyWidgetPosition(floatingWidget!, pos);
    }).catch(() => {});
  };
  window.addEventListener('resize', handleResize);
  (floatingWidget as any)._resizeHandler = handleResize;

  // Update state periodically
  updateFloatingWidgetState();
  widgetStateInterval = window.setInterval(updateFloatingWidgetState, 200);
}

/**
 * Close the floating widget with exit animation
 */
function closeWidget(): void {
  widgetCollapsed = false;
  widgetCollapsedEdge = null;
  // Reset tracking state so widget mounts properly when recreated
  lastWidgetRecordingState = false;
  lastWidgetBufferingState = false;
  lastWidgetSelectState = false;
  lastWidgetCollapsedState = false;
  lastWidgetCollapsedEdge = null;
  if (widgetStateInterval) {
    clearInterval(widgetStateInterval);
    widgetStateInterval = null;
  }
  // Remove resize listener
  if (floatingWidget) {
    const resizeHandler = (floatingWidget as any)._resizeHandler;
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
    }
  }
  if (floatingWidget) {
    const target = (floatingWidget as any)._target as HTMLElement | undefined;
    const widgetDiv = target?.querySelector('[data-widget-pill]') as HTMLElement | null;

    if (widgetDiv) {
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

  const target = (floatingWidget as any)._target as HTMLElement | undefined;
  const oldInstance = (floatingWidget as any)._instance;
  if (!target || !oldInstance) return;

  // Check if state actually changed to avoid unnecessary remounts (which cause animation replay)
  const currentSelectState = isInspectMode() || isFreeSelectMode();
  if (
    isRecording === lastWidgetRecordingState &&
    isBuffering === lastWidgetBufferingState &&
    currentSelectState === lastWidgetSelectState &&
    widgetCollapsed === lastWidgetCollapsedState &&
    widgetCollapsedEdge === lastWidgetCollapsedEdge &&
    isWidgetDragging === lastWidgetDraggingState &&
    skipWidgetAnimation === lastWidgetSkipAnimationState &&
    widgetToastMessage === lastWidgetToastMessage
  ) {
    return; // No change, skip remount
  }

  // Calculate current visual state BEFORE updating tracking variables
  const currentVisualState = getVisualState();
  // Only skip select animation when staying in select mode (prevents flicker on remount)
  // Animate for all other transitions including toast → select
  const skipSelectAnim = lastVisualState === 'select' && currentVisualState === 'select';

  // Update tracking variables
  lastWidgetRecordingState = isRecording;
  lastWidgetBufferingState = isBuffering;
  lastWidgetSelectState = currentSelectState;
  lastWidgetCollapsedState = widgetCollapsed;
  lastWidgetCollapsedEdge = widgetCollapsedEdge;
  lastWidgetDraggingState = isWidgetDragging;
  lastWidgetSkipAnimationState = skipWidgetAnimation;
  lastWidgetToastMessage = widgetToastMessage;

  // Remount with updated props
  unmount(oldInstance);
  const newInstance = mount(FloatingWidget, {
    target,
    props: {
      isRecording,
      isBuffering,
      isSelectActive: currentSelectState,
      isCollapsed: widgetCollapsed,
      collapsedEdge: widgetCollapsedEdge,
      isDragging: isWidgetDragging,
      skipAnimation: skipWidgetAnimation,
      skipSelectAnimation: skipSelectAnim,
      externalToast: widgetToastMessage,
      recordingStartTime: recordingStartTime ?? undefined,
      onSelect: () => activateFreeSelectDrag(),
      onStartRecording: () => chrome.runtime.sendMessage({ type: 'START_RECORDING' }),
      onStopRecording: () => chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }),
      onSendBuffer: () => chrome.runtime.sendMessage({ type: 'SEND_BUFFER' }),
      onExpand: expandWidget,
      onClose: () => { closeWidget(); chrome.storage.local.set({ widgetVisible: false }); },
    },
  });
  (floatingWidget as any)._instance = newInstance;

  // Track visual state for next render
  lastVisualState = currentVisualState;
}

/**
 * Make an element draggable via its drag handle with edge collapse
 * Snaps to collapsed mode when near edge, allows sliding along edge
 * Also allows dragging collapsed pill to move it or expand
 * @param element - The element to move (host element)
 * @param handleContainer - Optional container to listen for drag handle (for Shadow DOM)
 */
function makeDraggable(element: HTMLElement, handleContainer?: HTMLElement): void {
  let isDragging = false;
  let isDraggingCollapsed = false;
  let initialWidth = 0;
  let initialHeight = 0;
  let dragCollapsedEdge: 'left' | 'right' | 'top' | 'bottom' | null = null;
  let dragStartEdge: 'left' | 'right' | 'top' | 'bottom' | null = null;
  // Track offset from mouse to element center for smooth dragging
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const target = handleContainer || element;

  // Handle mousedown on both drag handle (normal) and collapsed pill
  target.addEventListener('mousedown', (e: MouseEvent) => {
    const dragHandle = (e.target as HTMLElement).closest('[data-drag-handle]');
    const collapsedPill = (e.target as HTMLElement).closest('[data-widget-pill]');

    // Drag from drag handle (normal mode)
    if (dragHandle && !widgetCollapsed) {
      isDragging = true;
      isDraggingCollapsed = false;
      dragCollapsedEdge = null;
      dragStartEdge = null;

      const rect = element.getBoundingClientRect();
      initialWidth = rect.width;
      initialHeight = rect.height;

      // Calculate offset from mouse to element position
      // X: offset to center (for translateX(-50%))
      // Y: offset to top edge (no Y transform)
      const centerX = rect.left + rect.width / 2;
      dragOffsetX = centerX - e.clientX;
      dragOffsetY = rect.top - e.clientY;

      console.log('[Clueprint Drag] mousedown - rect:', rect.left, rect.top, 'center:', centerX, 'mouse:', e.clientX, e.clientY, 'offset:', dragOffsetX, dragOffsetY);

      // Set dragging state to disable hover when collapsing
      isWidgetDragging = true;

      element.style.width = `${rect.width}px`;
      element.style.transform = 'none';
      element.style.left = `${rect.left}px`;
      element.style.top = `${rect.top}px`;
      element.style.bottom = 'auto';
      element.style.right = 'auto';
      element.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    // Drag from collapsed pill (but not from action buttons - let those click through)
    const isActionButton = (e.target as HTMLElement).closest('[data-action-buttons] button');
    if (collapsedPill && widgetCollapsed && !isActionButton) {
      isDragging = true;
      isDraggingCollapsed = true;
      dragCollapsedEdge = widgetCollapsedEdge;
      dragStartEdge = widgetCollapsedEdge;

      // Calculate offset for collapsed pill too
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      dragOffsetX = centerX - e.clientX;
      dragOffsetY = rect.top - e.clientY;
      console.log('[Clueprint Drag] mousedown collapsed - rect:', rect.left, rect.top, 'mouse:', e.clientX, e.clientY, 'offset:', dragOffsetX, dragOffsetY);

      // Set dragging state to disable hover
      isWidgetDragging = true;
      updateFloatingWidgetState();

      element.style.cursor = 'grabbing';
      e.preventDefault();
      e.stopPropagation(); // Prevent expand onClick
      return;
    }
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging) return;

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Calculate distances from edges
    const distFromLeft = mouseX;
    const distFromRight = window.innerWidth - mouseX;
    const distFromTop = mouseY;
    const distFromBottom = window.innerHeight - mouseY;

    const edges = [
      { edge: 'left' as const, dist: distFromLeft },
      { edge: 'right' as const, dist: distFromRight },
      { edge: 'top' as const, dist: distFromTop },
      { edge: 'bottom' as const, dist: distFromBottom },
    ];
    const closest = edges.reduce((min, curr) => curr.dist < min.dist ? curr : min);

    // Snap to collapsed when within threshold
    if (closest.dist < COLLAPSE_THRESHOLD) {
      if (dragCollapsedEdge !== closest.edge) {
        dragCollapsedEdge = closest.edge;
        widgetCollapsed = true;
        widgetCollapsedEdge = closest.edge;
        updateFloatingWidgetState();
      }

      // Position collapsed pill along the edge using offset for smooth positioning
      if (closest.edge === 'left' || closest.edge === 'right') {
        const yPos = Math.max(EDGE_MARGIN, Math.min(window.innerHeight - 50, mouseY + dragOffsetY));
        console.log('[Clueprint Drag] edge snap', closest.edge, '- yPos:', yPos);
        element.style.top = `${yPos}px`;
        element.style.bottom = 'auto';
        element.style.left = closest.edge === 'left' ? '0px' : 'auto';
        element.style.right = closest.edge === 'right' ? '0px' : 'auto';
        element.style.width = 'auto';
        element.style.transform = 'none';
      } else {
        const xPos = Math.max(EDGE_MARGIN, Math.min(window.innerWidth - 50, mouseX + dragOffsetX));
        console.log('[Clueprint Drag] edge snap', closest.edge, '- xPos:', xPos);
        element.style.left = `${xPos}px`;
        element.style.right = 'auto';
        element.style.transform = 'none';
        element.style.top = closest.edge === 'top' ? '0px' : 'auto';
        element.style.bottom = closest.edge === 'bottom' ? '0px' : 'auto';
        element.style.width = 'auto';
      }
    } else if (!isDraggingCollapsed) {
      // Not near edge and started from normal mode - show normal widget
      if (dragCollapsedEdge !== null) {
        dragCollapsedEdge = null;
        widgetCollapsed = false;
        widgetCollapsedEdge = null;
        element.style.width = `${initialWidth}px`;
        updateFloatingWidgetState();
      }

      // Normal drag - position using offset to keep widget in same relative position to mouse
      // X is center position (with translateX(-50%)), Y is top edge position
      const newCenterX = mouseX + dragOffsetX;
      const newTopY = mouseY + dragOffsetY;
      console.log('[Clueprint Drag] mousemove - mouse:', mouseX, mouseY, 'newPos:', newCenterX, newTopY);
      element.style.left = `${newCenterX}px`;
      element.style.top = `${newTopY}px`;
      element.style.right = 'auto';
      element.style.bottom = 'auto';
      element.style.transform = 'translateX(-50%)';
    } else {
      // Started from collapsed but dragged away from edge - expand
      dragCollapsedEdge = null;
      isDraggingCollapsed = false;
      widgetCollapsed = false;
      widgetCollapsedEdge = null;
      initialWidth = 200; // Approximate width for expanded widget
      element.style.width = 'auto';
      updateFloatingWidgetState();

      // When expanding from collapsed, center X on mouse, Y at mouse minus some offset
      element.style.left = `${mouseX}px`;
      element.style.top = `${mouseY - 22}px`; // Offset by ~half widget height
      element.style.right = 'auto';
      element.style.bottom = 'auto';
      element.style.transform = 'translateX(-50%)';
    }
  });

  document.addEventListener('mouseup', (e: MouseEvent) => {
    if (isDragging) {
      const wasCollapsedDrag = isDraggingCollapsed && dragStartEdge === dragCollapsedEdge;

      isDragging = false;
      isDraggingCollapsed = false;

      // Set skipAnimation before clearing dragging state to prevent entrance animation on remount
      skipWidgetAnimation = true;
      isWidgetDragging = false;
      element.style.cursor = '';

      // Reset skipAnimation after animation would have completed
      setTimeout(() => {
        skipWidgetAnimation = false;
        // Force state update to clear the flag (won't remount if nothing else changed)
        lastWidgetSkipAnimationState = false;
      }, 600);

      // If it was just a click on collapsed pill (no movement to different edge), expand
      if (wasCollapsedDrag && dragCollapsedEdge !== null) {
        // Check if mouse is still near the same edge - if so, it was a position adjustment, not expand
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        const distFromEdge = dragCollapsedEdge === 'left' ? mouseX :
                            dragCollapsedEdge === 'right' ? window.innerWidth - mouseX :
                            dragCollapsedEdge === 'top' ? mouseY :
                            window.innerHeight - mouseY;

        // Only consider it a "click to expand" if very minimal movement (handled by onClick)
        // Otherwise save the new position along the edge
      }

      const rect = element.getBoundingClientRect();
      console.log('[Clueprint Drag] mouseup - rect:', rect.left, rect.top, rect.width, rect.height, 'dragCollapsedEdge:', dragCollapsedEdge);

      // Calculate position - use current rect position directly
      let xPercent: number;
      let yPercent: number;

      // X percent is center position (applyWidgetPosition uses translateX(-50%))
      // Y percent is top edge position (no Y transform)
      if (dragCollapsedEdge === 'left' || dragCollapsedEdge === 'right') {
        xPercent = dragCollapsedEdge === 'left' ? 0 : 100;
        yPercent = (rect.top / window.innerHeight) * 100;
      } else if (dragCollapsedEdge === 'top' || dragCollapsedEdge === 'bottom') {
        xPercent = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
        yPercent = dragCollapsedEdge === 'top' ? 0 : 100;
      } else {
        xPercent = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
        yPercent = (rect.top / window.innerHeight) * 100;
      }

      xPercent = Math.max(5, Math.min(95, xPercent));
      yPercent = Math.max(5, Math.min(95, yPercent));

      const pos: WidgetPosition = {
        xPercent,
        yPercent,
        collapsed: dragCollapsedEdge !== null,
        collapsedEdge: dragCollapsedEdge,
      };

      widgetCollapsed = pos.collapsed;
      widgetCollapsedEdge = pos.collapsedEdge;

      console.log('[Clueprint Drag] applying final position:', JSON.stringify(pos));
      applyWidgetPosition(element, pos);
      const finalRect = element.getBoundingClientRect();
      console.log('[Clueprint Drag] after applyWidgetPosition - rect:', finalRect.left, finalRect.top);
      chrome.storage.local.set({ widgetPosition: pos }).catch(() => {});
      updateFloatingWidgetState();

      dragCollapsedEdge = null;
      dragStartEdge = null;
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

/**
 * Show a toast message in the floating widget
 */
function showWidgetToast(message: string): void {
  widgetToastMessage = message;
  updateFloatingWidgetState();

  // Clear toast after display and trigger state update
  setTimeout(() => {
    widgetToastMessage = '';
    updateFloatingWidgetState();
  }, 2500);
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Cleanup on unload
window.addEventListener('beforeunload', cleanup);
