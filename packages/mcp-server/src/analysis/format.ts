/**
 * Output formatting for token-efficient reports
 */

import type {
  InspectCapture,
  FreeSelectCapture,
  FlowRecording,
  PageDiagnostics,
} from '../types/index.js';

/**
 * Format element capture as text report
 */
export function formatElementReport(capture: InspectCapture): string {
  const lines: string[] = [];
  const el = capture.element;

  // Header
  lines.push(`ELEMENT: ${el.tag}${el.id ? '#' + el.id : ''}${el.classes.length ? '.' + el.classes.slice(0, 2).join('.') : ''}`);
  lines.push('━'.repeat(56));
  lines.push(`BUILD: 2026-01-22T21:20:00Z`); // Build timestamp for cache verification

  lines.push('');

  // Basic info
  lines.push(`SELECTOR: ${el.selector}`);
  lines.push(`SIZE: ${el.rect.width}×${el.rect.height}px`);
  if (el.classes.length > 0) {
    lines.push(`CLASSES: ${el.classes.join(', ')}`);
  }

  // Text content
  lines.push(`TEXT: "${el.text || '(empty)'}"`);

  // Debug: show raw attributes
  lines.push(`DEBUG attrs: ${JSON.stringify(el.attributes || {}).slice(0, 100)}`);

  // Attributes (data-*, aria-*, role, etc.)
  const importantAttrs = Object.entries(el.attributes || {}).filter(([key]) =>
    key.startsWith('data-') ||
    key.startsWith('aria-') ||
    ['role', 'href', 'src', 'type', 'name', 'value', 'placeholder', 'title', 'alt'].includes(key)
  );
  if (importantAttrs.length > 0) {
    lines.push(`ATTRIBUTES:`);
    for (const [key, value] of importantAttrs.slice(0, 10)) {
      const displayValue = value.length > 50 ? value.slice(0, 50) + '...' : value;
      lines.push(`  ${key}: ${displayValue}`);
    }
  }

  // Accessibility info
  const role = el.attributes?.role || getImplicitRole(el.tag);
  const ariaLabel = el.attributes?.['aria-label'];
  const ariaDescribedby = el.attributes?.['aria-describedby'];
  if (role || ariaLabel) {
    lines.push(`ACCESSIBILITY: role="${role || 'none'}"${ariaLabel ? `, label="${ariaLabel}"` : ''}${ariaDescribedby ? `, describedby="${ariaDescribedby}"` : ''}`);
  }

  lines.push('');

  // Styles
  lines.push('STYLES:');
  const importantStyles = [
    ['display', el.styles.layout.display],
    ['position', el.styles.layout.position],
    ['background', el.styles.visual.background || el.styles.visual.backgroundColor],
    ['padding', el.styles.spacing.padding],
    ['border-radius', el.styles.visual.borderRadius],
  ].filter(([, v]) => v && v !== 'none' && v !== 'static');

  for (const [prop, value] of importantStyles) {
    const note = getStyleNote(prop as string, value as string);
    lines.push(`  ${prop}: ${value}${note ? ` ← ${note}` : ''}`);
  }
  lines.push('');

  // Parent context
  lines.push(`PARENT: ${capture.parent.selector} (${capture.parent.styles.display || 'block'}${capture.parent.styles.gap ? `, gap: ${capture.parent.styles.gap}` : ''})`);
  lines.push('');

  // Siblings comparison
  if (capture.siblings.length > 1) {
    lines.push(`SIBLINGS (${capture.siblings.length} ${el.tag}s):`);
    for (const sibling of capture.siblings.slice(0, 5)) {
      const marker = sibling.isSelected ? ' ⚠️ ← SELECTED' : ' ✓';
      const anomaly = sibling.anomaly ? ` (${sibling.anomaly})` : '';
      lines.push(`  ${sibling.selector}: ${sibling.size.width}×${sibling.size.height}px${marker}${anomaly}`);
    }
    lines.push('');
  }

  // CSS Rules
  if (capture.cssRules.length > 0) {
    lines.push('CSS RULES:');
    for (const rule of capture.cssRules.slice(-5)) {
      const override = rule.isOverriding ? ' ⚠️ OVERRIDING' : '';
      const props = Object.entries(rule.properties).slice(0, 3)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
      lines.push(`  ${rule.selector} { ${props} } → ${rule.source}${override}`);
    }
    lines.push('');
  }

  // Browser context
  const hasContext = capture.browserContext.errors.length > 0 ||
                     capture.browserContext.networkFailures.length > 0;
  if (hasContext) {
    lines.push('BROWSER CONTEXT:');
    for (const error of capture.browserContext.errors.slice(0, 3)) {
      lines.push(`  ❌ ${error.message.slice(0, 80)}${error.source ? ` (${error.source})` : ''}`);
    }
    for (const failure of capture.browserContext.networkFailures.slice(0, 3)) {
      lines.push(`  ❌ ${failure.method} ${failure.url.slice(0, 50)} → ${failure.status} ${failure.statusText}`);
    }
    lines.push('');
  }

  // Diagnosis
  const hasDiagnosis = capture.diagnosis.suspected.length > 0 ||
                       capture.diagnosis.unusual.length > 0 ||
                       capture.diagnosis.relatedErrors.length > 0;
  if (hasDiagnosis) {
    lines.push('DIAGNOSIS:');
    for (const item of capture.diagnosis.suspected) {
      lines.push(`  • ${item}`);
    }
    for (const item of capture.diagnosis.unusual) {
      lines.push(`  • ${item}`);
    }
    for (const item of capture.diagnosis.relatedErrors) {
      lines.push(`  • ${item}`);
    }
    lines.push('');
  }

  // Suggested focus
  if (capture.diagnosis.relatedErrors.length > 0) {
    const firstError = capture.diagnosis.relatedErrors[0];
    const sourceMatch = firstError.match(/\(([^)]+)\)/);
    if (sourceMatch) {
      lines.push(`SUGGESTED FIX: ${sourceMatch[1]}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format region capture as text report
 */
export function formatRegionReport(capture: FreeSelectCapture): string {
  const lines: string[] = [];

  // Header
  lines.push(`REGION: ${capture.region.width}×${capture.region.height}px`);
  lines.push('━'.repeat(56));
  lines.push('');

  // Intent
  lines.push(`INTENT: ${capture.intent.toUpperCase()}`);
  lines.push('');

  // Elements
  lines.push(`ELEMENTS (${capture.elements.length}):`);
  for (const el of capture.elements.slice(0, 10)) {
    const text = el.text ? ` "${el.text.slice(0, 30)}"` : '';
    lines.push(`  • ${el.tag}.${el.selector.split('.').pop() || ''}${text} [${el.role}]`);
  }
  lines.push('');

  // Structure
  if (capture.structure) {
    lines.push('STRUCTURE:');
    lines.push(capture.structure.split('\n').map(l => '  ' + l).join('\n'));
    lines.push('');
  }

  // Aesthetic analysis
  if (capture.aestheticAnalysis) {
    const { issues, suggestions, colorPalette } = capture.aestheticAnalysis;

    if (issues.length > 0) {
      lines.push('ISSUES:');
      for (const issue of issues) {
        lines.push(`  ⚠️ ${issue}`);
      }
      lines.push('');
    }

    if (suggestions.length > 0) {
      lines.push('SUGGESTIONS:');
      for (const suggestion of suggestions) {
        lines.push(`  💡 ${suggestion}`);
      }
      lines.push('');
    }

    if (colorPalette.length > 0) {
      lines.push(`COLORS: ${colorPalette.slice(0, 5).join(', ')}`);
      lines.push('');
    }
  }

  // Browser context
  if (capture.browserContext.errors.length > 0) {
    lines.push('ERRORS:');
    for (const error of capture.browserContext.errors.slice(0, 3)) {
      lines.push(`  ❌ ${error.message.slice(0, 80)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format flow recording as text report (verbose mode for AI debugging)
 */
export function formatFlowReport(recording: FlowRecording): string {
  const lines: string[] = [];

  // Header
  const durationSec = (recording.duration / 1000).toFixed(1);
  lines.push(`FLOW RECORDING (${durationSec}s, ${recording.summary.totalEvents} events)`);
  lines.push('━'.repeat(70));
  lines.push('');

  // Summary stats upfront
  lines.push('SUMMARY:');
  lines.push(`  Duration: ${durationSec}s`);
  lines.push(`  Clicks: ${recording.summary.clicks} | Inputs: ${recording.summary.inputs} | Scrolls: ${recording.summary.scrolls}`);
  lines.push(`  Navigations: ${recording.summary.navigations} | Network: ${recording.summary.networkRequests} req, ${recording.summary.networkErrors} errors`);
  lines.push(`  Console errors: ${recording.summary.consoleErrors} | Layout shifts: ${recording.summary.layoutShifts}`);
  lines.push('');

  // Scroll analysis if there were scrolls
  const scrollEvents = recording.events.filter(e => e.type === 'scroll');
  if (scrollEvents.length > 0) {
    const scrollData = scrollEvents.map(e => e.data as Record<string, unknown>);
    const maxScroll = Math.max(...scrollData.map(d => (d.scrollPercent as number) || 0));
    const directions = scrollData.map(d => d.direction);
    const downCount = directions.filter(d => d === 'down').length;
    const upCount = directions.filter(d => d === 'up').length;
    lines.push('SCROLL BEHAVIOR:');
    lines.push(`  Max scroll depth: ${maxScroll}% | Down: ${downCount}x | Up: ${upCount}x`);
    const lastScroll = scrollData[scrollData.length - 1];
    if (lastScroll) {
      lines.push(`  Page height: ${lastScroll.pageHeight}px | Viewport: ${lastScroll.viewportHeight}px`);
    }
    lines.push('');
  }

  // Click targets summary
  const clickEvents = recording.events.filter(e => e.type === 'click');
  if (clickEvents.length > 0) {
    lines.push('CLICK TARGETS:');
    for (const click of clickEvents.slice(0, 10)) {
      const d = click.data as Record<string, unknown>;
      const time = (click.time / 1000).toFixed(1);
      const text = d.text ? `"${String(d.text).slice(0, 50)}"` : '';
      const role = d.role ? `[${d.role}]` : '';
      const coords = `(${d.x}, ${d.y})`;
      const nearby = d.nearbyClickables ? ` nearby: ${(d.nearbyClickables as string[]).join(', ')}` : '';
      lines.push(`  ${time}s ${role} ${text || d.selector} at ${coords}${nearby}`);
    }
    if (clickEvents.length > 10) {
      lines.push(`  ... ${clickEvents.length - 10} more clicks`);
    }
    lines.push('');
  }

  // Input events
  const inputEvents = recording.events.filter(e => e.type === 'input');
  if (inputEvents.length > 0) {
    lines.push('INPUT EVENTS:');
    for (const input of inputEvents.slice(0, 5)) {
      const d = input.data as Record<string, unknown>;
      const time = (input.time / 1000).toFixed(1);
      lines.push(`  ${time}s ${d.inputType || 'text'} "${d.label || d.selector}" (${d.valueLength} chars)`);
    }
    lines.push('');
  }

  // Network activity
  const networkEvents = recording.events.filter(e =>
    e.type === 'network_response' || e.type === 'network_error'
  );
  if (networkEvents.length > 0) {
    lines.push('NETWORK ACTIVITY:');
    for (const net of networkEvents.slice(0, 10)) {
      const d = net.data as Record<string, unknown>;
      const time = (net.time / 1000).toFixed(1);
      const urlPath = String(d.url || '').split('?')[0].split('/').slice(-3).join('/');
      const status = net.type === 'network_error' ? `❌ ${d.status} ${d.statusText}` : `${d.status}`;
      const duration = d.duration ? ` (${d.duration}ms)` : '';
      lines.push(`  ${time}s ${d.method} /${urlPath} → ${status}${duration}`);
    }
    if (networkEvents.length > 10) {
      lines.push(`  ... ${networkEvents.length - 10} more requests`);
    }
    lines.push('');
  }

  // Console errors
  const errorEvents = recording.events.filter(e => e.type === 'console_error');
  if (errorEvents.length > 0) {
    lines.push('CONSOLE ERRORS:');
    for (const err of errorEvents.slice(0, 5)) {
      const d = err.data as Record<string, unknown>;
      const time = (err.time / 1000).toFixed(1);
      lines.push(`  ${time}s ❌ ${String(d.message || '').slice(0, 100)}`);
      if (d.source) {
        lines.push(`       → ${d.source}`);
      }
    }
    lines.push('');
  }

  // Full timeline
  lines.push('FULL TIMELINE:');
  lines.push('─'.repeat(70));
  for (const event of recording.events.slice(0, 50)) {
    const time = (event.time / 1000).toFixed(1).padStart(6);
    const emoji = getEventEmoji(event.type);
    const desc = getEventDescriptionVerbose(event);
    lines.push(`${time}s  ${emoji} ${desc}`);
  }
  if (recording.events.length > 50) {
    lines.push(`  ... ${recording.events.length - 50} more events`);
  }
  lines.push('');

  // Diagnosis
  lines.push('─'.repeat(70));
  lines.push('DIAGNOSIS:');
  lines.push(`  ${recording.diagnosis.suspectedIssue}`);
  if (recording.diagnosis.rootCause) {
    lines.push(`  Root cause: ${recording.diagnosis.rootCause}`);
  }
  if (recording.diagnosis.timeline) {
    lines.push(`  Timeline: ${recording.diagnosis.timeline}`);
  }

  return lines.join('\n');
}

/**
 * Get verbose description for event (includes more raw data)
 */
function getEventDescriptionVerbose(event: { type: string; data: Record<string, unknown> }): string {
  const data = event.data;
  switch (event.type) {
    case 'click': {
      const text = data.text ? `"${String(data.text).slice(0, 50)}"` : '';
      const role = data.role ? `[${data.role}]` : '';
      const selector = data.selector ? String(data.selector).slice(0, 60) : 'element';
      const coords = `(${data.x}, ${data.y})`;
      const href = data.href ? ` → ${data.href}` : '';
      const nearby = data.nearbyClickables ? ` | nearby: ${(data.nearbyClickables as string[]).slice(0, 2).join(', ')}` : '';
      return `CLICK ${role} ${text || selector} at ${coords}${href}${nearby}`;
    }
    case 'scroll': {
      const pct = data.scrollPercent || 0;
      const dir = data.direction || '';
      const section = data.nearSection ? `"${String(data.nearSection).slice(0, 40)}"` : '';
      const pos = `y=${data.scrollY}px`;
      const delta = data.delta ? ` delta=${data.delta}px` : '';
      return `SCROLL ${dir} to ${pct}% ${pos}${delta} ${section ? `near ${section}` : ''}`;
    }
    case 'input': {
      const type = data.inputType || 'text';
      const label = data.label || data.selector || 'field';
      const len = data.valueLength || 0;
      return `INPUT [${type}] "${label}" typed ${len} chars`;
    }
    case 'form_submit': {
      const method = data.method || 'POST';
      const action = data.action || 'same page';
      const fields = data.fieldCount || 0;
      return `SUBMIT ${method} form → ${action} (${fields} fields)`;
    }
    case 'keypress': {
      const key = data.combo || data.key;
      const target = data.target || 'page';
      return `KEYPRESS ${key} on ${target}`;
    }
    case 'mouse_move': {
      const role = data.role ? `[${data.role}]` : '';
      const target = data.target || '';
      const coords = `(${data.x}, ${data.y})`;
      return `HOVER ${role} ${target} at ${coords}`;
    }
    case 'navigation': {
      if (data.event === 'recording_start') {
        return `RECORDING START on "${data.title || 'page'}" | URL: ${data.url}`;
      }
      return `NAVIGATE → ${data.url || 'unknown'}`;
    }
    case 'refresh':
      return `PAGE REFRESH`;
    case 'network_response': {
      const urlPath = String(data.url || '').split('?')[0].split('/').slice(-3).join('/');
      const duration = data.duration ? ` (${data.duration}ms)` : '';
      return `${data.method} /${urlPath} → ${data.status}${duration}`;
    }
    case 'network_error': {
      const urlPath = String(data.url || '').split('?')[0].split('/').slice(-3).join('/');
      return `${data.method} /${urlPath} → ❌ ${data.status} "${data.statusText}"`;
    }
    case 'console_error': {
      const msg = String(data.message || '').slice(0, 100);
      const src = data.source ? ` (${data.source})` : '';
      return `ERROR: "${msg}"${src}`;
    }
    case 'console_warn': {
      const msg = String(data.message || '').slice(0, 80);
      return `WARN: "${msg}"`;
    }
    case 'element_select':
      return `SELECTED: ${data.selector}`;
    default:
      return `${event.type.toUpperCase()} ${JSON.stringify(data).slice(0, 80)}`;
  }
}

/**
 * Format page diagnostics as text report
 */
export function formatDiagnosticsReport(diagnostics: PageDiagnostics): string {
  const lines: string[] = [];

  // Header
  const url = new URL(diagnostics.url);
  lines.push(`PAGE DIAGNOSTICS: ${url.host}${url.pathname}`);
  lines.push('━'.repeat(56));
  lines.push('');

  // Errors
  if (diagnostics.errors.length > 0) {
    lines.push(`ERRORS (${diagnostics.errors.length}):`);
    for (const error of diagnostics.errors.slice(0, 5)) {
      const count = error.count > 1 ? ` (×${error.count})` : '';
      lines.push(`  ❌ ${error.message.slice(0, 60)}`);
      lines.push(`     → ${error.source}${count}`);
    }
    lines.push('');
  }

  // Network failures
  if (diagnostics.networkFailures.length > 0) {
    lines.push(`NETWORK FAILURES (${diagnostics.networkFailures.length}):`);
    for (const failure of diagnostics.networkFailures.slice(0, 5)) {
      const urlPath = new URL(failure.url).pathname;
      lines.push(`  ❌ ${failure.method} ${urlPath.slice(0, 40)} → ${failure.status} ${failure.statusText}`);
    }
    lines.push('');
  }

  // Performance
  lines.push('PERFORMANCE:');
  if (diagnostics.performance.lcp) {
    const lcpSec = (diagnostics.performance.lcp.value / 1000).toFixed(1);
    const lcpStatus = diagnostics.performance.lcp.value < 2500 ? '← Good' :
                      diagnostics.performance.lcp.value < 4000 ? '⚠️ Needs improvement' : '❌ Poor';
    lines.push(`  LCP: ${lcpSec}s (${diagnostics.performance.lcp.element}) ${lcpStatus}`);
  }

  const clsStatus = diagnostics.performance.cls.value < 0.1 ? '← Good' :
                    diagnostics.performance.cls.value < 0.25 ? '⚠️ Needs improvement' : '❌ Poor';
  lines.push(`  CLS: ${diagnostics.performance.cls.value.toFixed(3)} ${clsStatus}`);
  if (diagnostics.performance.cls.shifts.length > 0) {
    for (const shift of diagnostics.performance.cls.shifts.slice(0, 2)) {
      lines.push(`      (${shift.element} shifted ${shift.delta.toFixed(3)})`);
    }
  }

  if (diagnostics.performance.longTasks.length > 0) {
    const longestTask = Math.max(...diagnostics.performance.longTasks.map(t => t.duration));
    lines.push(`  Long tasks: ${diagnostics.performance.longTasks.length} (longest: ${longestTask}ms)`);
  }
  lines.push('');

  // Accessibility
  const a11y = diagnostics.accessibility;
  const a11yIssues = a11y.missingAltText + a11y.missingLabels + a11y.lowContrast;
  if (a11yIssues > 0) {
    lines.push('ACCESSIBILITY:');
    if (a11y.missingAltText > 0) {
      lines.push(`  ⚠️ ${a11y.missingAltText} images missing alt text`);
    }
    if (a11y.missingLabels > 0) {
      lines.push(`  ⚠️ ${a11y.missingLabels} form inputs missing labels`);
    }
    lines.push('');
  }

  // Warnings
  if (diagnostics.warnings.length > 0) {
    lines.push('WARNINGS:');
    for (const warning of diagnostics.warnings) {
      lines.push(`  ⚠️ ${warning}`);
    }
  }

  return lines.join('\n');
}

/**
 * Get style note for common issues
 */
function getStyleNote(prop: string, value: string): string | null {
  if (prop === 'border-radius' && (value === '0px' || value === '0')) {
    return 'sharp (recommend 4-8px)';
  }
  if (prop === 'padding') {
    const val = parseInt(value);
    if (!isNaN(val) && val < 8) {
      return 'cramped (recommend 12px+)';
    }
  }
  if (prop === 'background' && (value === '#cccccc' || value === 'rgb(204, 204, 204)')) {
    return 'bland gray';
  }
  return null;
}

/**
 * Get emoji for event type
 */
function getEventEmoji(type: string): string {
  const emojis: Record<string, string> = {
    refresh: '🔄',
    navigation: '🔄',
    click: '🖱️',
    input: '⌨️',
    scroll: '📜',
    network_request: '📤',
    network_response: '✅',
    network_error: '❌',
    console_log: '📝',
    console_warn: '⚠️',
    console_error: '❌',
    dom_mutation: '🔀',
    layout_shift: '📐',
    element_select: '👆',
    form_submit: '📋',
    keypress: '⌨️',
    mouse_move: '🔍',
  };
  return emojis[type] || '•';
}

/**
 * Get implicit ARIA role for HTML element
 */
function getImplicitRole(tag: string): string | null {
  const roleMap: Record<string, string> = {
    a: 'link',
    button: 'button',
    input: 'textbox',
    select: 'combobox',
    textarea: 'textbox',
    img: 'img',
    nav: 'navigation',
    main: 'main',
    header: 'banner',
    footer: 'contentinfo',
    aside: 'complementary',
    article: 'article',
    section: 'region',
    form: 'form',
    table: 'table',
    ul: 'list',
    ol: 'list',
    li: 'listitem',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
  };
  return roleMap[tag] || null;
}

