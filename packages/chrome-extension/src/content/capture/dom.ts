/**
 * DOM capture and extraction utilities
 */

import { getSelector, getShortSelector, getAllClasses } from '../utils/selector';
import { getElementStyles, getAppliedCSSRules, detectStyleAnomalies } from '../utils/styles';
import type {
  ElementRect,
  ParentInfo,
  SiblingInfo,
  CSSRule,
  InspectCapture,
  Intent,
  BrowserContext,
  Diagnosis,
} from '../../types';

/**
 * Get bounding rect as plain object
 */
export function getElementRect(element: Element): ElementRect {
  const rect = element.getBoundingClientRect();
  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    top: Math.round(rect.top),
    left: Math.round(rect.left),
  };
}

/**
 * Get truncated text content from element
 */
export function getElementText(element: Element, maxLength = 100): string {
  const text = element.textContent?.trim() || '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Get element attributes as object
 */
export function getElementAttributes(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of element.attributes) {
    // Skip data attributes that are framework-specific
    if (attr.name.startsWith('data-react') ||
        attr.name.startsWith('data-v-') ||
        attr.name.startsWith('ng-')) {
      continue;
    }
    attrs[attr.name] = attr.value;
  }
  return attrs;
}

/**
 * Get parent element info
 */
export function getParentInfo(element: Element): ParentInfo {
  const parent = element.parentElement;
  if (!parent || parent === document.body) {
    return {
      selector: 'body',
      tag: 'body',
      styles: { display: 'block', position: 'static' },
    };
  }

  const computed = getComputedStyle(parent);
  return {
    selector: getSelector(parent),
    tag: parent.tagName.toLowerCase(),
    styles: {
      display: computed.display,
      position: computed.position,
      flex: computed.display.includes('flex') ? computed.flex : undefined,
      flexDirection: computed.display.includes('flex') ? computed.flexDirection : undefined,
      justifyContent: computed.display.includes('flex') ? computed.justifyContent : undefined,
      alignItems: computed.display.includes('flex') ? computed.alignItems : undefined,
      grid: computed.display.includes('grid') ? computed.gridTemplateColumns : undefined,
      gap: computed.gap !== 'normal' ? computed.gap : undefined,
    },
  };
}

/**
 * Get sibling elements for comparison
 */
export function getSiblings(element: Element): Element[] {
  const parent = element.parentElement;
  if (!parent) return [];

  // Get siblings with same tag
  const sameTags = Array.from(parent.children).filter(
    child => child.tagName === element.tagName && child !== element
  );

  // If no same-tag siblings, get siblings with same class
  if (sameTags.length === 0) {
    const mainClass = Array.from(element.classList)[0];
    if (mainClass) {
      return Array.from(parent.children).filter(
        child => child.classList.contains(mainClass) && child !== element
      );
    }
  }

  return sameTags;
}

/**
 * Get sibling info for comparison
 */
export function getSiblingInfo(element: Element, siblings: Element[]): SiblingInfo[] {
  const anomalies = detectStyleAnomalies(element, siblings);
  const allSiblings = [element, ...siblings];

  return allSiblings.map(sibling => {
    const rect = sibling.getBoundingClientRect();
    const isSelected = sibling === element;

    return {
      selector: getShortSelector(sibling),
      size: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      classes: getAllClasses(sibling),
      isSelected,
      anomaly: isSelected && anomalies.length > 0 ? anomalies.join('; ') : undefined,
    };
  });
}

/**
 * Capture complete element information
 */
export function captureElement(
  element: Element,
  intent: Intent,
  browserContext: BrowserContext,
  cssDetailLevel: 0 | 1 | 2 | 3 = 1
): Omit<InspectCapture, 'screenshot'> {
  const siblings = getSiblings(element);
  const cssRules = getAppliedCSSRules(element);

  // Generate pre-diagnosis
  const diagnosis = generateDiagnosis(element, siblings, cssRules, browserContext);

  return {
    mode: 'inspect',
    intent,
    timestamp: Date.now(),

    element: {
      selector: getSelector(element),
      tag: element.tagName.toLowerCase(),
      id: element.id || undefined,
      classes: getAllClasses(element),
      text: getElementText(element),
      attributes: getElementAttributes(element),
      rect: getElementRect(element),
      styles: getElementStyles(element, cssDetailLevel),
    },

    parent: getParentInfo(element),
    siblings: getSiblingInfo(element, siblings),
    cssRules: formatCSSRules(cssRules),
    browserContext,
    diagnosis,
  };
}

/**
 * Format CSS rules for output
 */
