/**
 * Shadow DOM mounting utilities for Svelte components
 * Handles creating isolated Shadow DOM containers and mounting Svelte components
 */

import { mount, unmount } from 'svelte';
import InspectPicker from '../../shared/components/InspectPicker.svelte';
import RegionPicker from '../../shared/components/RegionPicker.svelte';
import Toast from '../../shared/components/Toast.svelte';
import ConfirmationToast from '../../shared/components/ConfirmationToast.svelte';

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

  // Smart vertical positioning: show below click if space, otherwise above
  const spaceBelow = window.innerHeight - y;
  const spaceAbove = y;
  let top: number;
  if (spaceBelow >= maxHeight + 10) {
    // Enough space below
    top = y + 10;
  } else if (spaceAbove >= maxHeight + 10) {
    // Position above the click point
    top = y - maxHeight - 10;
  } else {
    // Not enough space either way, position at best available
    top = Math.max(10, Math.min(y + 10, window.innerHeight - maxHeight - 10));
  }

  // Smart horizontal positioning
  const left = Math.min(x + 10, window.innerWidth - maxWidth - 10);

  // Create host element
  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = `
    position: fixed;
    top: ${top}px;
    left: ${Math.max(10, left)}px;
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

interface PickerContext {
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
 * Mount Inspect Picker at position
 */
export function mountInspectPicker(
  x: number,
  y: number,
  context: PickerContext,
  onSelect: (intent: 'tag' | 'fix' | 'beautify') => void,
  onClose: () => void,
  onChangeElement?: (element: Element) => PickerContext
): { cleanup: () => void } {
  const { host, shadow } = createShadowHost('ai-devtools-intent-picker', x, y, 420, 380);

  // Create mount target inside shadow
  const target = document.createElement('div');
  shadow.appendChild(target);

  let component: ReturnType<typeof mount> | null = null;
  let parentHighlight: HTMLElement | null = null;
  let currentContext = context;

  const removeParentHighlight = () => {
    if (parentHighlight) {
      parentHighlight.remove();
      parentHighlight = null;
    }
  };

  const cleanup = () => {
    removeParentHighlight();
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

  const handleSelect = (intent: 'tag' | 'fix' | 'beautify') => {
    cleanup();
    onSelect(intent);
  };

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

  const handleSelectParent = (index: number) => {
    if (!onChangeElement) return;
    const el = currentContext.parentElements[index];
    if (!el) return;

    // Get new context from inspect-mode (updates highlight + lockedElement)
    const newContext = onChangeElement(el);
    currentContext = newContext;

    // Remove parent highlight
    removeParentHighlight();

    // Unmount and remount with new context
    if (component) {
      unmount(component);
      component = null;
    }

    component = mount(InspectPicker, {
      target,
      props: {
        tag: newContext.tag,
        attrs: newContext.attrs,
        textContent: newContext.textContent,
        parents: newContext.parents,
        pageUrl: newContext.pageUrl,
        childCount: newContext.childCount,
        styles: newContext.styles,
        onSelect: handleSelect,
        onClose: handleClose,
        onHighlightParent: handleHighlightParent,
        onUnhighlightParent: handleUnhighlightParent,
        onSelectParent: handleSelectParent,
      },
    });
  };

  component = mount(InspectPicker, {
    target,
    props: {
      tag: context.tag,
      attrs: context.attrs,
      textContent: context.textContent,
      parents: context.parents,
      pageUrl: context.pageUrl,
      childCount: context.childCount,
      styles: context.styles,
      onSelect: handleSelect,
      onClose: handleClose,
      onHighlightParent: handleHighlightParent,
      onUnhighlightParent: handleUnhighlightParent,
      onSelectParent: handleSelectParent,
    },
  });

  return { cleanup };
}

interface RegionContext {
  width: number;
  height: number;
  elementCount: number;
  tagBreakdown: Array<{ tag: string; count: number }>;
  ancestorLabel: string;
  title: string;
  labels: string[];
  pageUrl: string;
}

/**
 * Mount Region Picker at position
 */
export function mountRegionPicker(
  x: number,
  y: number,
  context: RegionContext,
  onSelect: (intent: 'tag' | 'fix' | 'beautify', includeScreenshot: boolean) => void,
  onClose: () => void
): { cleanup: () => void } {
  const { host, shadow } = createShadowHost('ai-devtools-intent-picker', x, y, 320, 360);

  // Create mount target inside shadow
  const target = document.createElement('div');
  shadow.appendChild(target);

  let component: ReturnType<typeof mount> | null = null;

  const cleanup = () => {
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

  const handleSelect = (intent: 'tag' | 'fix' | 'beautify', includeScreenshot: boolean) => {
    cleanup();
    onSelect(intent, includeScreenshot);
  };

  component = mount(RegionPicker, {
    target,
    props: {
      ...context,
      onSelect: handleSelect,
      onClose: handleClose,
    },
  });

  return { cleanup };
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
