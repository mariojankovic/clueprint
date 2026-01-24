/**
 * Unified Select Mode - Click = element inspect, Drag = region select
 */

import { getSelector } from '../utils/selector';
import { getAestheticStyles } from '../utils/styles';
import { getElementsInRegion, getDOMStructure } from '../capture/dom';
import { detectSourceInfo } from '../capture/source-detect';
import { captureRegionScreenshot } from '../capture/screenshot';
import { mountRegionPicker, showConfirmation } from '../ui/mount';
import { inspectElementAtPoint } from './inspect-mode';
import type {
  FreeSelectCapture,
  Intent,
  BrowserContext,
  RegionElement,
  AestheticAnalysis,
  ElementRect,
} from '../../types';

let isFreeSelectActive = false;
let isDrawing = false;
let isPendingDrag = false; // mousedown happened but threshold not yet crossed
let startX = 0;
let startY = 0;
let selectionOverlay: HTMLElement | null = null;
let pickerCleanup: (() => void) | null = null; // Cleanup function for the current picker
let highlightOverlays = new Map<Element, HTMLElement>();
let highlightRAF: number | null = null;

// Hover highlight state (single-element highlight before drag)
let hoverHighlight: HTMLElement | null = null;
let hoverLabel: HTMLElement | null = null;
let hoveredElement: Element | null = null;
let blockNextClick = false; // Block the click event that follows mouseup on element select

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
 * Create hover highlight overlay (single element highlight)
 */
function createHoverHighlight(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = 'ai-devtools-select-highlight';
  overlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid #0066ff;
    background: rgba(0, 102, 255, 0.1);
    z-index: 2147483647;
    transition: all 0.1s ease;
    border-radius: 4px;
    display: none;
  `;
  return overlay;
}

/**
 * Create hover label tooltip
 */
function createHoverLabel(): HTMLElement {
  const label = document.createElement('div');
  label.id = 'ai-devtools-select-label';
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
    display: none;
  `;
  return label;
}

/**
 * Update hover highlight to match element
 */
function updateHoverHighlight(element: Element): void {
  if (!hoverHighlight) {
    hoverHighlight = createHoverHighlight();
    document.body.appendChild(hoverHighlight);
  }
  if (!hoverLabel) {
    hoverLabel = createHoverLabel();
    document.body.appendChild(hoverLabel);
  }

  const rect = element.getBoundingClientRect();

  hoverHighlight.style.top = `${rect.top}px`;
  hoverHighlight.style.left = `${rect.left}px`;
  hoverHighlight.style.width = `${rect.width}px`;
  hoverHighlight.style.height = `${rect.height}px`;
  hoverHighlight.style.display = 'block';

  // Label
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = Array.from(element.classList).slice(0, 2).map(c => `.${c}`).join('');
  const dims = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
  let name = tag + id + classes;
  if (name.length > 40) name = name.slice(0, 37) + '...';
  hoverLabel.textContent = `${name} ${dims}`;

  const labelHeight = 24;
  const labelTop = rect.top > labelHeight + 5 ? rect.top - labelHeight - 5 : rect.bottom + 5;
  hoverLabel.style.top = `${labelTop}px`;
  hoverLabel.style.left = `${rect.left}px`;
  hoverLabel.style.display = 'block';
}

/**
 * Hide hover highlight
 */
function hideHoverHighlight(): void {
  if (hoverHighlight) hoverHighlight.style.display = 'none';
  if (hoverLabel) hoverLabel.style.display = 'none';
  hoveredElement = null;
}

/**
 * Remove hover highlight elements from DOM
 */
function removeHoverHighlight(): void {
  hoverHighlight?.remove();
  hoverHighlight = null;
  hoverLabel?.remove();
  hoverLabel = null;
  hoveredElement = null;
}

/**
 * Handle keydown for Escape to cancel
 */
function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && isFreeSelectActive) {
    deactivateFreeSelectDrag();
  }
}

/**
 * Handle mouse down to start potential drag or click
 */
function handleMouseDown(event: MouseEvent): void {
  if (!isFreeSelectActive) return;

  // Ignore clicks on our own UI elements
  if ((event.target as HTMLElement)?.id?.startsWith('ai-devtools-')) return;

  // If picker is shown, don't start new selection
  // Let the click propagate to close the picker
  if (document.getElementById('ai-devtools-intent-picker')) return;

  event.preventDefault();
  event.stopPropagation();

  // Clear highlights from any previous selection
  clearHighlights();

  // Start pending drag — we don't know yet if this is a click or drag
  isPendingDrag = true;
  isDrawing = false;
  startX = event.clientX;
  startY = event.clientY;
}

/**
 * Handle mouse move — hover highlight or drag
 */
