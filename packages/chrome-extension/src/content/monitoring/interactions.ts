/**
 * User interaction monitoring (clicks, scrolls, inputs)
 * Captures user actions during flow recording for debugging context
 */

// State
let isMonitoring = false;
let lastScrollTime = 0;
let lastMouseMoveTime = 0;
const SCROLL_DEBOUNCE_MS = 500; // Only record scroll every 500ms
const MOUSE_MOVE_DEBOUNCE_MS = 1500; // Only record mouse position every 1.5s

/**
 * Generate a readable selector for an element
 */
function getSelector(el: Element): string {
  if (el.id) {
    return `#${el.id}`;
  }

  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList).slice(0, 2).join('.');

  // Try to get meaningful text content
  const text = el.textContent?.trim().slice(0, 30);

  if (classes) {
    return `${tag}.${classes}`;
  }

  if (text) {
    return `${tag}:contains("${text}")`;
  }

  return tag;
}

/**
 * Get element's role or purpose
 */
function getElementRole(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  const type = el.getAttribute('type');

  if (role) return role;

  if (tag === 'button' || type === 'button' || type === 'submit') return 'button';
  if (tag === 'a') return 'link';
  if (tag === 'input') return type || 'input';
  if (tag === 'select') return 'dropdown';
  if (tag === 'textarea') return 'textarea';

  return tag;
}

/**
 * Get readable text from element
 */
function getElementText(el: Element): string {
  // For inputs, get placeholder or label
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent?.trim().slice(0, 50) || '';
    return el.placeholder?.slice(0, 50) || el.name || '';
  }

  // For buttons/links, get visible text
  const text = el.textContent?.trim().slice(0, 50) || '';
  return text;
}

/**
 * Send interaction event to background
 */
function sendInteractionEvent(type: string, data: Record<string, unknown>): void {
  chrome.runtime.sendMessage({
    type: 'INTERACTION_EVENT',
    payload: { type, data }
  }).catch(() => {
    // Background not ready, ignore
  });
}

/**
 * Handle click events
 */
