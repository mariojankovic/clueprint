/**
 * Responsive design checks for elements
 * Detects common responsive issues that may cause problems on mobile devices
 */

import type { ResponsiveIssue, SourceInfo } from '../../types';

/**
 * Check an element for responsive design issues
 */
export function checkResponsive(element: Element, sourceInfo?: SourceInfo): ResponsiveIssue[] {
  const issues: ResponsiveIssue[] = [];
  const computed = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const selector = getShortSelector(element);
  const fileLine = sourceInfo?.file ? `${sourceInfo.file}${sourceInfo.line ? `:${sourceInfo.line}` : ''}` : undefined;

  // Check 1: Fixed widths > 400px (will overflow on mobile)
  const fixedWidthIssue = checkFixedWidth(element, computed, selector, fileLine);
  if (fixedWidthIssue) issues.push(fixedWidthIssue);

  // Check 2: Touch targets < 44x44px (below WCAG minimum)
  const touchTargetIssue = checkTouchTarget(element, computed, rect, selector, fileLine);
  if (touchTargetIssue) issues.push(touchTargetIssue);

  // Check 3: Off-screen positioning with fixed/absolute
  const offScreenIssue = checkOffScreen(element, computed, rect, selector, fileLine);
  if (offScreenIssue) issues.push(offScreenIssue);

  // Check 4: Non-responsive font sizes
  const fontSizeIssue = checkFontSize(element, computed, selector, fileLine);
  if (fontSizeIssue) issues.push(fontSizeIssue);

  return issues;
}

/**
 * Check for fixed widths that may cause overflow on mobile
 */
function checkFixedWidth(
  element: Element,
  computed: CSSStyleDeclaration,
  selector: string,
  fileLine?: string
): ResponsiveIssue | null {
  const width = computed.width;
  const minWidth = computed.minWidth;
  const maxWidth = computed.maxWidth;

  // Parse pixel values
  const widthPx = parsePixelValue(width);
  const minWidthPx = parsePixelValue(minWidth);

  // Check for fixed width > 400px without max-width constraint
  if (widthPx > 400 && maxWidth === 'none') {
    return {
      type: 'fixed-width',
      severity: 'warning',
      element: selector,
      message: `Fixed width ${Math.round(widthPx)}px may overflow on mobile devices`,
      suggestion: 'Use max-width: 100%, percentage widths, or responsive units (vw, rem)',
      fileLine,
    };
  }

  // Check for min-width > 400px
  if (minWidthPx > 400) {
    return {
      type: 'fixed-width',
      severity: 'warning',
      element: selector,
      message: `min-width: ${Math.round(minWidthPx)}px prevents element from shrinking on mobile`,
      suggestion: 'Remove min-width or use a smaller value with media queries',
      fileLine,
    };
  }

  return null;
}

/**
 * Check for touch targets below WCAG minimum (44x44px)
 */
function checkTouchTarget(
  element: Element,
  computed: CSSStyleDeclaration,
  rect: DOMRect,
  selector: string,
  fileLine?: string
): ResponsiveIssue | null {
  // Only check interactive elements
  const tag = element.tagName.toLowerCase();
  const isInteractive = ['button', 'a', 'input', 'select', 'textarea'].includes(tag) ||
    element.getAttribute('role') === 'button' ||
    element.getAttribute('tabindex') !== null ||
    computed.cursor === 'pointer';

  if (!isInteractive) return null;

  // WCAG 2.5.5 recommends 44x44px minimum
  const minSize = 44;
  const width = rect.width;
  const height = rect.height;

  if (width < minSize || height < minSize) {
    const smaller = Math.min(width, height);
    return {
      type: 'small-touch-target',
      severity: smaller < 24 ? 'error' : 'warning',
      element: selector,
      message: `Touch target ${Math.round(width)}x${Math.round(height)}px is below WCAG minimum (44x44px)`,
      suggestion: 'Increase padding or min-width/min-height for better touch accessibility',
      fileLine,
    };
  }

  return null;
}

/**
 * Check for off-screen positioning that may cause issues
 */
function checkOffScreen(
  element: Element,
  computed: CSSStyleDeclaration,
  rect: DOMRect,
  selector: string,
  fileLine?: string
): ResponsiveIssue | null {
  const position = computed.position;

  // Only check positioned elements
  if (position !== 'fixed' && position !== 'absolute') return null;

  // Check if element is significantly off-screen horizontally
  const viewportWidth = window.innerWidth;
  const left = rect.left;
  const right = rect.right;

  // Element starts beyond right edge of a typical mobile viewport (375px)
  if (left > 375 && position === 'fixed') {
    return {
      type: 'off-screen',
      severity: 'warning',
      element: selector,
      message: `Fixed element positioned at left: ${Math.round(left)}px may be off-screen on mobile`,
      suggestion: 'Use responsive positioning with percentage or viewport units, or reposition with media queries',
      fileLine,
    };
  }

  // Element extends beyond viewport
  if (right > viewportWidth + 50 && position === 'fixed') {
    return {
      type: 'off-screen',
      severity: 'warning',
      element: selector,
      message: `Fixed element extends ${Math.round(right - viewportWidth)}px beyond viewport`,
      suggestion: 'Ensure element fits within viewport using max-width: 100vw or responsive positioning',
      fileLine,
    };
  }

  return null;
}

/**
 * Check for non-responsive font sizes
 */
function checkFontSize(
  element: Element,
  computed: CSSStyleDeclaration,
  selector: string,
  fileLine?: string
): ResponsiveIssue | null {
  const fontSize = computed.fontSize;
  const fontSizePx = parsePixelValue(fontSize);

  // Very small font sizes (< 12px) are hard to read on mobile
  if (fontSizePx > 0 && fontSizePx < 12) {
    return {
      type: 'non-responsive-unit',
      severity: 'warning',
      element: selector,
      message: `Font size ${Math.round(fontSizePx)}px may be too small on mobile devices`,
      suggestion: 'Use minimum 16px for body text, 12px for secondary text. Consider using rem units.',
      fileLine,
    };
  }

  return null;
}

/**
 * Parse a CSS pixel value to number
 */
function parsePixelValue(value: string): number {
  if (!value || value === 'auto' || value === 'none') return 0;
  const match = value.match(/^([\d.]+)px$/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Get a short selector for display
 */
function getShortSelector(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = element.classList.length > 0 ? `.${Array.from(element.classList).slice(0, 2).join('.')}` : '';

  let selector = tag + id + classes;
  if (selector.length > 50) {
    selector = selector.slice(0, 47) + '...';
  }

  return selector;
}

/**
 * Check multiple elements for responsive issues (for region selection)
 */
export function checkResponsiveRegion(elements: Element[], sourceInfoMap?: Map<Element, SourceInfo>): ResponsiveIssue[] {
  const issues: ResponsiveIssue[] = [];
  const seen = new Set<string>(); // Dedupe by message

  for (const element of elements.slice(0, 20)) { // Limit to avoid performance issues
    const sourceInfo = sourceInfoMap?.get(element);
    const elementIssues = checkResponsive(element, sourceInfo);

    for (const issue of elementIssues) {
      const key = `${issue.type}:${issue.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push(issue);
      }
    }
  }

  return issues;
}
