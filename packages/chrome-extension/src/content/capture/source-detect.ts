/**
 * Framework source file detection
 *
 * Detects React, Vue, Svelte, and Angular components from DOM elements
 * and extracts their source file paths when available (dev mode only).
 */

export interface SourceInfo {
  framework: 'react' | 'vue' | 'svelte' | 'angular';
  component: string;
  file?: string;
  line?: number;
}

/**
 * Detect the source file/component for a DOM element.
 * Walks up to 5 ancestors if nothing found on the element itself.
 */
export function detectSourceInfo(element: Element): SourceInfo | null {
  let current: Element | null = element;
  let depth = 0;

  while (current && depth < 6) {
    const info = detectOnElement(current);
    if (info) return info;
    current = current.parentElement;
    depth++;
  }

  return null;
}

function detectOnElement(element: Element): SourceInfo | null {
  return detectReact(element)
    || detectVue(element)
    || detectSvelte(element)
    || detectAngular(element);
}

// =============================================================================
// React Detection
// =============================================================================

function detectReact(element: Element): SourceInfo | null {
  const el = element as unknown as Record<string, unknown>;

  // Find the React fiber key (__reactFiber$xxxx or __reactInternalInstance$xxxx)
  const fiberKey = Object.keys(el).find(
    key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
  );
  if (!fiberKey) return null;

  const fiber = el[fiberKey] as ReactFiber | null;
  if (!fiber) return null;

  // Walk up the fiber tree to find a component with _debugSource
  let current: ReactFiber | null = fiber;
  let depth = 0;

  while (current && depth < 15) {
    // Skip host elements (div, span, etc.) - look for function/class components
    if (typeof current.type === 'function' || typeof current.type === 'object') {
      const componentName = getReactComponentName(current);

      if (current._debugSource) {
        const source = current._debugSource;
        return {
          framework: 'react',
          component: componentName || 'Anonymous',
          file: cleanFilePath(source.fileName),
          line: source.lineNumber,
        };
      }

      // Even without _debugSource, if we found a named component, return it
      if (componentName && componentName !== 'Anonymous') {
        return {
          framework: 'react',
          component: componentName,
        };
      }
    }

    current = current.return;
    depth++;
  }

  return null;
}

function getReactComponentName(fiber: ReactFiber): string | null {
  if (!fiber.type) return null;

  if (typeof fiber.type === 'string') return null; // host element

  if (typeof fiber.type === 'function') {
    return fiber.type.displayName || fiber.type.name || null;
  }

  if (typeof fiber.type === 'object') {
    // forwardRef, memo, etc.
    const type = fiber.type as Record<string, unknown>;
    if (type.displayName) return type.displayName as string;
    if (type.render && typeof type.render === 'function') {
      return (type.render as { displayName?: string; name?: string }).displayName
        || (type.render as { name?: string }).name
        || null;
    }
  }

  return null;
}

interface ReactFiber {
  type: unknown;
  return: ReactFiber | null;
  _debugSource?: {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
  };
}

// =============================================================================
// Vue Detection
// =============================================================================

function detectVue(element: Element): SourceInfo | null {
  const el = element as unknown as Record<string, unknown>;

  // Vue 3: __vueParentComponent
  const instance = el.__vueParentComponent as VueComponentInstance | null;
  if (instance) {
    return extractVueInfo(instance);
  }

  // Vue 2: __vue__
  const vue2Instance = el.__vue__ as VueComponentInstance | null;
  if (vue2Instance) {
    return extractVue2Info(vue2Instance);
  }

  return null;
}

function extractVueInfo(instance: VueComponentInstance): SourceInfo | null {
  const type = instance.type;
  if (!type) return null;

  const component = type.__name || type.name || 'Anonymous';
  const file = type.__file || undefined;

  return {
    framework: 'vue',
    component,
    file: file ? cleanFilePath(file) : undefined,
  };
}

function extractVue2Info(instance: VueComponentInstance): SourceInfo | null {
  const options = instance.$options;
  if (!options) return null;

  const component = options.name || options._componentTag || 'Anonymous';
  const file = options.__file || undefined;

  return {
    framework: 'vue',
    component,
    file: file ? cleanFilePath(file) : undefined,
  };
}

interface VueComponentInstance {
  type?: {
    __name?: string;
    name?: string;
    __file?: string;
  };
  $options?: {
    name?: string;
    _componentTag?: string;
    __file?: string;
  };
}

// =============================================================================
// Svelte Detection
// =============================================================================

function detectSvelte(element: Element): SourceInfo | null {
  const el = element as unknown as Record<string, unknown>;

  // Svelte 4 dev mode: __svelte_meta
  const meta = el.__svelte_meta as SvelteMeta | null;
  if (meta?.loc) {
    const file = meta.loc.file;
    const componentName = file
      ? file.split('/').pop()?.replace(/\.\w+$/, '') || 'Anonymous'
      : 'Anonymous';

    return {
      framework: 'svelte',
      component: componentName,
      file: file ? cleanFilePath(file) : undefined,
      line: meta.loc.line,
    };
  }

  // Svelte 5: check for $$ context or component metadata
  const svelteCtx = el.$$  as Record<string, unknown> | null;
  if (svelteCtx) {
    // Svelte 5 component instances have $$ with ctx, fragment, etc.
    const componentFile = (svelteCtx as Record<string, unknown>).__file as string | undefined;
    if (componentFile) {
      const componentName = componentFile.split('/').pop()?.replace(/\.\w+$/, '') || 'Anonymous';
      return {
        framework: 'svelte',
        component: componentName,
        file: cleanFilePath(componentFile),
      };
    }

    // Even without file info, if we detect Svelte internals, report it
    if (svelteCtx.fragment || svelteCtx.ctx) {
      return {
        framework: 'svelte',
        component: 'SvelteComponent',
      };
    }
  }

  return null;
}

interface SvelteMeta {
  loc?: {
    file?: string;
    line?: number;
    column?: number;
    char?: number;
  };
}

// =============================================================================
// Angular Detection
// =============================================================================

function detectAngular(element: Element): SourceInfo | null {
  const el = element as unknown as Record<string, unknown>;

  // Angular attaches __ngContext__ to elements
  if (!el.__ngContext__) return null;

  // Try using Angular's debug API if available
  const ng = (window as unknown as Record<string, unknown>).ng as NgDebugAPI | undefined;
  if (ng?.getComponent) {
    try {
      const component = ng.getComponent(element as HTMLElement);
      if (component) {
        const name = component.constructor?.name || 'AngularComponent';
        return {
          framework: 'angular',
          component: name,
        };
      }
    } catch {
      // Debug API not available in prod
    }
  }

  // Fallback: check for ng-reflect-* attributes that hint at the component
  const ngAttrs = Array.from(element.attributes).filter(a => a.name.startsWith('ng-reflect-'));
  if (ngAttrs.length > 0 || el.__ngContext__) {
    // Try to get component name from the element's tag (Angular uses kebab-case custom elements)
    const tag = element.tagName.toLowerCase();
    if (tag.includes('-')) {
      const name = tag.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
      return {
        framework: 'angular',
        component: name,
      };
    }

    return {
      framework: 'angular',
      component: 'AngularComponent',
    };
  }

  return null;
}

interface NgDebugAPI {
  getComponent?: (element: HTMLElement) => { constructor?: { name?: string } } | null;
}

// =============================================================================
// Utilities
// =============================================================================

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
