/**
 * Free Select Mode - Cmd+Shift+Drag region selection
 */

import { getSelector } from '../utils/selector';
import { getAestheticStyles } from '../utils/styles';
import { getElementsInRegion, getDOMStructure } from '../capture/dom';
import { captureRegionScreenshot } from '../capture/screenshot';
import { mountRegionPicker, showConfirmation } from '../ui/mount';
import type {
  FreeSelectCapture,
  Intent,
  BrowserContext,
  RegionElement,
  AestheticAnalysis,
  ElementRect,
} from '../../types';

let isFreeSelectActive = false;
let isManuallyActivated = false; // True when activated via toolbar button
let isDrawing = false;
let startX = 0;
let startY = 0;
let selectionOverlay: HTMLElement | null = null;

/**
 * Create selection rectangle overlay
 */
function createSelectionOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = 'ai-devtools-selection';
  overlay.style.cssText = `
    position: fixed;
    border: 2px dashed #0066ff;
    background: rgba(0, 102, 255, 0.1);
    z-index: 2147483647;
    pointer-events: none;
    display: none;
  `;
  return overlay;
}

/**
 * Update selection rectangle dimensions
 */
function updateSelectionRect(endX: number, endY: number): void {
  if (!selectionOverlay) return;

  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  selectionOverlay.style.left = `${left}px`;
  selectionOverlay.style.top = `${top}px`;
  selectionOverlay.style.width = `${width}px`;
  selectionOverlay.style.height = `${height}px`;
  selectionOverlay.style.display = 'block';
}

/**
 * Handle keydown for Cmd+Shift combo and Escape
 */
function handleKeyDown(event: KeyboardEvent): void {
  // Escape to cancel
  if (event.key === 'Escape') {
    if (isFreeSelectActive) {
      deactivateFreeSelectDrag();
    }
    return;
  }

  // Cmd+Shift (Mac) or Ctrl+Shift (Windows)
  if ((event.metaKey || event.ctrlKey) && event.shiftKey) {
    if (!isFreeSelectActive) {
      activateFreeSelectDrag();
    }
  }
}

/**
 * Handle keyup to deactivate
 */
function handleKeyUp(event: KeyboardEvent): void {
  if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
    if (isFreeSelectActive && !isDrawing) {
      deactivateFreeSelectDrag();
    }
  }
}

/**
 * Handle mouse down to start selection
 */
function handleMouseDown(event: MouseEvent): void {
  if (!isFreeSelectActive) return;

  // Require modifier keys unless manually activated via toolbar
  if (!isManuallyActivated && !((event.metaKey || event.ctrlKey) && event.shiftKey)) return;

  // Ignore clicks on our own UI elements
  if ((event.target as HTMLElement)?.id?.startsWith('ai-devtools-')) return;

  event.preventDefault();
  event.stopPropagation();

  isDrawing = true;
  startX = event.clientX;
  startY = event.clientY;

  if (!selectionOverlay) {
    selectionOverlay = createSelectionOverlay();
    document.body.appendChild(selectionOverlay);
  }

  updateSelectionRect(startX, startY);
}

/**
 * Handle mouse move during drag
 */
function handleMouseMove(event: MouseEvent): void {
  if (!isDrawing) return;

  event.preventDefault();
  updateSelectionRect(event.clientX, event.clientY);
}

/**
 * Handle mouse up to complete selection
 */
function handleMouseUp(event: MouseEvent): void {
  if (!isDrawing) return;

  event.preventDefault();
  event.stopPropagation();

  isDrawing = false;

  const endX = event.clientX;
  const endY = event.clientY;

  // Calculate final rect
  const rect: ElementRect = {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };

  // Minimum size check
  if (rect.width < 20 || rect.height < 20) {
    hideSelection();
    deactivateFreeSelectDrag();
    return;
  }

  // Show intent picker
  showRegionIntentPicker(rect, endX, endY);
}

