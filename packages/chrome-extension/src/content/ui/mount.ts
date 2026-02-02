/**
 * Shadow DOM mounting utilities for Svelte components
 * Handles creating isolated Shadow DOM containers and mounting Svelte components
 */

import { mount, unmount } from 'svelte';
import Picker from '../../shared/components/Picker.svelte';
import Toast from '../../shared/components/Toast.svelte';
import ConfirmationToast from '../../shared/components/ConfirmationToast.svelte';
import type { CaptureOptions, SourceInfo, QueuedElement } from '../../types';

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap';

// Inject font into main document (Shadow DOM @import doesn't work reliably)
let fontInjected = false;
function injectFont(): void {
  if (fontInjected) return;
  if (document.getElementById('clueprint-font')) {
    fontInjected = true;
    return;
  }

  const link = document.createElement('link');
  link.id = 'clueprint-font';
  link.rel = 'stylesheet';
  link.href = FONT_URL;
  document.head.appendChild(link);
  fontInjected = true;
}

/**
 * Create a Shadow DOM host element at a fixed position
 * Ensures the element stays fully within viewport bounds
 */
function createShadowHost(
  id: string,
  x: number,
  y: number,
  maxHeight = 280,
  maxWidth = 300
): { host: HTMLElement; shadow: ShadowRoot } {
  injectFont();

  // Remove existing
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const padding = 12; // Minimum distance from viewport edges
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Smart vertical positioning: prefer below click, then above, then top of viewport
  const spaceBelow = viewportHeight - y - padding;
  const spaceAbove = y - padding;
  let top: number;

  if (spaceBelow >= maxHeight) {
    // Enough space below - position just below the click
    top = y + padding;
  } else if (spaceAbove >= maxHeight) {
    // Enough space above - position above the click
    top = y - maxHeight - padding;
  } else {
    // Not enough space either way - center vertically in viewport
    top = Math.max(padding, (viewportHeight - maxHeight) / 2);
  }

  // Smart horizontal positioning: prefer right of click, then left, then edge
  let left = x + padding;
  if (left + maxWidth > viewportWidth - padding) {
    // Would overflow right - try left of click
    left = x - maxWidth - padding;
  }

  // Final clamp to ensure we're always within viewport
  const maxTop = Math.max(padding, viewportHeight - maxHeight - padding);
  const maxLeft = Math.max(padding, viewportWidth - maxWidth - padding);
  top = Math.max(padding, Math.min(top, maxTop));
  left = Math.max(padding, Math.min(left, maxLeft));

  // Create host element
  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = `
    position: fixed;
    top: ${top}px;
    left: ${left}px;
    z-index: 2147483647;
  `;

  // Attach shadow DOM
  const shadow = host.attachShadow({ mode: 'closed' });

  // Minimal reset for Shadow DOM isolation - components handle their own styles via Tailwind
  const style = document.createElement('style');
  style.textContent = `:host { all: initial; }`;
  shadow.appendChild(style);

  // Add to document
  document.body.appendChild(host);

  return { host, shadow };
}

// Element mode context
export interface ElementPickerContext {
  mode: 'element';
  tag: string;
  attrs: Array<{ name: string; value: string }>;
  textContent: string;
  parents: Array<{ label: string }>;
  parentElements: Element[];
  pageUrl: string;
  childCount: number;
  styles: Array<{ prop: string; value: string }>;
  sourceInfo?: SourceInfo;
  queueCount?: number;
  queuedElements?: QueuedElement[];
}

export type PickerContext = ElementPickerContext;

interface ElementCallbacks {
  onChangeElement?: (element: Element) => ElementPickerContext;
  onRemoveQueuedElement?: (index: number) => void;
}

/**
 * Mount unified Picker at position
 */
