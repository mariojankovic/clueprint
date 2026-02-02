/**
 * Accessibility checks for elements
 * Implements common WCAG checks without external dependencies
 *
 * For more comprehensive a11y testing, consider using axe-core in a
 * server-side context or browser DevTools extension panel.
 */

import type { AccessibilityIssue, SourceInfo } from '../../types';

/**
 * Check an element for accessibility issues
 */
export function checkAccessibility(element: Element, sourceInfo?: SourceInfo): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  const selector = getShortSelector(element);
  const fileLine = sourceInfo?.file ? `${sourceInfo.file}${sourceInfo.line ? `:${sourceInfo.line}` : ''}` : undefined;

  // Check 1: Images without alt text
  const altTextIssue = checkImageAlt(element, selector, fileLine);
  if (altTextIssue) issues.push(altTextIssue);

  // Check 2: Form inputs without labels
  const labelIssue = checkFormLabels(element, selector, fileLine);
  if (labelIssue) issues.push(labelIssue);

  // Check 3: Buttons/links without accessible names
  const accessibleNameIssue = checkAccessibleName(element, selector, fileLine);
  if (accessibleNameIssue) issues.push(accessibleNameIssue);

  // Check 4: Color contrast (basic check)
  const contrastIssue = checkColorContrast(element, selector, fileLine);
  if (contrastIssue) issues.push(contrastIssue);

  // Check 5: Missing heading hierarchy
  const headingIssue = checkHeadingHierarchy(element, selector, fileLine);
  if (headingIssue) issues.push(headingIssue);

  // Check 6: Interactive elements keyboard accessibility
  const keyboardIssue = checkKeyboardAccessibility(element, selector, fileLine);
  if (keyboardIssue) issues.push(keyboardIssue);

  return issues;
}

/**
 * Check if image has alt text
 */
function checkImageAlt(element: Element, selector: string, fileLine?: string): AccessibilityIssue | null {
  if (element.tagName.toLowerCase() !== 'img') return null;

  const alt = element.getAttribute('alt');
  const role = element.getAttribute('role');

  // Decorative images should have alt="" or role="presentation"
  if (role === 'presentation' || role === 'none') return null;

  if (alt === null) {
    return {
      type: 'image-alt',
      severity: 'critical',
      element: selector,
      message: 'Image missing alt attribute',
      suggestion: 'Add alt text describing the image, or alt="" for decorative images',
      fileLine,
    };
  }

  return null;
}

/**
 * Check if form inputs have associated labels
 */
function checkFormLabels(element: Element, selector: string, fileLine?: string): AccessibilityIssue | null {
  const tag = element.tagName.toLowerCase();
  if (!['input', 'select', 'textarea'].includes(tag)) return null;

  const type = element.getAttribute('type');
  // Hidden, submit, and button inputs don't need labels
  if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'image') return null;

  const id = element.getAttribute('id');
  const ariaLabel = element.getAttribute('aria-label');
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  const placeholder = element.getAttribute('placeholder');

  // Check for various labeling methods
  if (ariaLabel || ariaLabelledBy) return null;

  // Check for associated label element
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) return null;
  }

  // Check if wrapped in a label
  const parentLabel = element.closest('label');
  if (parentLabel && parentLabel.textContent?.trim()) return null;

  // Using placeholder only is not sufficient
  if (placeholder && !ariaLabel) {
    return {
      type: 'label-missing',
      severity: 'serious',
      element: selector,
      message: 'Form input uses placeholder as only label',
      suggestion: 'Add a visible <label> or aria-label. Placeholders disappear when typing.',
      fileLine,
    };
  }

  return {
    type: 'label-missing',
    severity: 'critical',
    element: selector,
    message: 'Form input missing accessible label',
    suggestion: 'Add a <label for="id"> element or aria-label attribute',
    fileLine,
  };
}

/**
 * Check if buttons/links have accessible names
 */
function checkAccessibleName(element: Element, selector: string, fileLine?: string): AccessibilityIssue | null {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute('role');

  const isButton = tag === 'button' || role === 'button';
  const isLink = tag === 'a' || role === 'link';

  if (!isButton && !isLink) return null;

  // Get accessible name from various sources
  const textContent = element.textContent?.trim();
  const ariaLabel = element.getAttribute('aria-label');
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  const title = element.getAttribute('title');

  // Check for icon-only buttons (has only an icon child)
  const hasOnlyIcon = element.children.length === 1 &&
    (element.children[0].tagName.toLowerCase() === 'svg' ||
     element.children[0].classList.contains('icon') ||
     element.children[0].getAttribute('aria-hidden') === 'true');

  if (hasOnlyIcon && !ariaLabel && !ariaLabelledBy && !title) {
    return {
      type: 'button-name',
      severity: 'critical',
      element: selector,
      message: `Icon-only ${isButton ? 'button' : 'link'} missing accessible name`,
      suggestion: 'Add aria-label describing the action, e.g., aria-label="Close"',
      fileLine,
    };
  }

  if (!textContent && !ariaLabel && !ariaLabelledBy && !title) {
    return {
      type: 'button-name',
      severity: 'critical',
      element: selector,
      message: `${isButton ? 'Button' : 'Link'} missing accessible name`,
      suggestion: 'Add visible text content or aria-label attribute',
      fileLine,
    };
  }

  return null;
}