/**
 * Hide selection overlay
 */
function hideSelection(): void {
  if (selectionOverlay) {
    selectionOverlay.style.display = 'none';
  }
}

/**
 * Remove selection overlay
 */
function removeSelection(): void {
  if (selectionOverlay) {
    selectionOverlay.remove();
    selectionOverlay = null;
  }
}

/**
 * Show intent picker for region selection using Shadow DOM
 */
function showRegionIntentPicker(rect: ElementRect, x: number, y: number): void {
  mountRegionPicker(
    x,
    y,
    Math.round(rect.width),
    Math.round(rect.height),
    async (intent, note) => {
      await selectRegion(rect, intent, note);
    },
    () => {
      hideSelection();
      deactivateFreeSelectDrag();
    }
  );
}

/**
 * Select region and capture data
 *
 * Intent-specific data:
 * - tag: Just element list (minimal context for AI awareness)
 * - fix: Include console errors, network failures (debugging context)
 * - beautify: Include screenshot and aesthetic analysis (visual context)
 */
async function selectRegion(rect: ElementRect, intent: Intent, userNote?: string): Promise<void> {
  // Get browser context only for fix intent
  const browserContext = intent === 'fix'
    ? await getBrowserContext()
    : { errors: [], networkFailures: [] };

  // Capture screenshot only for beautify intent
  const screenshot = intent === 'beautify'
    ? (await captureRegionScreenshot(rect) || '')
    : '';

  // Get elements in region
  const domRect = new DOMRect(rect.left, rect.top, rect.width, rect.height);
  const elements = getElementsInRegion(domRect);

  // Extract element info
  const regionElements: RegionElement[] = elements.slice(0, 20).map(el => ({
    selector: getSelector(el),
    tag: el.tagName.toLowerCase(),
    text: el.textContent?.trim().slice(0, 50) || '',
    role: el.getAttribute('role') || getSemanticRole(el),
    styles: getAestheticStyles(el),
    hasInteractionStates: hasInteractionStates(el),
  }));

  // Build structure representation
  const commonAncestor = findCommonAncestor(elements);
  const structure = commonAncestor ? getDOMStructure(commonAncestor, 4) : '';

  // Aesthetic analysis only for beautify intent
  let aestheticAnalysis: AestheticAnalysis | undefined;
  if (intent === 'beautify') {
    aestheticAnalysis = analyzeAesthetics(elements);
  }

  const capture: FreeSelectCapture = {
    mode: 'free-select',
    intent,
    userNote,
    timestamp: Date.now(),
    region: rect,
    screenshot,
    elements: regionElements,
    structure,
    aestheticAnalysis,
    browserContext,
  };

  // Send to background
  await chrome.runtime.sendMessage({
    type: 'REGION_SELECTED',
    payload: capture,
  });

  // Show confirmation
  showRegionConfirmation(rect);

  // Cleanup
  hideSelection();
  deactivateFreeSelectDrag();
}

/**
 * Get semantic role for element
 */
function getSemanticRole(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const roleMap: Record<string, string> = {
    a: 'link',
    button: 'button',
    input: 'input',
    select: 'select',
    textarea: 'textbox',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
    img: 'image',
    nav: 'navigation',
    main: 'main',
    header: 'banner',
    footer: 'contentinfo',
    aside: 'complementary',
    form: 'form',
    table: 'table',
    ul: 'list',
    ol: 'list',
    li: 'listitem',
  };
  return roleMap[tag] || 'generic';
}

/**
 * Check if element has :hover/:focus styles defined
 */
function hasInteractionStates(element: Element): boolean {
  // This is a heuristic - check for common interactive elements
  const tag = element.tagName.toLowerCase();
  const interactiveTags = ['a', 'button', 'input', 'select', 'textarea'];

  if (interactiveTags.includes(tag)) return true;

  // Check for cursor: pointer
  const computed = getComputedStyle(element);
  return computed.cursor === 'pointer';
}

