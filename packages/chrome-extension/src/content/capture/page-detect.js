/**
 * Framework detection script - runs in PAGE context (not content script)
 * This file is injected via <script src> to bypass CSP inline restrictions
 */

(function() {
  // Find the marked element
  const elements = document.querySelectorAll('[data-clueprint-detect]');

  elements.forEach(element => {
    const result = detectFramework(element);
    if (result) {
      element.setAttribute('data-clueprint-result', JSON.stringify(result));
    }
  });

  function detectFramework(el) {
    return detectVue(el) || detectReact(el) || detectSvelte(el) || detectAngular(el);
  }

  function detectVue(element) {
    // Walk up DOM to find Vue component
    let current = element;
    let depth = 0;

    while (current && depth < 50) {
      // Vue 3: __vueParentComponent
      if (current.__vueParentComponent) {
        const instance = current.__vueParentComponent;
        const type = instance.type;
        if (type) {
          return {
            framework: 'vue',
            component: type.__name || type.name || 'VueComponent',
            file: type.__file || undefined,
          };
        }
      }

      // Vue 3: __vue_app__ (app mount point)
      if (current.__vue_app__) {
        const app = current.__vue_app__;
        const comp = app._component;
        return {
          framework: 'vue',
          component: comp?.__name || comp?.name || 'App',
          file: comp?.__file || undefined,
        };
      }

      // Vue 2: __vue__
      if (current.__vue__) {
        const vm = current.__vue__;
        const opts = vm.$options;
        return {
          framework: 'vue',
          component: opts?.name || opts?._componentTag || 'VueComponent',
          file: opts?.__file || undefined,
        };
      }

      current = current.parentElement;
      depth++;
    }

    // Check if Vue DevTools hook exists (Vue is on page)
    if (window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.enabled || window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.size > 0) {
      return { framework: 'vue', component: 'VueComponent' };
    }

    return null;
  }

  function detectReact(element) {
    // Method 1: Use React DevTools hook
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (hook?.renderers) {
      for (const renderer of hook.renderers.values()) {
        if (renderer.findFiberByHostInstance) {
          try {
            const fiber = renderer.findFiberByHostInstance(element);
            if (fiber) {
              const info = extractFiberInfo(fiber);
              if (info) return info;
            }
          } catch (e) {}
        }
      }
    }

    // Method 2: Direct fiber lookup
    let current = element;
    let depth = 0;

    while (current && depth < 30) {
      const keys = Object.keys(current);
      const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));

      if (fiberKey) {
        const fiber = current[fiberKey];
        if (fiber) {
          const info = extractFiberInfo(fiber);
          if (info) return info;
        }
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  }

  function extractFiberInfo(fiber) {
    let current = fiber;
    let depth = 0;

    while (current && depth < 15) {
      if (typeof current.type === 'function' || typeof current.type === 'object') {
        const type = current.type;
        let name = null;

        if (typeof type === 'function') {
          name = type.displayName || type.name;
        } else if (type && typeof type === 'object') {
          name = type.displayName || (type.render && (type.render.displayName || type.render.name));
        }

        if (current._debugSource) {
          return {
            framework: 'react',
            component: name || 'Component',
            file: current._debugSource.fileName,
            line: current._debugSource.lineNumber,
          };
        }

        if (name && name !== 'Anonymous') {
          return { framework: 'react', component: name };
        }
      }

      current = current.return;
      depth++;
    }

    return null;
  }

  function detectSvelte(element) {
    let current = element;
    let depth = 0;

    while (current && depth < 30) {
      // Svelte 4: __svelte_meta
      if (current.__svelte_meta?.loc) {
        const loc = current.__svelte_meta.loc;
        const file = loc.file;
        const name = file ? file.split('/').pop()?.replace(/\.\w+$/, '') : 'SvelteComponent';
        return {
          framework: 'svelte',
          component: name || 'SvelteComponent',
          file: file || undefined,
          line: loc.line,
        };
      }

      // Svelte 5: $$ context
      if (current.$$) {
        const ctx = current.$$;
        if (ctx.__file) {
          const name = ctx.__file.split('/').pop()?.replace(/\.\w+$/, '') || 'SvelteComponent';
          return { framework: 'svelte', component: name, file: ctx.__file };
        }
        if (ctx.fragment || ctx.ctx) {
          return { framework: 'svelte', component: 'SvelteComponent' };
        }
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  }

  function detectAngular(element) {
    let current = element;
    let depth = 0;

    while (current && depth < 30) {
      if (current.__ngContext__) {
        // Try Angular debug API
        if (window.ng?.getComponent) {
          try {
            const comp = window.ng.getComponent(current);
            if (comp) {
              return {
                framework: 'angular',
                component: comp.constructor?.name || 'AngularComponent',
              };
            }
          } catch (e) {}
        }

        // Fallback: get name from tag
        const tag = current.tagName.toLowerCase();
        if (tag.includes('-')) {
          const name = tag.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
          return { framework: 'angular', component: name };
        }

        return { framework: 'angular', component: 'AngularComponent' };
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  }
})();
