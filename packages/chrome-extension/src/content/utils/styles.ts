/**
 * Style extraction and filtering utilities
 */

import type {
  ElementStyles,
  LayoutStyles,
  SizeStyles,
  SpacingStyles,
  VisualStyles,
  TextStyles,
  AestheticStyles
} from '../../types';

// Style property groups
const LAYOUT_PROPERTIES = [
  'display', 'position', 'float', 'clear',
  'flex', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'alignSelf',
  'gridTemplateColumns', 'gridTemplateRows', 'gridColumn', 'gridRow', 'gap',
  'overflow', 'overflowX', 'overflowY',
  'zIndex',
] as const;

const SIZE_PROPERTIES = [
  'width', 'height',
  'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
] as const;

const SPACING_PROPERTIES = [
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'boxSizing',
] as const;

const VISUAL_PROPERTIES = [
  'background', 'backgroundColor', 'backgroundImage',
  'border', 'borderWidth', 'borderStyle', 'borderColor', 'borderRadius',
  'boxShadow', 'opacity', 'visibility',
  'transform',
] as const;

const TEXT_PROPERTIES = [
  'color', 'fontSize', 'fontWeight', 'fontFamily',
  'lineHeight', 'letterSpacing', 'textAlign', 'textDecoration',
] as const;

// Default values to filter out
const DEFAULT_VALUES = new Set([
  'none', 'auto', 'normal', 'visible', 'static',
  '0px', '0', 'rgba(0, 0, 0, 0)', 'transparent',
  'inherit', 'initial', 'unset',
]);

/**
 * Convert camelCase to kebab-case for CSS property lookup
 */
function toKebabCase(str: string): string {
  return str.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
}

/**
 * Check if a style value is meaningful (not default/empty)
 */
function isMeaningfulValue(value: string | null | undefined): boolean {
  if (!value) return false;
  return !DEFAULT_VALUES.has(value.trim());
}

/**
 * Get computed style value for a property
 */
function getStyleValue(computed: CSSStyleDeclaration, property: string): string {
  const kebabProp = toKebabCase(property);
  return computed.getPropertyValue(kebabProp);
}

/**
 * Extract layout-related styles
 */
function getLayoutStyles(computed: CSSStyleDeclaration): LayoutStyles {
  const styles: Partial<LayoutStyles> = {};

  for (const prop of LAYOUT_PROPERTIES) {
    const value = getStyleValue(computed, prop);
    if (isMeaningfulValue(value)) {
      (styles as Record<string, string>)[prop] = value;
    }
  }

  return {
    display: computed.display || 'block',
    position: computed.position || 'static',
    ...styles,
  };
}

/**
 * Extract size-related styles
 */
function getSizeStyles(computed: CSSStyleDeclaration): SizeStyles {
  return {
    width: computed.width,
    height: computed.height,
    minWidth: isMeaningfulValue(computed.minWidth) ? computed.minWidth : undefined,
    maxWidth: isMeaningfulValue(computed.maxWidth) ? computed.maxWidth : undefined,
    minHeight: isMeaningfulValue(computed.minHeight) ? computed.minHeight : undefined,
    maxHeight: isMeaningfulValue(computed.maxHeight) ? computed.maxHeight : undefined,
  };
}

/**
 * Extract spacing-related styles
 */
function getSpacingStyles(computed: CSSStyleDeclaration): SpacingStyles {
  return {
    margin: computed.margin,
    padding: computed.padding,
    boxSizing: computed.boxSizing,
  };
}

/**
 * Extract visual styles
 */
function getVisualStyles(computed: CSSStyleDeclaration): VisualStyles {
  return {
    background: computed.background,
    backgroundColor: isMeaningfulValue(computed.backgroundColor) ? computed.backgroundColor : undefined,
    border: computed.border,
    borderRadius: computed.borderRadius,
    boxShadow: isMeaningfulValue(computed.boxShadow) ? computed.boxShadow : undefined,
    opacity: computed.opacity,
  };
}

/**
 * Extract text-related styles
 */
function getTextStyles(computed: CSSStyleDeclaration): TextStyles {
  return {
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    lineHeight: computed.lineHeight,
    color: computed.color,
    fontFamily: computed.fontFamily,
  };
}

/**
 * Get element styles at specified detail level
 * Level 0: None
 * Level 1: Layout + Visual
 * Level 2: + Typography
 * Level 3: Full computed
 */
export function getElementStyles(element: Element, level: 0 | 1 | 2 | 3 = 1): ElementStyles {
  const computed = getComputedStyle(element);

  const styles: ElementStyles = {
    layout: getLayoutStyles(computed),
    size: getSizeStyles(computed),
    spacing: getSpacingStyles(computed),
    visual: getVisualStyles(computed),
  };

  if (level >= 2) {
    styles.text = getTextStyles(computed);
  }

  return styles;
}

/**
 * Get all computed styles (for level 3)
 */