function handleMouseMove(event: MouseEvent): void {
  if (!isFreeSelectActive) return;

  // Pending drag: check if we've crossed the threshold to start region drawing
  if (isPendingDrag) {
    const dx = Math.abs(event.clientX - startX);
    const dy = Math.abs(event.clientY - startY);

    if (dx > 20 || dy > 20) {
      // Crossed threshold — switch to region drawing mode
      isPendingDrag = false;
      isDrawing = true;
      hideHoverHighlight();

      if (!selectionOverlay) {
        selectionOverlay = createSelectionOverlay();
        document.body.appendChild(selectionOverlay);
      }
      updateSelectionRect(event.clientX, event.clientY);
    }
    return;
  }

  // Active drawing: update selection rectangle and element highlights
  if (isDrawing) {
    event.preventDefault();
    updateSelectionRect(event.clientX, event.clientY);

    const endX = event.clientX;
    const endY = event.clientY;
    if (highlightRAF) cancelAnimationFrame(highlightRAF);
    highlightRAF = requestAnimationFrame(() => {
      updateHighlights(endX, endY);
      highlightRAF = null;
    });
    return;
  }

  // No button held: show hover highlight on element under cursor
  if ((event.target as HTMLElement)?.id?.startsWith('ai-devtools-')) return;
  if (document.getElementById('ai-devtools-intent-picker')) return;

  const element = event.target as Element;
  if (element && element !== hoveredElement) {
    hoveredElement = element;
    updateHoverHighlight(element);
  }
}

/**
 * Handle mouse up to complete selection
 */
function handleMouseUp(event: MouseEvent): void {
  // Case 1: Click (never crossed drag threshold)
  if (isPendingDrag) {
    isPendingDrag = false;
    event.preventDefault();
    event.stopPropagation();

    const endX = event.clientX;
    const endY = event.clientY;

    // Block the subsequent click event from reaching the page
    blockNextClick = true;

    // Hide hover highlight and deactivate mode, then trigger inspect
    hideHoverHighlight();
    deactivateFreeSelectDrag();

    const elementAtPoint = document.elementFromPoint(endX, endY);
    if (elementAtPoint && !elementAtPoint.id?.startsWith('ai-devtools-')) {
      inspectElementAtPoint(elementAtPoint, endX, endY);
    }
    return;
  }

  // Case 2: Region drag completed
  if (!isDrawing) return;

  event.preventDefault();
  event.stopPropagation();

  isDrawing = false;

  // Cancel pending rAF and do a final synchronous highlight update
  if (highlightRAF) {
    cancelAnimationFrame(highlightRAF);
    highlightRAF = null;
  }

  const endX = event.clientX;
  const endY = event.clientY;
  updateHighlights(endX, endY);

  // Calculate final rect
  const rect: ElementRect = {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };

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
 * Create a highlight overlay positioned over a target element
 */
function createHighlightOverlay(el: Element): HTMLElement {
  const rect = el.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.className = 'ai-devtools-region-highlight';
  overlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid #0066ff;
    background: rgba(0, 102, 255, 0.08);
    border-radius: 4px;
    z-index: 2147483647;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
  `;
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Remove a highlight overlay for an element
 */
function removeHighlight(el: Element): void {
  const overlay = highlightOverlays.get(el);
  if (overlay) {
    overlay.remove();
    highlightOverlays.delete(el);
  }
}

/**
 * Clear all highlight overlays
 */
function clearHighlights(): void {
  for (const [, overlay] of highlightOverlays) {
    overlay.remove();
  }
  highlightOverlays.clear();
}

/**
 * Update highlights based on the current selection rect
 */
function updateHighlights(endX: number, endY: number): void {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  if (width < 20 || height < 20) return;

  const domRect = new DOMRect(left, top, width, height);
  const elements = getElementsInRegion(domRect);
  const newSet = new Set<Element>(elements);

  // Remove overlays for elements no longer in rect
  for (const el of highlightOverlays.keys()) {
    if (!newSet.has(el)) {
      removeHighlight(el);
    }
  }

  // Add overlays for newly included elements
  for (const el of newSet) {
    if (!highlightOverlays.has(el)) {
      const overlay = createHighlightOverlay(el);
      highlightOverlays.set(el, overlay);
    }
  }
}

/**
 * Get region context for the picker UI
 */
function getRegionContext(rect: ElementRect) {
  const domRect = new DOMRect(rect.left, rect.top, rect.width, rect.height);
  const elements = getElementsInRegion(domRect);

  // Count elements by tag
  const tagCounts: Record<string, number> = {};
  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }

  // Sort by count descending, take top 6
  const tagBreakdown = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag, count]) => ({ tag, count }));

  // Find common ancestor
  const ancestor = findCommonAncestor(elements);
  let ancestorLabel = '';
  if (ancestor && ancestor !== document.body) {
    const tag = ancestor.tagName.toLowerCase();
    const id = ancestor.id ? `#${ancestor.id}` : '';
    const cls = ancestor.classList.length > 0 ? `.${ancestor.classList[0]}` : '';
    ancestorLabel = tag + id + cls;
  }

  // Find first heading as region title
  const headingTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  let title = '';
  for (const el of elements) {
    if (headingTags.includes(el.tagName.toLowerCase())) {
      const text = el.textContent?.trim() || '';
      if (text) {
        title = text.length > 50 ? text.slice(0, 47) + '...' : text;
        break;
      }
    }
  }

  // Collect interactive element labels (buttons, links)
  const labels: string[] = [];
  const seenLabels = new Set<string>();
  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button') {
      const text = el.textContent?.trim() || '';
      if (text && text.length <= 30 && !seenLabels.has(text)) {
        seenLabels.add(text);
        labels.push(text);
        if (labels.length >= 6) break;
      }
    }
  }

  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    elementCount: elements.length,
    tagBreakdown,
    ancestorLabel,
    title,
    labels,
    pageUrl: window.location.hostname + window.location.pathname,
  };
}

