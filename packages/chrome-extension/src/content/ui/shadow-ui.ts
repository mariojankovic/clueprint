/**
 * Shadow DOM UI utilities for style-isolated content script UI
 * Using Shadow DOM ensures our styles are completely isolated from the page
 */

import { Wrench, Sparkles, Check } from './icons';

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
 * Base styles for all Shadow DOM UIs - TRUE BLACK glassmorphism theme
 */
const BASE_STYLES = `
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

  .picker {
    background: rgba(0, 0, 0, 0.96);
    backdrop-filter: blur(32px) saturate(200%);
    -webkit-backdrop-filter: blur(32px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    box-shadow:
      0 24px 48px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.04) inset;
    padding: 14px;
    min-width: 260px;
  }

  .picker-header {
    margin-bottom: 12px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 10px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .picker-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    font-size: 13px;
    color: #ffffff;
    background: rgba(255, 255, 255, 0.04);
    margin-bottom: 12px;
    outline: none;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .picker-input:focus {
    border-color: rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.08);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.06);
  }

  .picker-input::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }

  .btn-row {
    display: flex;
    gap: 12px;
  }

  .btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    color: #ffffff;
    cursor: pointer;
    text-align: center;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .btn:active {
    transform: scale(0.98) translateY(0);
  }

  .btn svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .btn-full {
    display: flex;
    width: 100%;
    margin-bottom: 10px;
    text-align: left;
    justify-content: flex-start;
    padding: 10px 14px;
  }

  .btn-full:last-of-type {
    margin-bottom: 14px;
  }

  .picker-hint {
    margin-top: 10px;
    color: rgba(255, 255, 255, 0.35);
    font-size: 10px;
    text-align: center;
  }

  .note-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    font-size: 12px;
    color: #ffffff;
    background: rgba(255, 255, 255, 0.04);
    outline: none;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .note-input:focus {
    border-color: rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.08);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.06);
  }

  .note-input::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
`;

/**
 * Create a shadow DOM container at a fixed position
 */
export function createShadowContainer(id: string, x: number, y: number, maxHeight = 280, maxWidth = 300): {
  host: HTMLElement;
  shadow: ShadowRoot;
  cleanup: () => void;
} {
  // Inject font first
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

  // Add base styles
  const style = document.createElement('style');
  style.textContent = BASE_STYLES;
  shadow.appendChild(style);

  // Add to document
  document.body.appendChild(host);

  // Cleanup function
  const cleanup = () => {
    host.remove();
  };

  return { host, shadow, cleanup };
}

/**
 * Create element inspect intent picker UI
 */
export function createInspectPicker(
  x: number,
  y: number,
  elementName: string,
  onSelect: (intent: 'fix' | 'beautify', instruction?: string) => void,
  onClose: () => void
): { cleanup: () => void } {
  const { host, shadow, cleanup } = createShadowContainer('ai-devtools-intent-picker', x, y, 280, 280);

  // Create picker content
  const picker = document.createElement('div');
  picker.className = 'picker';
  picker.innerHTML = `
    <div class="picker-header">${elementName}</div>
    <input
      type="text"
      class="picker-input"
      placeholder="What should I do? (e.g., make this black)"
      autofocus
    />
    <div class="btn-row">
      <button class="btn" data-intent="fix">${Wrench()} Fix</button>
      <button class="btn" data-intent="beautify">${Sparkles()} Beautify</button>
    </div>
    <div class="picker-hint">Enter instruction, then pick intent or press Enter</div>
  `;

  shadow.appendChild(picker);

  // Get input
  const input = picker.querySelector('.picker-input') as HTMLInputElement;
  setTimeout(() => input?.focus(), 50);

  // Define handlers first so cleanupAll can reference them
  const closeHandler = (e: MouseEvent) => {
    if (!host.contains(e.target as Node)) {
      cleanupAll();
    }
  };

  const escapeHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanupAll();
    }
  };

  // Combined cleanup function
  const cleanupAll = () => {
    cleanup();
    onClose();
    document.removeEventListener('click', closeHandler);
    document.removeEventListener('keydown', escapeHandler, true);
  };

  // Handle enter key on input
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSelect('fix', input.value.trim() || undefined);
      cleanupAll();
    }
    // Escape is handled by global escapeHandler
  });

  // Handle button clicks
  picker.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const intent = (btn as HTMLElement).dataset.intent as 'fix' | 'beautify';
      onSelect(intent, input?.value.trim() || undefined);
      cleanupAll();
    });
  });

  // Register global handlers
  setTimeout(() => {
    document.addEventListener('click', closeHandler);
    document.addEventListener('keydown', escapeHandler, true);
  }, 100);

  return { cleanup: cleanupAll };
}