/**
 * Basic color contrast check
 */
function checkColorContrast(element: Element, selector: string, fileLine?: string): AccessibilityIssue | null {
  const computed = window.getComputedStyle(element);
  const color = computed.color;
  const backgroundColor = computed.backgroundColor;

  // Only check text elements
  const text = element.textContent?.trim();
  if (!text) return null;

  // Skip if background is transparent (would need to check parent)
  if (backgroundColor === 'transparent' || backgroundColor === 'rgba(0, 0, 0, 0)') return null;

  // Parse colors
  const fgRgb = parseRgb(color);
  const bgRgb = parseRgb(backgroundColor);

  if (!fgRgb || !bgRgb) return null;

  // Calculate contrast ratio
  const ratio = getContrastRatio(fgRgb, bgRgb);

  // WCAG AA requires 4.5:1 for normal text, 3:1 for large text
  const fontSize = parseFloat(computed.fontSize);
  const fontWeight = parseInt(computed.fontWeight);
  const isLargeText = fontSize >= 18.66 || (fontSize >= 14 && fontWeight >= 700);

  const minRatio = isLargeText ? 3 : 4.5;

  if (ratio < minRatio) {
    return {
      type: 'color-contrast',
      severity: ratio < 2 ? 'critical' : 'serious',
      element: selector,
      message: `Low color contrast ratio (${ratio.toFixed(1)}:1, needs ${minRatio}:1)`,
      suggestion: 'Increase contrast between text and background colors',
      fileLine,
    };
  }

  return null;
}

/**
 * Check heading hierarchy
 */
function checkHeadingHierarchy(element: Element, selector: string, fileLine?: string): AccessibilityIssue | null {
  const tag = element.tagName.toLowerCase();
  if (!tag.match(/^h[1-6]$/)) return null;

  const level = parseInt(tag.charAt(1));

  // Find previous heading
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const headingArray = Array.from(headings);
  const index = headingArray.indexOf(element);

  if (index === 0 && level !== 1) {
    return {
      type: 'heading-order',
      severity: 'moderate',
      element: selector,
      message: `First heading is <${tag}>, should start with <h1>`,
      suggestion: 'Start page headings with <h1> for proper document structure',
      fileLine,
    };
  }

  if (index > 0) {
    const prevHeading = headingArray[index - 1];
    const prevLevel = parseInt(prevHeading.tagName.charAt(1));

    // Skipping levels is problematic (h2 -> h4)
    if (level > prevLevel + 1) {
      return {
        type: 'heading-order',
        severity: 'moderate',
        element: selector,
        message: `Heading level skipped from <h${prevLevel}> to <${tag}>`,
        suggestion: `Use sequential heading levels. Consider <h${prevLevel + 1}> instead.`,
        fileLine,
      };
    }
  }

  return null;
}

/**
 * Check keyboard accessibility
 */
function checkKeyboardAccessibility(element: Element, selector: string, fileLine?: string): AccessibilityIssue | null {
  const computed = window.getComputedStyle(element);

  // Check for click handlers on non-interactive elements
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  const tabIndex = element.getAttribute('tabindex');

  const isNativeInteractive = ['a', 'button', 'input', 'select', 'textarea'].includes(tag);

  // Elements with cursor: pointer but no keyboard access
  if (computed.cursor === 'pointer' && !isNativeInteractive && tabIndex === null && !role) {
    return {
      type: 'keyboard-trap',
      severity: 'serious',
      element: selector,
      message: 'Clickable element may not be keyboard accessible',
      suggestion: 'Add tabindex="0" and keyboard event handlers, or use a native <button> element',
      fileLine,
    };
  }

  // Custom buttons without proper role
  if (tabIndex !== null && computed.cursor === 'pointer' && !role && !isNativeInteractive) {
    return {
      type: 'aria-role',
      severity: 'moderate',
      element: selector,
      message: 'Interactive element missing role attribute',
      suggestion: 'Add role="button" for button-like elements, or use semantic HTML',
      fileLine,
    };
  }

  return null;
}

/**
 * Parse RGB color string
 */
function parseRgb(color: string): [number, number, number] | null {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  }
  return null;
}

/**
 * Calculate relative luminance
 */
function getLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(v => {
    v = v / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors
 */
function getContrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
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
 * Check multiple elements for accessibility issues (for region selection)
 */
export function checkAccessibilityRegion(elements: Element[], sourceInfoMap?: Map<Element, SourceInfo>): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  const seen = new Set<string>(); // Dedupe by message

  for (const element of elements.slice(0, 20)) { // Limit to avoid performance issues
    const sourceInfo = sourceInfoMap?.get(element);
    const elementIssues = checkAccessibility(element, sourceInfo);

    for (const issue of elementIssues) {
      const key = `${issue.type}:${issue.element}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push(issue);
      }
    }
  }

  return issues;
}