/**
 * Analyze aesthetics of elements
 */
function analyzeAesthetics(elements: Element[]): AestheticAnalysis {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const colorPalette: string[] = [];

  for (const el of elements.slice(0, 10)) {
    const computed = getComputedStyle(el);

    // Collect colors
    const colors = [computed.color, computed.backgroundColor, computed.borderColor];
    for (const color of colors) {
      if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)' && !colorPalette.includes(color)) {
        colorPalette.push(color);
      }
    }

    // Check for common issues
    const tag = el.tagName.toLowerCase();

    if (['button', 'a'].includes(tag)) {
      if (computed.borderRadius === '0px') {
        if (!issues.includes('Buttons/links have no border-radius')) {
          issues.push('Buttons/links have no border-radius');
          suggestions.push('Add border-radius (4-8px) for softer appearance');
        }
      }
      if (computed.transition === 'all 0s ease 0s' || computed.transition === 'none') {
        if (!issues.includes('Interactive elements lack transitions')) {
          issues.push('Interactive elements lack transitions');
          suggestions.push('Add hover/focus transitions for polish');
        }
      }
    }

    // Check padding
    const padding = parseInt(computed.padding);
    if (!isNaN(padding) && padding < 8 && ['button', 'a', 'input'].includes(tag)) {
      if (!issues.includes('Cramped padding on interactive elements')) {
        issues.push('Cramped padding on interactive elements');
        suggestions.push('Increase padding for better touch targets');
      }
    }
  }

  return {
    issues: issues.slice(0, 5),
    suggestions: suggestions.slice(0, 5),
    colorPalette: colorPalette.slice(0, 10),
  };
}

/**
 * Find common ancestor of elements
 */
function findCommonAncestor(elements: Element[]): Element | null {
  if (elements.length === 0) return null;
  if (elements.length === 1) return elements[0].parentElement;

  let ancestor: Element | null = elements[0];
  while (ancestor) {
    if (elements.every(el => ancestor!.contains(el))) {
      return ancestor;
    }
    ancestor = ancestor.parentElement;
  }
  return document.body;
}

/**
 * Get browser context
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
 * Show confirmation for region selection
 */
function showRegionConfirmation(rect: ElementRect): void {
  showConfirmation(
    rect.left + rect.width / 2 - 100,
    rect.top + rect.height / 2 - 20,
    '✓ Region captured! Tell your AI assistant.',
    2000
  );
}

/**
 * Activate free select drag mode
 * @param manual - If true, dragging works without holding Cmd+Shift
 */
export function activateFreeSelectDrag(manual = false): void {
  if (isFreeSelectActive) return;

  isFreeSelectActive = true;
  isManuallyActivated = manual;
  document.body.style.cursor = 'crosshair';
  document.body.style.userSelect = 'none';

  console.log('[Clueprint] Region select activated.', manual ? 'Drag to select.' : 'Cmd+Shift+Drag to select.');
}

/**
 * Deactivate free select drag mode
 */
export function deactivateFreeSelectDrag(): void {
  if (!isFreeSelectActive) return;

  isFreeSelectActive = false;
  isManuallyActivated = false;
  isDrawing = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  removeSelection();
}

/**
 * Initialize free select mode listeners
 */
export function initFreeSelectMode(): void {
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', handleKeyUp, true);
  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('mouseup', handleMouseUp, true);
}

/**
 * Cleanup free select mode
 */
export function cleanupFreeSelectMode(): void {
  document.removeEventListener('keydown', handleKeyDown, true);
  document.removeEventListener('keyup', handleKeyUp, true);
  document.removeEventListener('mousedown', handleMouseDown, true);
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('mouseup', handleMouseUp, true);

  deactivateFreeSelectDrag();
}

/**
 * Check if free select is active
 */
export function isFreeSelectMode(): boolean {
  return isFreeSelectActive;
}
