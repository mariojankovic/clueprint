/**
 * Unified Select Mode - Click = element inspect, Drag = region select
 */

import { getElementsInRegion } from '../capture/dom';
import { showToast } from '../ui/mount';
import { inspectElementAtPoint, addToQueue, isInQueue, getQueueCount, removeFromQueue, refreshPicker, clearQueue, bulkAddToQueue } from './inspect-mode';
import type { ElementRect } from '../../types';

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
 * Check if an element is part of our UI (picker, widget, highlights, etc.)
 * Walks up the DOM tree and through Shadow DOM boundaries
 */
function isElementOurUI(element: Element | null): boolean {
  let el: Element | null = element;
  while (el) {
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
    // Walk up to parent or shadow host
    el = el.parentElement || (el.getRootNode() as ShadowRoot)?.host || null;
  }
  return false;
}

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

  // Ignore clicks on our own UI elements (picker, widget, highlights, etc.)
  if (isOurUIElement(event)) return;

  event.preventDefault();
  event.stopPropagation();

  // Clear region highlights from any previous drag (not queue highlights)
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
  // (also works when picker is shown so user can see what they're about to add)
  if (isOurUIElement(event)) return;

  const element = event.target as Element;
  if (element && element !== hoveredElement) {
    hoveredElement = element;
    updateHoverHighlight(element);
  }
}

/**
 * Check if picker is currently shown
 */
function isPickerShown(): boolean {
  return !!document.getElementById('ai-devtools-intent-picker');
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

    const elementAtPoint = document.elementFromPoint(endX, endY);
    if (!elementAtPoint || isElementOurUI(elementAtPoint)) {
      // Only deactivate if no picker is shown
      if (!isPickerShown()) {
        hideHoverHighlight();
        deactivateFreeSelectDrag();
      }
      return;
    }

    // If picker is already shown, toggle element in queue (Figma-style)
    if (isPickerShown()) {
      if (isInQueue(elementAtPoint)) {
        removeFromQueue(elementAtPoint);
        const count = getQueueCount();
        if (count > 0) {
          showToast(`${count} selected`, 'info', 1500);
        }
      } else {
        addToQueue(elementAtPoint);
        const count = getQueueCount();
        showToast(`${count} selected`, 'success', 1500);
      }
      // Refresh picker to show updated selection
      refreshPicker();
      return;
    }

    // First selection: add to queue and show picker
    addToQueue(elementAtPoint);
    hideHoverHighlight();
    // Keep free-select active so user can click more elements
    inspectElementAtPoint(elementAtPoint, endX, endY);
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

  // Calculate final rect
  const rect: ElementRect = {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };

  // Get elements in the dragged region
  const domRect = new DOMRect(rect.left, rect.top, rect.width, rect.height);
  const elements = getElementsInRegion(domRect);

  // Clear region highlights (blue dashed ones) - we'll use queue highlights instead
  clearHighlights();
  removeSelection();

  if (elements.length === 0) {
    showToast('No elements in region', 'info', 1500);
    return;
  }

  // Bulk add all elements to the queue with the region rect for screenshot
  bulkAddToQueue(elements, { x: rect.left, y: rect.top, width: rect.width, height: rect.height });

  // Hide hover highlight and show element picker
  hideHoverHighlight();

  // Use the first element as the "main" element for the picker
  const mainElement = elements[0];
  showToast(`${elements.length} elements selected`, 'success', 1500);
  inspectElementAtPoint(mainElement, endX, endY);
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
 * Block native click events during select mode
 */
function handleClickBlock(event: MouseEvent): void {
  // Block the click that follows a mouseup-based element select
  if (blockNextClick) {
    blockNextClick = false;
    event.preventDefault();
    event.stopImmediatePropagation(); // Stop ALL other click handlers
    return;
  }

  if (!isFreeSelectActive) return;
  // Allow clicks on our UI elements (picker, widget, etc.)
  if (isOurUIElement(event)) return;
  if (isPickerShown()) return;

  event.preventDefault();
  event.stopImmediatePropagation(); // Stop ALL other click handlers
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

  // Clear the element queue (from inspect-mode)
  clearQueue();

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
