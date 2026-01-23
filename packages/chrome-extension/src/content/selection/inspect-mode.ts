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
let savedOverflow: string | null = null; // Saved body overflow for scroll lock
let pickerCleanup: (() => void) | null = null; // Cleanup function for the current picker

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

export interface ElementContext {
  tag: string;
  attrs: Array<{ name: string; value: string }>;
  textContent: string;
  parents: Array<{ label: string }>;
  parentElements: Element[];
  pageUrl: string;
  childCount: number;
  styles: Array<{ prop: string; value: string }>;
}

/**
 * Extract element context for the picker UI
 */
function getElementContext(element: Element): ElementContext {
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
 * Lock page scrolling (prevent highlight from drifting away from element)
 */
function lockScroll(): void {
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

  // If picker is already shown, don't select a new element
  // Let the click propagate to the picker's click-outside handler
  // Check both lockedElement and the DOM element for reliability
  if (lockedElement || document.getElementById('ai-devtools-intent-picker')) return;

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

  // Lock scrolling to prevent highlight from drifting
  lockScroll();

  // Remove mousemove listener entirely while picker is shown
  document.removeEventListener('mousemove', handleMouseMove, true);

  // Hide the hover label while picker is shown (keep highlight visible)
  if (currentLabel) {
    currentLabel.style.display = 'none';
  }

  const context = getElementContext(element);

  const handleChangeElement = (newElement: Element): ElementContext => {
    lockedElement = newElement;
    updateHighlight(newElement);
    if (currentLabel) {
      currentLabel.style.display = 'none';
    }
    return getElementContext(newElement);
  };

  const { cleanup } = mountInspectPicker(
    x,
    y,
    context,
    async (intent) => {
      pickerCleanup = null;
      unlockScroll();
      await selectElement(lockedElement!, intent);
    },
    () => {
      pickerCleanup = null;
      unlockScroll();
      lockedElement = null;
      deactivateInspectMode();
    },
    handleChangeElement
  );
  pickerCleanup = cleanup;
}

/**
 * Select element and send to background
 *
 * Intent-specific data:
 * - tag: Just element identification (minimal context for AI awareness)
 * - fix: Include console errors, network failures (debugging context)
 * - beautify: Include screenshot (visual context for styling)
 */
async function selectElement(element: Element, intent: Intent): Promise<void> {
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
  };

  // Send to background script
  await chrome.runtime.sendMessage({
    type: 'ELEMENT_SELECTED',
    payload: fullCapture,
  });

  // Show confirmation
  showSelectionConfirmation(element);

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
function showSelectionConfirmation(element: Element): void {
  const rect = element.getBoundingClientRect();
  showConfirmation(rect.left, rect.top - 30, '✓ Element captured');
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
  pickerCleanup = null;
}
