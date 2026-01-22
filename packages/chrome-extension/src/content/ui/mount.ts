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

  // Create host element
  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = `
    position: fixed;
    top: ${Math.min(y + 10, window.innerHeight - maxHeight)}px;
    left: ${Math.min(x + 10, window.innerWidth - maxWidth)}px;
    z-index: 2147483647;
  `;

  // Attach shadow DOM
  const shadow = host.attachShadow({ mode: 'closed' });

  // Add reset styles for Shadow DOM isolation
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      color: #ffffff;
      line-height: 1.5;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
  `;
  shadow.appendChild(style);

  // Add to document
  document.body.appendChild(host);

  return { host, shadow };
}

/**
 * Mount Inspect Picker at position
 */
export function mountInspectPicker(
  x: number,
  y: number,
  elementName: string,
  onSelect: (intent: 'tag' | 'fix' | 'beautify', instruction?: string) => void,
  onClose: () => void
): { cleanup: () => void } {
  const { host, shadow } = createShadowHost('ai-devtools-intent-picker', x, y, 320, 280);

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

  const handleSelect = (intent: 'tag' | 'fix' | 'beautify', instruction?: string) => {
    cleanup();
    onSelect(intent, instruction);
  };

  component = mount(InspectPicker, {
    target,
    props: {
      elementName,
      onSelect: handleSelect,
      onClose: handleClose,
    },
  });

  return { cleanup };
}

/**
 * Mount Region Picker at position
 */
export function mountRegionPicker(
  x: number,
  y: number,
  regionWidth: number,
  regionHeight: number,
  onSelect: (intent: 'tag' | 'fix' | 'beautify', note?: string) => void,
  onClose: () => void
): { cleanup: () => void } {
  const { host, shadow } = createShadowHost('ai-devtools-intent-picker', x, y, 320, 280);

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

  const handleSelect = (intent: 'tag' | 'fix' | 'beautify', note?: string) => {
    cleanup();
    onSelect(intent, note);
  };

  component = mount(RegionPicker, {
    target,
    props: {
      regionWidth,
      regionHeight,
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
