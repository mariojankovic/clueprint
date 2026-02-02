/**
 * Framework source file detection
 *
 * Detects React, Vue, Svelte, and Angular components from DOM elements
 * and extracts their source file paths when available (dev mode only).
 *
 * NOTE: Framework detection requires running in the page's JavaScript context
 * because the framework internals (like __vueParentComponent) are only accessible there.
 * We inject an external script (bypasses CSP inline restrictions) to run detection.
 */

export interface SourceInfo {
  framework: 'react' | 'vue' | 'svelte' | 'angular';
  component: string;
  file?: string;
  line?: number;
}

// Unique ID for this detection session
let detectionId = 0;
let scriptInjected = false;

/**
 * Detect the source file/component for a DOM element.
 * This runs a script in the page context to access framework internals.
 * Returns a Promise since script injection is asynchronous.
 */
export async function detectSourceInfo(element: Element): Promise<SourceInfo | null> {
  // Mark the element temporarily so the injected script can find it
  const markerId = `__clueprint_detect_${++detectionId}`;
  element.setAttribute('data-clueprint-detect', markerId);

  try {
    // Inject and run the detection script in page context
    await runPageDetectionScript();

    // Read result from element attribute (set by the page script)
    const resultAttr = element.getAttribute('data-clueprint-result');

    if (resultAttr) {
      element.removeAttribute('data-clueprint-result');
      try {
        const result = JSON.parse(resultAttr) as SourceInfo;
        // Clean file path
        if (result.file) {
          result.file = cleanFilePath(result.file);
        }
        return result;
      } catch {
        return null;
      }
    }

    return null;
  } finally {
    element.removeAttribute('data-clueprint-detect');
  }
}

/**
 * Inject the page detection script via <script src> to bypass CSP
 * Returns a Promise that resolves when the script has loaded and executed
 */
function runPageDetectionScript(): Promise<void> {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/page-detect.js');

    script.onload = () => {
      script.remove();
      resolve();
    };

    script.onerror = () => {
      script.remove();
      resolve(); // Resolve anyway, detection will return null
    };

    document.documentElement.appendChild(script);
  });
}

/**
 * Clean file paths: strip webpack/vite prefixes, normalize
 */
function cleanFilePath(filePath: string): string {
  return filePath
    // Remove webpack-internal:/// prefix
    .replace(/^webpack-internal:\/\/\//, '')
    // Remove webpack:/// prefix
    .replace(/^webpack:\/\/\//, '')
    // Remove ./ prefix
    .replace(/^\.\//, '')
    // Remove query strings (?xxxx)
    .replace(/\?.*$/, '')
    // Remove leading /
    .replace(/^\//, '');
}