export function getAllComputedStyles(element: Element): Record<string, string> {
  const computed = getComputedStyle(element);
  const styles: Record<string, string> = {};

  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i];
    const value = computed.getPropertyValue(prop);
    if (isMeaningfulValue(value)) {
      styles[prop] = value;
    }
  }

  return styles;
}

/**
 * Extract aesthetic styles for beautify mode
 */
export function getAestheticStyles(element: Element): AestheticStyles {
  const computed = getComputedStyle(element);

  // Extract colors used
  const colors: string[] = [];
  const colorProps = ['color', 'backgroundColor', 'borderColor'];
  for (const prop of colorProps) {
    const value = computed.getPropertyValue(toKebabCase(prop));
    if (isMeaningfulValue(value) && !colors.includes(value)) {
      colors.push(value);
    }
  }

  return {
    colors,
    typography: {
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      lineHeight: computed.lineHeight,
      color: computed.color,
    },
    spacing: {
      margin: computed.margin,
      padding: computed.padding,
      boxSizing: computed.boxSizing,
    },
    borderRadius: computed.borderRadius,
  };
}

/**
 * Get CSS rules that apply to an element
 */
export function getAppliedCSSRules(element: Element): Array<{
  source: string;
  selector: string;
  properties: Record<string, string>;
  isOverriding?: boolean;
}> {
  const rules: Array<{
    source: string;
    selector: string;
    properties: Record<string, string>;
    isOverriding?: boolean;
  }> = [];

  try {
    // Get all stylesheets
    const sheets = Array.from(document.styleSheets);

    for (const sheet of sheets) {
      try {
        const cssRules = sheet.cssRules || sheet.rules;
        if (!cssRules) continue;

        for (let i = 0; i < cssRules.length; i++) {
          const rule = cssRules[i];
          if (rule instanceof CSSStyleRule) {
            try {
              if (element.matches(rule.selectorText)) {
                const properties: Record<string, string> = {};
                for (let j = 0; j < rule.style.length; j++) {
                  const prop = rule.style[j];
                  properties[prop] = rule.style.getPropertyValue(prop);
                }

                // Try to get source file info
                let source = 'inline';
                if (sheet.href) {
                  const url = new URL(sheet.href);
                  source = url.pathname.split('/').pop() || sheet.href;
                }

                rules.push({
                  source: `${source}:${i}`,
                  selector: rule.selectorText,
                  properties,
                });
              }
            } catch {
              // Skip rules that throw on matches()
            }
          }
        }
      } catch {
        // CORS error accessing stylesheet rules
      }
    }
  } catch {
    // Stylesheet access error
  }

  // Mark overriding rules (later rules override earlier ones)
  const seenProperties = new Set<string>();
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i];
    for (const prop of Object.keys(rule.properties)) {
      if (seenProperties.has(prop)) {
        rule.isOverriding = true;
      }
      seenProperties.add(prop);
    }
  }

  return rules;
}

/**
 * Detect style anomalies by comparing with siblings
 */
export function detectStyleAnomalies(
  element: Element,
  siblings: Element[]
): string[] {
  const anomalies: string[] = [];

  if (siblings.length === 0) return anomalies;

  const elementRect = element.getBoundingClientRect();
  const siblingRects = siblings.map(s => s.getBoundingClientRect());

  // Check for size anomalies
  const avgWidth = siblingRects.reduce((sum, r) => sum + r.width, 0) / siblingRects.length;
  const avgHeight = siblingRects.reduce((sum, r) => sum + r.height, 0) / siblingRects.length;

  if (elementRect.width === 0 && avgWidth > 0) {
    anomalies.push(`width is 0, siblings average ${Math.round(avgWidth)}px`);
  } else if (Math.abs(elementRect.width - avgWidth) > avgWidth * 0.5 && avgWidth > 0) {
    anomalies.push(`width (${Math.round(elementRect.width)}px) differs significantly from siblings (${Math.round(avgWidth)}px)`);
  }

  if (elementRect.height === 0 && avgHeight > 0) {
    anomalies.push(`height is 0, siblings average ${Math.round(avgHeight)}px`);
  }

  // Check for visibility anomalies
  const computed = getComputedStyle(element);
  if (computed.visibility === 'hidden') {
    anomalies.push('visibility is hidden');
  }
  if (computed.opacity === '0') {
    anomalies.push('opacity is 0');
  }
  if (computed.display === 'none') {
    anomalies.push('display is none');
  }

  // Check for class differences
  const elementClasses = new Set(element.classList);
  const commonClasses = new Set<string>();

  for (const sibling of siblings) {
    for (const cls of sibling.classList) {
      if (siblings.every(s => s.classList.contains(cls))) {
        commonClasses.add(cls);
      }
    }
  }

  // Classes element has that siblings don't commonly have
  for (const cls of elementClasses) {
    if (!commonClasses.has(cls) && siblings.every(s => !s.classList.contains(cls))) {
      anomalies.push(`has unique class '${cls}' that siblings don't have`);
    }
  }

  return anomalies;
}
