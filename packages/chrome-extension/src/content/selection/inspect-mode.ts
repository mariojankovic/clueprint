/**
 * Inspect Mode - Option+Click element selection
 */

import { getSelector } from '../utils/selector';
import { captureElement } from '../capture/dom';
import { captureElementScreenshot } from '../capture/screenshot';
import { detectSourceInfo } from '../capture/source-detect';
import { mountInspectPicker, showToast } from '../ui/mount';
import { activateFreeSelectDrag, deactivateFreeSelectDrag, isFreeSelectMode } from './free-select';
import type { InspectCapture, CaptureOptions, BrowserContext, SourceInfo } from '../../types';

let isInspectModeActive = false;
let isOptionKeyHeld = false;
let isManuallyActivated = false; // True when activated via toolbar button (not Option key)
let currentHighlight: HTMLElement | null = null;
let currentLabel: HTMLElement | null = null;
let hoveredElement: Element | null = null;
let lockedElement: Element | null = null; // Element locked for selection (when picker shown)
let savedOverflow: string | null = null; // Saved body overflow for scroll lock
let pickerCleanup: (() => void) | null = null; // Cleanup function for the current picker

// Multi-select queue
let elementQueue: Element[] = [];
let queueHighlights: HTMLElement[] = [];

// Optional region rect for screenshot (set by drag selection)
let regionRect: { x: number; y: number; width: number; height: number } | null = null;

/**
 * Check if an event originated from our UI elements (picker, widget, highlights, etc.)
 * Uses composedPath to check through Shadow DOM boundaries
 */
function isOurUIElement(event: Event): boolean {
  const path = event.composedPath();
  for (const el of path) {
    if (el instanceof HTMLElement) {
      // Check for our element IDs
      if (el.id?.startsWith('ai-devtools-') || el.id?.startsWith('clueprint-')) {
        return true;
      }
      // Check for data attributes we use
      if (el.hasAttribute('data-widget-pill') || el.hasAttribute('data-picker')) {
        return true;
      }
      // Check for our class names
      if (el.classList?.contains('ai-devtools-queue-highlight') || el.classList?.contains('ai-devtools-region-highlight')) {
        return true;
      }
    }
  }
  return false;
}

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
 * Handle global Shift+Click for Figma-style selection (works anytime)
 */