function handleClick(event: MouseEvent): void {
  const target = event.target as Element;
  if (!target) return;

  // Skip clicks on our own UI
  if (target.closest('#ai-devtools-floating-widget, #ai-devtools-recording-indicator')) {
    return;
  }

  const selector = getSelector(target);
  const role = getElementRole(target);
  const text = getElementText(target);

  // Check if click is near other interactive elements (helps debug mis-clicks)
  const nearbyInteractives = document.elementsFromPoint(event.clientX, event.clientY)
    .slice(0, 3)
    .filter(el => el !== target && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button'))
    .map(el => getSelector(el));

  sendInteractionEvent('click', {
    selector,
    role,
    text,
    x: event.clientX,
    y: event.clientY,
    href: target instanceof HTMLAnchorElement ? target.href : undefined,
    nearbyClickables: nearbyInteractives.length > 0 ? nearbyInteractives : undefined,
  });
}

/**
 * Handle scroll events (debounced)
 */
function handleScroll(): void {
  const now = Date.now();
  if (now - lastScrollTime < SCROLL_DEBOUNCE_MS) return;
  lastScrollTime = now;

  const scrollY = window.scrollY;
  const scrollX = window.scrollX;
  const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
  const scrollPercent = maxScrollY > 0 ? Math.round((scrollY / maxScrollY) * 100) : 0;
  const lastY = (window as unknown as { _lastScrollY?: number })._lastScrollY || 0;
  const direction = scrollY > lastY ? 'down' : 'up';
  const scrollDelta = Math.abs(scrollY - lastY);

  // Find what section/heading we're near
  const visibleHeading = document.querySelector('h1, h2, h3, [role="heading"]');
  const nearestSection = visibleHeading?.textContent?.trim().slice(0, 50);

  sendInteractionEvent('scroll', {
    scrollY,
    scrollX,
    scrollPercent,
    direction,
    delta: scrollDelta,
    pageHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    nearSection: nearestSection || undefined,
  });

  (window as unknown as { _lastScrollY: number })._lastScrollY = scrollY;
}

/**
 * Handle input events (captures what field was interacted with, not the actual value for privacy)
 */
function handleInput(event: Event): void {
  const target = event.target as Element;
  if (!target) return;

  // Skip our own UI
  if (target.closest('#ai-devtools-floating-widget')) {
    return;
  }

  const selector = getSelector(target);
  const role = getElementRole(target);
  const label = getElementText(target);

  // Get input type but NOT the value (privacy)
  const inputType = target instanceof HTMLInputElement ? target.type : 'text';
  const hasValue = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    ? target.value.length > 0
    : false;

  sendInteractionEvent('input', {
    selector,
    role,
    label,
    inputType,
    hasValue,
    // Only include value length, not actual value (privacy)
    valueLength: target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      ? target.value.length
      : 0,
  });
}

/**
 * Handle form submissions
 */
function handleSubmit(event: Event): void {
  const form = event.target as HTMLFormElement;
  if (!form) return;

  const selector = getSelector(form);
  const action = form.action || window.location.href;
  const method = form.method || 'GET';

  sendInteractionEvent('form_submit', {
    selector,
    action,
    method,
    fieldCount: form.elements.length,
  });
}

/**
 * Handle mouse move (heavily debounced for context)
 */
function handleMouseMove(event: MouseEvent): void {
  const now = Date.now();
  if (now - lastMouseMoveTime < MOUSE_MOVE_DEBOUNCE_MS) return;
  lastMouseMoveTime = now;

  const target = event.target as Element;
  if (!target) return;

  // Skip our own UI
  if (target.closest('#ai-devtools-floating-widget, #ai-devtools-recording-indicator')) {
    return;
  }

  const selector = getSelector(target);
  const role = getElementRole(target);

  sendInteractionEvent('mouse_move', {
    x: event.clientX,
    y: event.clientY,
    target: selector,
    role,
  });
}

/**
 * Handle keyboard shortcuts (only special keys, not text)
 */
function handleKeydown(event: KeyboardEvent): void {
  // Only capture special key combinations, not regular typing
  if (!event.ctrlKey && !event.metaKey && !event.altKey &&
      !['Enter', 'Escape', 'Tab', 'Backspace', 'Delete'].includes(event.key)) {
    return;
  }

  // Skip if typing in an input
  const target = event.target as Element;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    // Only capture Enter in forms
    if (event.key !== 'Enter') return;
  }

  const modifiers = [];
  if (event.ctrlKey) modifiers.push('Ctrl');
  if (event.metaKey) modifiers.push('Cmd');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');

  const combo = [...modifiers, event.key].join('+');

  sendInteractionEvent('keypress', {
    key: event.key,
    combo,
    target: getSelector(target),
  });
}

/**
 * Start monitoring user interactions
 */
export function startInteractionMonitoring(): void {
  if (isMonitoring) return;

  isMonitoring = true;
  (window as unknown as { _lastScrollY: number })._lastScrollY = window.scrollY;

  // Use capture phase to catch events before they're stopped
  document.addEventListener('click', handleClick, { capture: true, passive: true });
  window.addEventListener('scroll', handleScroll, { passive: true });
  document.addEventListener('input', handleInput, { capture: true, passive: true });
  document.addEventListener('submit', handleSubmit, { capture: true });
  document.addEventListener('keydown', handleKeydown, { capture: true });
  document.addEventListener('mousemove', handleMouseMove, { passive: true });

  console.log('[Clueprint] Interaction monitoring started');
}

/**
 * Stop monitoring user interactions
 */
export function stopInteractionMonitoring(): void {
  if (!isMonitoring) return;

  isMonitoring = false;

  document.removeEventListener('click', handleClick, { capture: true });
  window.removeEventListener('scroll', handleScroll);
  document.removeEventListener('input', handleInput, { capture: true });
  document.removeEventListener('submit', handleSubmit, { capture: true });
  document.removeEventListener('keydown', handleKeydown, { capture: true });
}

/**
 * Check if monitoring is active
 */
export function isInteractionMonitoringActive(): boolean {
  return isMonitoring;
}
