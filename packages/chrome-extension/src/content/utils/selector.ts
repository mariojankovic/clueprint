/**
 * Generates unique CSS selectors for DOM elements
 */

/**
 * Framework-specific class patterns to filter out
 */
const FRAMEWORK_CLASS_PATTERNS = [
  /^ng-/,           // Angular
  /^_/,             // CSS modules
  /^jsx-/,          // Styled-jsx
  /^css-/,          // Emotion
  /^sc-/,           // Styled-components
  /^chakra-/,       // Chakra UI
  /^MuiBox-/,       // Material-UI
  /^makeStyles-/,   // Material-UI
  /^jss\d+/,        // JSS
  /^svelte-/,       // Svelte
  /^v-/,            // Vue
  /^\d+$/,          // Pure numeric classes
];

/**
 * Check if a class name is a framework-generated class
 */
function isFrameworkClass(className: string): boolean {
  return FRAMEWORK_CLASS_PATTERNS.some(pattern => pattern.test(className));
}

/**
 * Filter and clean class names for selector generation
 */
function getCleanClasses(element: Element): string[] {
  return Array.from(element.classList)
    .filter(c => !isFrameworkClass(c))
    .slice(0, 2); // Max 2 classes for brevity
}

/**
 * Generate a unique CSS selector for an element
 */
export function getSelector(element: Element | null): string {
  if (!element || element === document.documentElement) {
    return '';
  }

  // If element has a unique ID, use it
  if (element.id && document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1) {
    return `#${CSS.escape(element.id)}`;
  }

  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    // Check for unique ID
    if (current.id && document.querySelectorAll(`#${CSS.escape(current.id)}`).length === 1) {
      selector = `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    }

    // Add meaningful classes
    const classes = getCleanClasses(current);
    if (classes.length > 0) {
      selector += '.' + classes.map(c => CSS.escape(c)).join('.');
    }

    // Add nth-child if needed for uniqueness among siblings
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        c => c.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  // Verify uniqueness, add more specificity if needed
  const fullSelector = path.join(' > ');
  try {
    const matches = document.querySelectorAll(fullSelector);
    if (matches.length === 1) {
      return fullSelector;
    }
  } catch {
    // Invalid selector, return as-is
  }

  return fullSelector;
}

/**
 * Generate a short, readable selector (for display purposes)
 */
export function getShortSelector(element: Element): string {
  if (element.id) {
    return `#${element.id}`;
  }

  const tag = element.tagName.toLowerCase();
  const classes = getCleanClasses(element);

  if (classes.length > 0) {
    return `${tag}.${classes.join('.')}`;
  }

  return tag;
}

/**
 * Find element by selector, with fallback strategies
 */
export function findElement(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

/**
 * Get all classes from an element (including framework classes)
 */
export function getAllClasses(element: Element): string[] {
  return Array.from(element.classList);
}

/**
 * Check if selector is unique on the page
 */
export function isSelectorUnique(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}