function formatCSSRules(rules: ReturnType<typeof getAppliedCSSRules>): CSSRule[] {
  // Limit to most relevant rules (last 10)
  return rules.slice(-10).map(rule => ({
    source: rule.source,
    selector: rule.selector,
    properties: rule.properties,
    isOverriding: rule.isOverriding,
  }));
}

/**
 * Generate pre-diagnosis based on element analysis
 */
function generateDiagnosis(
  element: Element,
  siblings: Element[],
  cssRules: ReturnType<typeof getAppliedCSSRules>,
  browserContext: BrowserContext
): Diagnosis {
  const suspected: string[] = [];
  const unusual: string[] = [];
  const relatedErrors: string[] = [];

  const computed = getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  // Check for visibility issues
  if (rect.width === 0 || rect.height === 0) {
    // Find which CSS rule causes this
    for (const rule of cssRules) {
      if (rule.properties.width === '0' || rule.properties.width === '0px') {
        suspected.push(`width:0 from ${rule.selector}`);
      }
      if (rule.properties.height === '0' || rule.properties.height === '0px') {
        suspected.push(`height:0 from ${rule.selector}`);
      }
    }
  }

  if (computed.visibility === 'hidden') {
    suspected.push('visibility:hidden');
  }
  if (computed.opacity === '0') {
    suspected.push('opacity:0');
  }
  if (computed.display === 'none') {
    suspected.push('display:none');
  }

  // Check for class differences with siblings
  const elementClasses = new Set(element.classList);
  for (const cls of elementClasses) {
    if (siblings.length > 0 && siblings.every(s => !s.classList.contains(cls))) {
      unusual.push(`has class '${cls}' that siblings don't have`);
    }
  }

  // Check for related console errors
  for (const error of browserContext.errors) {
    const selector = getSelector(element);
    const id = element.id;
    const classes = getAllClasses(element);

    // Check if error mentions this element
    if (
      error.message.includes(selector) ||
      (id && error.message.includes(id)) ||
      classes.some(c => error.message.includes(c))
    ) {
      relatedErrors.push(`${error.message.slice(0, 100)}${error.source ? ` (${error.source})` : ''}`);
    }
  }

  // Check for related network failures
  for (const failure of browserContext.networkFailures) {
    const src = element.getAttribute('src');
    const href = element.getAttribute('href');
    if ((src && failure.url.includes(src)) || (href && failure.url.includes(href))) {
      relatedErrors.push(`Failed to load: ${failure.url} (${failure.status})`);
    }
  }

  return {
    suspected,
    unusual,
    relatedErrors,
  };
}

/**
 * Get DOM tree structure as string representation
 */
export function getDOMStructure(element: Element, depth = 3): string {
  const lines: string[] = [];

  function traverse(el: Element, level: number): void {
    if (level > depth) return;

    const indent = '  '.repeat(level);
    const tag = el.tagName.toLowerCase();
    const classes = getAllClasses(el).slice(0, 2).join('.');
    const id = el.id ? `#${el.id}` : '';

    let line = `${indent}<${tag}`;
    if (id) line += id;
    if (classes) line += `.${classes}`;
    line += '>';

    lines.push(line);

    for (const child of el.children) {
      traverse(child, level + 1);
    }
  }

  traverse(element, 0);
  return lines.join('\n');
}

/**
 * Get elements within a bounding box
 */
export function getElementsInRegion(rect: DOMRect): Element[] {
  const elements: Element[] = [];

  // Use elementsFromPoint at multiple positions within the rect
  const points = [
    [rect.left + 10, rect.top + 10],
    [rect.right - 10, rect.top + 10],
    [rect.left + 10, rect.bottom - 10],
    [rect.right - 10, rect.bottom - 10],
    [rect.left + rect.width / 2, rect.top + rect.height / 2],
  ];

  const seen = new Set<Element>();

  for (const [x, y] of points) {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      if (!seen.has(el) && isElementInRect(el, rect)) {
        seen.add(el);
        elements.push(el);
      }
    }
  }

  // Also find all descendants of the common ancestor
  const commonAncestor = findCommonAncestor(elements);
  if (commonAncestor) {
    const descendants = commonAncestor.querySelectorAll('*');
    for (const el of descendants) {
      if (!seen.has(el) && isElementInRect(el, rect)) {
        seen.add(el);
        elements.push(el);
      }
    }
  }

  return elements;
}

/**
 * Check if element is mostly within a rect
 */
function isElementInRect(element: Element, rect: DOMRect): boolean {
  const elRect = element.getBoundingClientRect();

  // Element center must be within the rect
  const centerX = elRect.left + elRect.width / 2;
  const centerY = elRect.top + elRect.height / 2;

  return (
    centerX >= rect.left &&
    centerX <= rect.right &&
    centerY >= rect.top &&
    centerY <= rect.bottom
  );
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