/**
 * Create region select intent picker UI
 */
export function createRegionPicker(
  x: number,
  y: number,
  regionWidth: number,
  regionHeight: number,
  onSelect: (intent: 'fix' | 'beautify', note?: string) => void,
  onClose: () => void
): { cleanup: () => void } {
  const { host, shadow, cleanup } = createShadowContainer('ai-devtools-intent-picker', x, y, 260, 280);

  // Create picker content
  const picker = document.createElement('div');
  picker.className = 'picker';
  picker.innerHTML = `
    <div class="picker-header">Region: ${regionWidth}×${regionHeight}px</div>
    <button class="btn btn-full" data-intent="fix">${Wrench()} Fix - Something is broken</button>
    <button class="btn btn-full" data-intent="beautify">${Sparkles()} Beautify - Make it prettier</button>
    <input
      type="text"
      class="note-input"
      placeholder="Add a note (optional)..."
    />
  `;

  shadow.appendChild(picker);

  // Get input
  const input = picker.querySelector('.note-input') as HTMLInputElement;

  // Define handlers first so cleanupAll can reference them
  const closeHandler = (e: MouseEvent) => {
    if (!host.contains(e.target as Node)) {
      cleanupAll();
    }
  };

  const escapeHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanupAll();
    }
  };

  // Combined cleanup function
  const cleanupAll = () => {
    cleanup();
    onClose();
    document.removeEventListener('click', closeHandler);
    document.removeEventListener('keydown', escapeHandler, true);
  };

  // Handle button clicks
  picker.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const intent = (btn as HTMLElement).dataset.intent as 'fix' | 'beautify';
      onSelect(intent, input?.value.trim() || undefined);
      cleanupAll();
    });
  });

  // Register global handlers
  setTimeout(() => {
    document.addEventListener('click', closeHandler);
    document.addEventListener('keydown', escapeHandler, true);
  }, 100);

  return { cleanup: cleanupAll };
}

/**
 * Create confirmation toast
 */
export function showConfirmation(
  x: number,
  y: number,
  message: string,
  duration = 2500
): void {
  // Inject font first
  injectFont();

  const host = document.createElement('div');
  host.id = 'ai-devtools-confirmation';
  host.style.cssText = `
    position: fixed;
    top: ${y}px;
    left: ${x}px;
    z-index: 2147483647;
  `;

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
    }

    .toast {
      background: rgba(0, 0, 0, 0.96);
      color: #ffffff;
      padding: 14px 20px;
      border-radius: 16px;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
      animation: fadeOut ${duration}ms forwards;
      max-width: 360px;
      backdrop-filter: blur(32px) saturate(200%);
      -webkit-backdrop-filter: blur(32px) saturate(200%);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .toast strong {
      font-weight: 600;
      color: #a5b4fc;
    }

    @keyframes fadeOut {
      0% { opacity: 1; transform: translateY(0); }
      75% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-8px); }
    }
  `;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = message;

  shadow.appendChild(style);
  shadow.appendChild(toast);
  document.body.appendChild(host);

  setTimeout(() => host.remove(), duration);
}
