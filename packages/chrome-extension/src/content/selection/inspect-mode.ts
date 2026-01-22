/**
 * Inspect Mode - Option+Click element selection
 */

import { getSelector } from '../utils/selector';
import { captureElement } from '../capture/dom';
import { captureElementScreenshot } from '../capture/screenshot';
import { mountInspectPicker, showConfirmation } from '../ui/mount';
import type { InspectCapture, Intent, BrowserContext } from '../../types';

let isInspectModeActive = false;
let isOptionKeyHeld = false;
let isManuallyActivated = false; // True when activated via toolbar button (not Option key)
let currentHighlight: HTMLElement | null = null;
let currentLabel: HTMLElement | null = null;
let hoveredElement: Element | null = null;
let lockedElement: Element | null = null; // Element locked for selection (when picker shown)

/**
 * Handle Option/Alt key press to activate inspect mode
 */
function handleKeyDown(event: KeyboardEvent): void {
  // Escape to cancel
  if (event.key === 'Escape') {
    if (isInspectModeActive) {
      deactivateInspectMode();
    }
    return;
  }

  // Check for Option/Alt key (without other modifiers for cleaner UX)
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (!isOptionKeyHeld) {
      isOptionKeyHeld = true;
      activateInspectMode();
    }
  }
}

/**
 * Handle Option/Alt key release to deactivate inspect mode
 */
function handleKeyUp(event: KeyboardEvent): void {
  // Deactivate when Alt key is released
  if (event.key === 'Alt' || event.key === 'Option') {
    if (isOptionKeyHeld && !document.getElementById('ai-devtools-intent-picker')) {
      // Only deactivate if intent picker is not shown
      isOptionKeyHeld = false;
      deactivateInspectMode();
    }
  }
}

/**
 * Handle window blur to reset state
 */
function handleWindowBlur(): void {
  if (isOptionKeyHeld) {
    isOptionKeyHeld = false;
    if (!document.getElementById('ai-devtools-intent-picker')) {
      deactivateInspectMode();
    }
  }
}

/**
 * Create highlight overlay element
 */
function createHighlightOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = 'ai-devtools-highlight';
  overlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid #0066ff;
    background: rgba(0, 102, 255, 0.1);
    z-index: 2147483647;
    transition: all 0.1s ease;
    border-radius: 4px;
  `;
  return overlay;
}

/**
 * Create element label tooltip
 */
function createElementLabel(): HTMLElement {
  const label = document.createElement('div');
  label.id = 'ai-devtools-element-label';
  label.style.cssText = `
    position: fixed;
    pointer-events: none;
    background: #0066ff;
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Monaco, monospace;
    font-size: 11px;
    z-index: 2147483647;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  `;
  return label;
}

/**
 * Get element display name for label
 */
function getElementDisplayName(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = Array.from(element.classList).slice(0, 2).map(c => `.${c}`).join('');
  const rect = element.getBoundingClientRect();
  const dims = `${Math.round(rect.width)}×${Math.round(rect.height)}`;

  let name = tag + id + classes;
  if (name.length > 40) {
    name = name.slice(0, 37) + '...';
  }

  return `${name}  ${dims}`;
}

/**
 * Update highlight position to match element
 */
function updateHighlight(element: Element): void {
  if (!currentHighlight) {
    currentHighlight = createHighlightOverlay();
    document.body.appendChild(currentHighlight);
  }

  if (!currentLabel) {
    currentLabel = createElementLabel();
    document.body.appendChild(currentLabel);
  }

  const rect = element.getBoundingClientRect();

  // Update highlight box
  currentHighlight.style.top = `${rect.top}px`;
  currentHighlight.style.left = `${rect.left}px`;
  currentHighlight.style.width = `${rect.width}px`;
  currentHighlight.style.height = `${rect.height}px`;
  currentHighlight.style.display = 'block';

  // Update label - position above element, or below if not enough space
  currentLabel.textContent = getElementDisplayName(element);
  const labelHeight = 24;
  const labelTop = rect.top > labelHeight + 5 ? rect.top - labelHeight - 5 : rect.bottom + 5;
  currentLabel.style.top = `${labelTop}px`;
  currentLabel.style.left = `${rect.left}px`;
  currentLabel.style.display = 'block';
}

/**
 * Hide highlight overlay and label
 */
function hideHighlight(): void {
  if (currentHighlight) {
    currentHighlight.style.display = 'none';
  }
  if (currentLabel) {
    currentLabel.style.display = 'none';
  }
}

/**
 * Remove highlight overlay and label from DOM
 */
function removeHighlight(): void {
  if (currentHighlight) {
    currentHighlight.remove();
    currentHighlight = null;
  }
  if (currentLabel) {
    currentLabel.remove();
    currentLabel = null;
  }
}

/**
 * Handle mouse move during inspect mode
 */
function handleMouseMove(event: MouseEvent): void {
  if (!isInspectModeActive) return;

  // Don't update highlight when element is locked (picker is shown)
  if (lockedElement) return;

  // Ignore our own overlay
  if ((event.target as HTMLElement)?.id === 'ai-devtools-highlight') return;
  if ((event.target as HTMLElement)?.id?.startsWith('ai-devtools-')) return;

  const element = event.target as Element;
  if (element && element !== hoveredElement) {
    hoveredElement = element;
    updateHighlight(element);
  }
}

/**
 * Handle click to select element (Option+Click or manual mode)
 */
function handleClick(event: MouseEvent): void {
  // Allow click if Option/Alt key held OR if manually activated via toolbar
  if (!event.altKey && !isManuallyActivated) return;

  // Ignore our own UI elements
  if ((event.target as HTMLElement)?.id?.startsWith('ai-devtools-')) return;

  event.preventDefault();
  event.stopPropagation();

  const element = event.target as Element;
  if (element) {
    // Show intent picker
    showIntentPicker(element, event.clientX, event.clientY);
  }
}

/**
 * Show intent picker (fix/beautify) at position using Shadow DOM
 */
function showIntentPicker(element: Element, x: number, y: number): void {
  // Lock the element - this prevents hover updates and stores the element for selection
  lockedElement = element;

  // Remove mousemove listener entirely while picker is shown
  document.removeEventListener('mousemove', handleMouseMove, true);

  // Hide the hover label while picker is shown (keep highlight visible)
  if (currentLabel) {
    currentLabel.style.display = 'none';
  }

  const displayName = getElementDisplayName(element);

  mountInspectPicker(
    x,
    y,
    displayName,
    async (intent, instruction) => {
      await selectElement(element, intent, instruction);
    },
    () => {
      lockedElement = null;
      deactivateInspectMode();
    }
  );
}

/**
 * Select element and send to background
 *
 * Intent-specific data:
 * - tag: Just element identification (minimal context for AI awareness)
 * - fix: Include console errors, network failures (debugging context)
 * - beautify: Include screenshot (visual context for styling)
 */
async function selectElement(element: Element, intent: Intent, userInstruction?: string): Promise<void> {
  // Get browser context only for fix intent (console logs, network failures)
  const browserContext = intent === 'fix'
    ? await getBrowserContext()
    : { errors: [], networkFailures: [] };

  // Capture element data
  const capture = captureElement(element, intent, browserContext);

  // Capture screenshot only for beautify intent
  let screenshot: string | undefined;
  if (intent === 'beautify') {
    screenshot = await captureElementScreenshot(element) || undefined;
  }

  const fullCapture: InspectCapture = {
    ...capture,
    screenshot,
    userInstruction,
  };

  // Send to background script
  await chrome.runtime.sendMessage({
    type: 'ELEMENT_SELECTED',
    payload: fullCapture,
  });

  // Show confirmation with instruction feedback
  showSelectionConfirmation(element, userInstruction);

  // Deactivate inspect mode
  deactivateInspectMode();
}

/**
 * Get browser context (errors, network failures)
 */
async function getBrowserContext(): Promise<BrowserContext> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_BROWSER_CONTEXT',
    });
    return response || { errors: [], networkFailures: [] };
  } catch {
    return { errors: [], networkFailures: [] };
  }
}

/**
 * Show confirmation that element was selected
 */
function showSelectionConfirmation(element: Element, userInstruction?: string): void {
  const rect = element.getBoundingClientRect();

  let message: string;
  if (userInstruction) {
    const truncated = userInstruction.length > 40 ? userInstruction.slice(0, 40) + '...' : userInstruction;
    message = `✓ Captured with instruction: <strong>"${truncated}"</strong>`;
  } else {
    message = '✓ Element captured! Tell your AI assistant.';
  }

  showConfirmation(rect.left, rect.top - 30, message);
}

/**
 * Activate inspect mode
 * @param manual - If true, clicks work without holding Option key
 */
export function activateInspectMode(manual = false): void {
  if (isInspectModeActive) return;

  isInspectModeActive = true;
  isManuallyActivated = manual;

  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);

  // Change cursor
  document.body.style.cursor = 'crosshair';

  console.log('[Clueprint] Inspect mode activated.', manual ? 'Click to select.' : 'Option+Click to select.');
}

/**
 * Deactivate inspect mode
 */
export function deactivateInspectMode(): void {
  if (!isInspectModeActive) return;

  isInspectModeActive = false;
  isManuallyActivated = false;
  lockedElement = null;

  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);

  hideHighlight();
  removeHighlight();

  // Reset cursor
  document.body.style.cursor = '';

  hoveredElement = null;
}

/**
 * Toggle inspect mode
 */
export function toggleInspectMode(): void {
  if (isInspectModeActive) {
    deactivateInspectMode();
  } else {
    activateInspectMode();
  }
}

/**
 * Check if inspect mode is active
 */
export function isInspectMode(): boolean {
  return isInspectModeActive;
}

/**
 * Initialize inspect mode listeners (call once on page load)
 */
export function initInspectMode(): void {
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', handleKeyUp, true);
  window.addEventListener('blur', handleWindowBlur);
  console.log('[AI DevTools] Inspect mode initialized. Hold Option to highlight elements.');
}

/**
 * Cleanup inspect mode listeners
 */
export function cleanupInspectMode(): void {
  document.removeEventListener('keydown', handleKeyDown, true);
  document.removeEventListener('keyup', handleKeyUp, true);
  window.removeEventListener('blur', handleWindowBlur);
  deactivateInspectMode();
  isOptionKeyHeld = false;
  lockedElement = null;
}