function handleGlobalShiftClick(event: MouseEvent): void {
  // Only handle Shift+Click
  if (!event.shiftKey) return;

  // Skip if inspect mode or free-select mode is already handling this
  // (they have their own Shift+Click handlers)
  if (isInspectModeActive) return;
  if (isFreeSelectMode()) return;

  // Ignore our own UI elements (picker, widget, highlights, etc.)
  if (isOurUIElement(event)) return;

  const element = event.target as Element;
  if (!element) return;

  event.preventDefault();
  event.stopPropagation();

  // Toggle element in selection (Figma-style)
  if (elementQueue.includes(element)) {
    removeFromQueue(element);
    const count = elementQueue.length;
    if (count > 0) {
      showToast(`${count} selected`, 'info', 1500);
    }
  } else {
    addToQueue(element);
    const count = elementQueue.length;
    if (count > 1) {
      showToast(`${count} selected`, 'success', 1500);
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

export interface ElementContext {
  tag: string;
  attrs: Array<{ name: string; value: string }>;
  textContent: string;
  parents: Array<{ label: string }>;
  parentElements: Element[];
  pageUrl: string;
  childCount: number;
  styles: Array<{ prop: string; value: string }>;
  sourceInfo?: SourceInfo;
}

/**
 * Extract element context for the picker UI (sync version without source info)
 */
function getElementContext(element: Element, sourceInfo?: SourceInfo): ElementContext {
  const { parents, elements } = getParentChain(element);
  return {
    tag: element.tagName.toLowerCase(),
    attrs: getKeyAttributes(element),
    textContent: getTextContent(element),
    parents,
    parentElements: elements,
    pageUrl: window.location.hostname + window.location.pathname,
    childCount: element.children.length,
    styles: getSmartStyles(element),
    sourceInfo,
  };
}

/**
 * Get key attributes for display
 */
function getKeyAttributes(element: Element): Array<{ name: string; value: string }> {
  const attrs: Array<{ name: string; value: string }> = [];

  if (element.id) attrs.push({ name: 'id', value: element.id });

  const classes = Array.from(element.classList);
  if (classes.length > 0) {
    const classStr = classes.slice(0, 3).join(' ') + (classes.length > 3 ? ` +${classes.length - 3}` : '');
    attrs.push({ name: 'class', value: classStr });
  }

  const functionalAttrs = ['type', 'href', 'src', 'role', 'name', 'placeholder', 'aria-label'];
  for (const name of functionalAttrs) {
    const val = element.getAttribute(name);
    if (val) {
      attrs.push({ name, value: val.length > 25 ? val.slice(0, 22) + '...' : val });
    }
  }

  return attrs;
}

/**
 * Get truncated text content
 */
function getTextContent(element: Element): string {
  const text = element.textContent?.trim() || '';
  if (!text) return '';
  // Only show direct text, not deeply nested
  const directText = Array.from(element.childNodes)
    .filter(n => n.nodeType === Node.TEXT_NODE)
    .map(n => n.textContent?.trim())
    .filter(Boolean)
    .join(' ');
  const result = directText || text;
  return result.length > 40 ? result.slice(0, 37) + '...' : result;
}

/**
 * Get full parent chain (no depth limit) with element references
 */
function getParentChain(element: Element): { parents: Array<{ label: string }>; elements: Element[] } {
  const parents: Array<{ label: string }> = [];
  const elements: Element[] = [];
  let current = element.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase();
    const id = current.id ? `#${current.id}` : '';
    const cls = current.classList.length > 0 ? `.${current.classList[0]}` : '';
    parents.unshift({ label: tag + id + cls });
    elements.unshift(current);
    current = current.parentElement;
  }
  return { parents, elements };
}

/**
 * Extract smart/contextual computed styles based on element type
 */
function getSmartStyles(element: Element): Array<{ prop: string; value: string }> {
  const computed = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const styles: Array<{ prop: string; value: string }> = [];
  const tag = element.tagName.toLowerCase();

  const display = computed.display;
  const position = computed.position;

  // Always show display
  styles.push({ prop: 'display', value: display });

  // Flex-specific
  if (display === 'flex' || display === 'inline-flex') {
    if (computed.flexDirection !== 'row') styles.push({ prop: 'direction', value: computed.flexDirection });
    if (computed.gap !== 'normal' && computed.gap !== '0px') styles.push({ prop: 'gap', value: computed.gap });
    if (computed.alignItems !== 'normal') styles.push({ prop: 'align', value: computed.alignItems });
    if (computed.justifyContent !== 'normal') styles.push({ prop: 'justify', value: computed.justifyContent });
  }

  // Grid-specific
  if (display === 'grid' || display === 'inline-grid') {
    if (computed.gridTemplateColumns !== 'none') {
      const cols = computed.gridTemplateColumns;
      styles.push({ prop: 'columns', value: cols.length > 30 ? cols.slice(0, 27) + '...' : cols });
    }
    if (computed.gap !== 'normal' && computed.gap !== '0px') styles.push({ prop: 'gap', value: computed.gap });
  }

  // Position-specific
  if (position !== 'static') {
    styles.push({ prop: 'position', value: position });
    if (computed.zIndex !== 'auto') styles.push({ prop: 'z-index', value: computed.zIndex });
  }

  // Text-heavy elements
  const textTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'label', 'li', 'td', 'th', 'button'];
  if (textTags.includes(tag)) {
    styles.push({ prop: 'font', value: `${computed.fontSize} / ${computed.fontWeight}` });
    if (computed.color !== 'rgb(0, 0, 0)') styles.push({ prop: 'color', value: rgbToHex(computed.color) });
    if (computed.lineHeight !== 'normal') styles.push({ prop: 'line-height', value: computed.lineHeight });
  }

  // Background (if set)
  const bg = computed.backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
    styles.push({ prop: 'background', value: rgbToHex(bg) });
  }

  // Padding (if non-zero)
  const padding = computed.padding;
  if (padding && padding !== '0px') {
    styles.push({ prop: 'padding', value: padding });
  }

  // Border-radius (if set)
  const radius = computed.borderRadius;
  if (radius && radius !== '0px') {
    styles.push({ prop: 'radius', value: radius });
  }

  // Size
  styles.push({ prop: 'size', value: `${Math.round(rect.width)} × ${Math.round(rect.height)}` });

  // Cap at 8 properties
  return styles.slice(0, 8);
}