export function mountPicker(
  x: number,
  y: number,
  context: PickerContext,
  onCapture: (options: CaptureOptions) => void,
  onClose: () => void,
  callbacks?: ElementCallbacks
): { cleanup: () => void } {
  const { host, shadow } = createShadowHost('ai-devtools-intent-picker', x, y, 520, 380);

  // Create mount target inside shadow
  const target = document.createElement('div');
  shadow.appendChild(target);

  let component: ReturnType<typeof mount> | null = null;
  let parentHighlight: HTMLElement | null = null;
  let queuedElementHighlight: HTMLElement | null = null;
  let currentContext = context;

  const removeParentHighlight = () => {
    if (parentHighlight) {
      parentHighlight.remove();
      parentHighlight = null;
    }
  };

  const removeQueuedElementHighlight = () => {
    if (queuedElementHighlight) {
      queuedElementHighlight.remove();
      queuedElementHighlight = null;
    }
  };

  const cleanup = () => {
    removeParentHighlight();
    removeQueuedElementHighlight();
    if (component) {
      unmount(component);
      component = null;
    }
    host.remove();
  };

  const handleClose = () => {
    cleanup();
    onClose();
  };

  const handleCapture = (options: CaptureOptions) => {
    cleanup();
    onCapture(options);
  };

  // Element-specific handlers
  const handleHighlightParent = (index: number) => {
    const el = currentContext.parentElements[index];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!parentHighlight) {
      parentHighlight = document.createElement('div');
      parentHighlight.style.cssText = `
        position: fixed;
        pointer-events: none;
        border: 2px solid rgba(0, 102, 255, 0.5);
        background: rgba(0, 102, 255, 0.05);
        z-index: 2147483646;
        border-radius: 4px;
        transition: all 0.1s ease;
      `;
      document.body.appendChild(parentHighlight);
    }
    parentHighlight.style.top = `${rect.top}px`;
    parentHighlight.style.left = `${rect.left}px`;
    parentHighlight.style.width = `${rect.width}px`;
    parentHighlight.style.height = `${rect.height}px`;
  };

  const handleUnhighlightParent = () => {
    removeParentHighlight();
  };

  const handleHighlightQueuedElement = (index: number) => {
    const item = currentContext.queuedElements?.[index];
    if (!item) return;
    const rect = item.element.getBoundingClientRect();
    if (!queuedElementHighlight) {
      queuedElementHighlight = document.createElement('div');
      queuedElementHighlight.style.cssText = `
        position: fixed;
        pointer-events: none;
        border: 2px solid rgba(255, 255, 255, 0.6);
        background: rgba(255, 255, 255, 0.08);
        z-index: 2147483646;
        border-radius: 4px;
        transition: all 0.1s ease;
      `;
      document.body.appendChild(queuedElementHighlight);
    }
    queuedElementHighlight.style.top = `${rect.top}px`;
    queuedElementHighlight.style.left = `${rect.left}px`;
    queuedElementHighlight.style.width = `${rect.width}px`;
    queuedElementHighlight.style.height = `${rect.height}px`;
  };

  const handleUnhighlightQueuedElement = () => {
    removeQueuedElementHighlight();
  };

  const handleRemoveQueuedElement = (index: number) => {
    removeQueuedElementHighlight();
    callbacks?.onRemoveQueuedElement?.(index);
  };

  const handleSelectParent = (index: number) => {
    if (!callbacks?.onChangeElement) return;
    const el = currentContext.parentElements[index];
    if (!el) return;

    // Get new context from inspect-mode (updates highlight + lockedElement)
    const newContext = callbacks.onChangeElement(el);
    currentContext = newContext;

    // Remove parent highlight
    removeParentHighlight();

    // Unmount and remount with new context
    if (component) {
      unmount(component);
      component = null;
    }

    component = mount(Picker, {
      target,
      props: {
        mode: 'element',
        tag: newContext.tag,
        attrs: newContext.attrs,
        textContent: newContext.textContent,
        parents: newContext.parents,
        pageUrl: newContext.pageUrl,
        childCount: newContext.childCount,
        styles: newContext.styles,
        sourceInfo: newContext.sourceInfo,
        queueCount: (context as ElementPickerContext).queueCount,
        queuedElements: (context as ElementPickerContext).queuedElements,
        onCapture: handleCapture,
        onClose: handleClose,
        onHighlightParent: handleHighlightParent,
        onUnhighlightParent: handleUnhighlightParent,
        onSelectParent: handleSelectParent,
        onHighlightQueuedElement: handleHighlightQueuedElement,
        onUnhighlightQueuedElement: handleUnhighlightQueuedElement,
        onRemoveQueuedElement: handleRemoveQueuedElement,
      },
    });
  };

  // Mount element picker
  component = mount(Picker, {
    target,
    props: {
      mode: 'element',
      tag: context.tag,
      attrs: context.attrs,
      textContent: context.textContent,
      parents: context.parents,
      pageUrl: context.pageUrl,
      childCount: context.childCount,
      styles: context.styles,
      sourceInfo: context.sourceInfo,
      queueCount: context.queueCount,
      queuedElements: context.queuedElements,
      onCapture: handleCapture,
      onClose: handleClose,
      onHighlightParent: handleHighlightParent,
      onUnhighlightParent: handleUnhighlightParent,
      onSelectParent: handleSelectParent,
      onHighlightQueuedElement: handleHighlightQueuedElement,
      onUnhighlightQueuedElement: handleUnhighlightQueuedElement,
      onRemoveQueuedElement: handleRemoveQueuedElement,
    },
  });

  return { cleanup };
}

// Legacy exports for backwards compatibility
export function mountInspectPicker(
  x: number,
  y: number,
  context: Omit<ElementPickerContext, 'mode'>,
  onCapture: (options: CaptureOptions) => void,
  onClose: () => void,
  onChangeElement?: (element: Element) => Omit<ElementPickerContext, 'mode'>,
  onRemoveQueuedElement?: (index: number) => void
): { cleanup: () => void } {
  return mountPicker(
    x,
    y,
    { ...context, mode: 'element' },
    onCapture,
    onClose,
    {
      onChangeElement: onChangeElement
        ? (el) => ({ ...onChangeElement(el), mode: 'element' })
        : undefined,
      onRemoveQueuedElement,
    }
  );
}

/**
 * Show a toast notification
 */
export function showToast(
  message: string,
  type: 'info' | 'success' | 'warning' = 'info',
  duration = 2500
): void {
  injectFont();

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

  // Add reset styles
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
    }
  `;
  shadow.appendChild(style);

  const target = document.createElement('div');
  shadow.appendChild(target);

  document.body.appendChild(host);

  mount(Toast, {
    target,
    props: {
      message,
      type,
      duration,
    },
  });

  setTimeout(() => host.remove(), duration);
}

/**
 * Show confirmation toast at position
 */
export function showConfirmation(
  x: number,
  y: number,
  message: string,
  duration = 2500
): void {
  injectFont();

  const host = document.createElement('div');
  host.id = 'ai-devtools-confirmation';
  host.style.cssText = `
    position: fixed;
    top: ${y}px;
    left: ${x}px;
    z-index: 2147483647;
    pointer-events: none;
  `;
  host.style.setProperty('--duration', `${duration}ms`);

  const shadow = host.attachShadow({ mode: 'closed' });

  // Add reset styles
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
    }
  `;
  shadow.appendChild(style);

  const target = document.createElement('div');
  shadow.appendChild(target);

  document.body.appendChild(host);

  mount(ConfirmationToast, {
    target,
    props: {
      message,
      duration,
    },
  });

  setTimeout(() => host.remove(), duration);
}