/**
 * Show intent picker for region selection using Shadow DOM
 */
function showRegionIntentPicker(rect: ElementRect, x: number, y: number): void {
  const context = getRegionContext(rect);

  const { cleanup } = mountRegionPicker(
    x,
    y,
    context,
    async (intent, includeScreenshot) => {
      pickerCleanup = null;
      await selectRegion(rect, intent, includeScreenshot);
    },
    () => {
      pickerCleanup = null;
      hideSelection();
      deactivateFreeSelectDrag();
    }
  );
  pickerCleanup = cleanup;
}

/**
 * Select region and capture data
 *
 * Intent-specific data:
 * - tag: Just element list (minimal context for AI awareness)
 * - fix: Include console errors, network failures (debugging context)
 * - beautify: Include screenshot and aesthetic analysis (visual context)
 */
async function selectRegion(rect: ElementRect, intent: Intent, includeScreenshot: boolean): Promise<void> {
  // Get browser context only for fix intent
  const browserContext = intent === 'fix'
    ? await getBrowserContext()
    : { errors: [], networkFailures: [] };

  // Capture screenshot if user opted in
  const screenshot = includeScreenshot
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
    sourceInfo: detectSourceInfo(el) || undefined,
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
 * Block native click events during select mode
 */
function handleClickBlock(event: MouseEvent): void {
  // Block the click that follows a mouseup-based element select
  if (blockNextClick) {
    blockNextClick = false;
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (!isFreeSelectActive) return;
  if ((event.target as HTMLElement)?.id?.startsWith('ai-devtools-')) return;
  if (document.getElementById('ai-devtools-intent-picker')) return;

  event.preventDefault();
  event.stopPropagation();
}

/**
 * Activate free select drag mode
 */
export function activateFreeSelectDrag(): void {
  if (isFreeSelectActive) return;

  isFreeSelectActive = true;
  document.body.style.userSelect = 'none';

  console.log('[Clueprint] Select mode activated. Click = element, drag = region.');
}

/**
 * Deactivate free select drag mode
 */
export function deactivateFreeSelectDrag(): void {
  if (!isFreeSelectActive) return;

  isFreeSelectActive = false;
  isDrawing = false;
  isPendingDrag = false;
  document.body.style.userSelect = '';

  // Cancel any pending highlight update
  if (highlightRAF) {
    cancelAnimationFrame(highlightRAF);
    highlightRAF = null;
  }

  // Clear element highlights and hover highlight
  clearHighlights();
  removeHoverHighlight();

  // Properly cleanup picker (unmounts Svelte component and removes DOM)
  if (pickerCleanup) {
    pickerCleanup();
    pickerCleanup = null;
  }

  removeSelection();
}

/**
 * Initialize free select mode listeners
 */
export function initFreeSelectMode(): void {
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('mouseup', handleMouseUp, true);
  document.addEventListener('click', handleClickBlock, true);
}

/**
 * Cleanup free select mode
 */
export function cleanupFreeSelectMode(): void {
  document.removeEventListener('keydown', handleKeyDown, true);
  document.removeEventListener('mousedown', handleMouseDown, true);
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('mouseup', handleMouseUp, true);
  document.removeEventListener('click', handleClickBlock, true);

  deactivateFreeSelectDrag();
}

/**
 * Check if free select is active
 */
export function isFreeSelectMode(): boolean {
  return isFreeSelectActive;
}

/**
 * Toggle free select mode
 */
export function toggleFreeSelectDrag(): void {
  if (isFreeSelectActive) {
    deactivateFreeSelectDrag();
  }
  activateFreeSelectDrag();
}