/**
 * Convert any CSS color value to hex
 */
function rgbToHex(color: string): string {
  // Already hex
  if (color.startsWith('#')) return color;

  // rgb/rgba
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  // oklab(L a b) or oklab(L a b / alpha)
  const oklabMatch = color.match(/oklab\(([\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
  if (oklabMatch) {
    const L = parseFloat(oklabMatch[1]);
    const a = parseFloat(oklabMatch[2]);
    const bVal = parseFloat(oklabMatch[3]);
    return oklabToHex(L, a, bVal);
  }

  // oklch(L C H) or oklch(L C H / alpha)
  const oklchMatch = color.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (oklchMatch) {
    const L = parseFloat(oklchMatch[1]);
    const C = parseFloat(oklchMatch[2]);
    const H = parseFloat(oklchMatch[3]) * Math.PI / 180;
    return oklabToHex(L, C * Math.cos(H), C * Math.sin(H));
  }

  return color;
}

/**
 * Convert OKLab L,a,b to hex color
 */
function oklabToHex(L: number, a: number, b: number): string {
  // OKLab to linear sRGB
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;

  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bVal = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  // Linear to sRGB
  r = r <= 0.0031308 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - 0.055;
  g = g <= 0.0031308 ? 12.92 * g : 1.055 * Math.pow(g, 1 / 2.4) - 0.055;
  bVal = bVal <= 0.0031308 ? 12.92 * bVal : 1.055 * Math.pow(bVal, 1 / 2.4) - 0.055;

  // Clamp and convert to hex
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(bVal)}`;
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
 * Create a persistent highlight for selected elements (Figma-style clean outline)
 */
function createQueueHighlight(element: Element): HTMLElement {
  const rect = element.getBoundingClientRect();
  const highlight = document.createElement('div');
  highlight.className = 'ai-devtools-queue-highlight';
  highlight.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.05);
    z-index: 2147483646;
    border-radius: 4px;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
  `;

  document.body.appendChild(highlight);
  return highlight;
}

/**
 * Add element to multi-select queue
 */
export function addToQueue(element: Element): boolean {
  // Don't add duplicates
  if (elementQueue.includes(element)) return false;

  elementQueue.push(element);
  const highlight = createQueueHighlight(element);
  queueHighlights.push(highlight);
  return true;
}

/**
 * Check if element is already in queue
 */
export function isInQueue(element: Element): boolean {
  return elementQueue.includes(element);
}

/**
 * Remove element from queue
 */
export function removeFromQueue(element: Element): boolean {
  const index = elementQueue.indexOf(element);
  if (index === -1) return false;

  elementQueue.splice(index, 1);
  const highlight = queueHighlights[index];
  if (highlight) {
    highlight.remove();
    queueHighlights.splice(index, 1);
  }

  return true;
}

/**
 * Remove element from queue by index
 */
export function removeFromQueueByIndex(index: number): boolean {
  if (index < 0 || index >= elementQueue.length) return false;

  elementQueue.splice(index, 1);
  const highlight = queueHighlights[index];
  if (highlight) {
    highlight.remove();
    queueHighlights.splice(index, 1);
  }

  return true;
}

/**
 * Clear the element queue and remove highlights
 */
export function clearQueue(): void {
  for (const highlight of queueHighlights) {
    highlight.remove();
  }
  queueHighlights = [];
  elementQueue = [];
  regionRect = null;
}

/**
 * Get current queue count
 */
export function getQueueCount(): number {
  return elementQueue.length;
}

/**
 * Bulk add multiple elements to queue (used by drag selection)
 * Clears existing queue first, then adds all elements
 */
export function bulkAddToQueue(elements: Element[], rect?: { x: number; y: number; width: number; height: number }): void {
  // Clear existing queue
  clearQueue();

  // Store region rect for screenshot if provided
  if (rect) {
    regionRect = rect;
  }

  // Add all elements
  for (const element of elements) {
    if (!elementQueue.includes(element)) {
      elementQueue.push(element);
      const highlight = createQueueHighlight(element);
      queueHighlights.push(highlight);
    }
  }
}

/**
 * Get the stored region rect (for screenshot capture)
 */
export function getRegionRect(): { x: number; y: number; width: number; height: number } | null {
  return regionRect;
}

/**
 * Lock page scrolling (prevent highlight from drifting away from element)
 */
function lockScroll(): void {
  // Don't overwrite savedOverflow if already locked
  if (savedOverflow !== null) return;
  savedOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
}

/**
 * Unlock page scrolling (restore previous overflow)
 */
function unlockScroll(): void {
  document.body.style.overflow = savedOverflow || '';
  savedOverflow = null;
}

/**
 * Handle mouse move during inspect mode
 */
function handleMouseMove(event: MouseEvent): void {
  if (!isInspectModeActive) return;

  // Don't update highlight when element is locked (picker is shown)
  if (lockedElement) return;

  // Ignore our own UI elements (picker, widget, highlights, etc.)
  if (isOurUIElement(event)) return;

  const element = event.target as Element;
  if (element && element !== hoveredElement) {
    hoveredElement = element;
    updateHighlight(element);
  }
}

/**
 * Handle click to select element (Option+Click only)
 * Note: Free-select mode handles clicks when picker is shown
 */
function handleClick(event: MouseEvent): void {
  // Ignore our own UI elements (picker, widget, highlights, etc.)
  if (isOurUIElement(event)) return;

  const element = event.target as Element;
  if (!element) return;

  // If free-select mode is active, let it handle the click
  // (prevents double-handling of the same click event)
  if (isFreeSelectMode()) return;

  // For non-picker clicks, require Option/Alt key OR manually activated mode
  if (!event.altKey && !isManuallyActivated) return;

  event.preventDefault();
  event.stopPropagation();

  // Add to queue and show picker
  if (!elementQueue.includes(element)) {
    addToQueue(element);
  }
  showIntentPicker(element, event.clientX, event.clientY);
}

/**
 * Show intent picker (fix/beautify) at position using Shadow DOM
 */
async function showIntentPicker(element: Element, x: number, y: number): Promise<void> {
  // Store position for potential refresh
  lastPickerX = x;
  lastPickerY = y;

  // Lock the element - this prevents hover updates and stores the element for selection
  lockedElement = element;

  // Lock scrolling to prevent highlight from drifting
  lockScroll();

  // Remove mousemove listener entirely while picker is shown
  document.removeEventListener('mousemove', handleMouseMove, true);

  // Hide the hover label while picker is shown (keep highlight visible)
  if (currentLabel) {
    currentLabel.style.display = 'none';
  }

  // Detect source info for ALL queued elements (parallel for speed)
  const queuedElements = await Promise.all(
    elementQueue.map(async (el) => {
      const sourceInfo = await detectSourceInfo(el) || undefined;
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = el.classList.length > 0 ? `.${el.classList[0]}` : '';
      return {
        element: el,
        label: tag + id + cls,
        sourceInfo,
      };
    })
  );

  // Use first element's source info for backwards compat
  const sourceInfo = queuedElements[0]?.sourceInfo;
  const context = {
    ...getElementContext(element, sourceInfo),
    queueCount: elementQueue.length,
    queuedElements,
  };

  const handleChangeElement = (newElement: Element): ElementContext => {
    lockedElement = newElement;
    updateHighlight(newElement);
    if (currentLabel) {
      currentLabel.style.display = 'none';
    }
    // Note: Source info not available for breadcrumb navigation (would require async callback)
    return getElementContext(newElement);
  };

  const handleRemoveQueuedElement = async (index: number) => {
    // Check if we're removing the locked element
    const removedElement = elementQueue[index];
    const wasLockedElement = removedElement === lockedElement;

    removeFromQueueByIndex(index);
    const count = elementQueue.length;

    if (count === 0) {
      // If all elements removed, close picker
      if (pickerCleanup) {
        pickerCleanup();
        pickerCleanup = null;
      }
      unlockScroll();
      lockedElement = null;
      deactivateInspectMode();
      deactivateFreeSelectDrag();
      showToast('Selection cleared', 'info', 1500);
    } else {
      // If we removed the locked element, switch to first remaining element
      if (wasLockedElement) {
        lockedElement = elementQueue[0];
        updateHighlight(lockedElement);
      }
      // Refresh picker with updated queue
      await refreshPicker();
      showToast(`${count} selected`, 'info', 1500);
    }
  };

  const { cleanup } = mountInspectPicker(
    x,
    y,
    context,
    async (options: CaptureOptions) => {
      pickerCleanup = null;
      unlockScroll();
      await selectElement(lockedElement!, options);
      clearQueue(); // Clear multi-select queue after capture
    },
    () => {
      pickerCleanup = null;
      unlockScroll();
      lockedElement = null;
      clearQueue(); // Clear queue on close too
      deactivateInspectMode();
      deactivateFreeSelectDrag(); // Also deactivate free-select mode
    },
    handleChangeElement,
    handleRemoveQueuedElement
  );
  pickerCleanup = cleanup;
}

/**
 * Select element and send to background
 *
 * Data included based on CaptureOptions:
 * - includeScreenshot: Capture and include element screenshot
 * - includeConsoleLogs: Include console errors, network failures
 * - suggestImprovements: Run responsive/accessibility checks (future)
 */
async function selectElement(element: Element, options: CaptureOptions): Promise<void> {
  // Get browser context if console logs are requested
  const browserContext = options.includeConsoleLogs
    ? await getBrowserContext()
    : { errors: [], networkFailures: [] };

  // Capture element data (async for source detection)
  const capture = await captureElement(element, options, browserContext);

  // Capture screenshot if requested
  let screenshot: string | undefined;
  if (options.includeScreenshot) {
    screenshot = await captureElementScreenshot(element) || undefined;
  }

  const fullCapture: InspectCapture = {
    ...capture,
    screenshot,
  };

  // Send to background script (will trigger toast via SHOW_CAPTURE_TOAST)
  await chrome.runtime.sendMessage({
    type: 'ELEMENT_SELECTED',
    payload: fullCapture,
  });

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

  // Ensure scroll is unlocked
  if (savedOverflow !== null) {
    unlockScroll();
  }

  // Properly cleanup picker (unmounts Svelte component and removes DOM)
  if (pickerCleanup) {
    pickerCleanup();
    pickerCleanup = null;
  }

  // Clear the element queue and highlights
  clearQueue();

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
  }
  activateInspectMode(true);
}

/**
 * Trigger element inspection on a specific element (used by unified selection mode).
 * Activates inspect mode, shows highlight and intent picker.
 */
export function inspectElementAtPoint(element: Element, x: number, y: number): void {
  // Ensure inspect mode is active
  if (!isInspectModeActive) {
    activateInspectMode(true);
  }
  updateHighlight(element);
  showIntentPicker(element, x, y);
}

// Track last picker position for refresh
let lastPickerX = 0;
let lastPickerY = 0;

/**
 * Refresh the picker with current queue data (call after adding/removing elements)
 */
export async function refreshPicker(): Promise<void> {
  const picker = document.getElementById('ai-devtools-intent-picker');
  if (!picker || !lockedElement) return;

  // Get picker position before closing
  const rect = picker.getBoundingClientRect();
  const x = lastPickerX || rect.left;
  const y = lastPickerY || rect.top;

  // Close current picker
  if (pickerCleanup) {
    pickerCleanup();
    pickerCleanup = null;
  }

  // Reopen with fresh data (showIntentPicker will detect source info for all queued elements)
  await showIntentPicker(lockedElement, x, y);
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
  document.addEventListener('click', handleGlobalShiftClick, true);
  window.addEventListener('blur', handleWindowBlur);
  console.log('[Clueprint] Inspect mode initialized. Hold Option to highlight elements, Shift+Click to multi-select.');
}

/**
 * Cleanup inspect mode listeners
 */
export function cleanupInspectMode(): void {
  document.removeEventListener('keydown', handleKeyDown, true);
  document.removeEventListener('keyup', handleKeyUp, true);
  document.removeEventListener('click', handleGlobalShiftClick, true);
  window.removeEventListener('blur', handleWindowBlur);
  deactivateInspectMode();
  clearQueue(); // Clear any remaining selection
  isOptionKeyHeld = false;
  lockedElement = null;
  pickerCleanup = null;
}
