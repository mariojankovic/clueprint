<script lang="ts">
  import { Plus, X, ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { onMount, onDestroy } from 'svelte';
  import type { CaptureOptions, SourceInfo, QueuedElement } from '../../types';

  // Shared props
  interface BaseProps {
    pageUrl: string;
    onCapture: (options: CaptureOptions) => void;
    onClose: () => void;
  }

  // Element detail info (computed from element)
  interface ElementDetail {
    tag: string;
    attrs: Array<{ name: string; value: string }>;
    textContent: string;
    childCount: number;
    styles: Array<{ prop: string; value: string }>;
  }

  // Element mode props (single or multi-select)
  interface ElementProps extends BaseProps {
    mode: 'element';
    tag: string;
    attrs: Array<{ name: string; value: string }>;
    textContent: string;
    parents: Array<{ label: string }>;
    childCount: number;
    styles: Array<{ prop: string; value: string }>;
    sourceInfo?: SourceInfo;
    queueCount?: number;
    queuedElements?: QueuedElement[];
    onHighlightParent?: (index: number) => void;
    onUnhighlightParent?: () => void;
    onSelectParent?: (index: number) => void;
    onHighlightQueuedElement?: (index: number) => void;
    onUnhighlightQueuedElement?: () => void;
    onRemoveQueuedElement?: (index: number) => void;
  }

  type Props = ElementProps;

  let props: Props = $props();

  // Determine if we're in multi-select mode (>1 queued)
  const isMultiSelect = $derived((props.queueCount ?? 0) > 1);

  // Detail view state (index of element being viewed, or null for list view)
  let detailIndex: number | null = $state(null);

  // Get element details for detail view
  function getElementDetail(element: Element): ElementDetail {
    const tag = element.tagName.toLowerCase();

    // Get relevant attributes (skip data-* and style)
    const attrs: Array<{ name: string; value: string }> = [];
    for (const attr of element.attributes) {
      if (!attr.name.startsWith('data-') && attr.name !== 'style') {
        let value = attr.value;
        if (value.length > 50) value = value.slice(0, 47) + '...';
        attrs.push({ name: attr.name, value });
      }
    }

    // Get text content (first text node only)
    let textContent = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim() || '';
        if (text) {
          textContent = text.length > 80 ? text.slice(0, 77) + '...' : text;
          break;
        }
      }
    }

    // Get key computed styles
    const computed = getComputedStyle(element);
    const styleProps = ['display', 'position', 'width', 'height', 'color', 'background-color', 'font-size', 'padding', 'margin', 'border-radius'];
    const styles: Array<{ prop: string; value: string }> = [];
    for (const prop of styleProps) {
      const value = computed.getPropertyValue(prop);
      if (value && value !== 'none' && value !== 'auto' && value !== 'normal' && value !== '0px' && value !== 'rgba(0, 0, 0, 0)') {
        styles.push({ prop, value });
      }
    }

    return {
      tag,
      attrs: attrs.slice(0, 6),
      textContent,
      childCount: element.children.length,
      styles: styles.slice(0, 8),
    };
  }

  // Get current detail item
  const detailItem = $derived(
    detailIndex !== null && props.queuedElements?.[detailIndex]
      ? props.queuedElements[detailIndex]
      : null
  );

  // Get computed details for current detail item
  const detailInfo = $derived(
    detailItem ? getElementDetail(detailItem.element) : null
  );

  function showDetail(index: number) {
    detailIndex = index;
    // Reposition after render if needed
    requestAnimationFrame(() => repositionIfNeeded());
  }

  function hideDetail() {
    detailIndex = null;
    // Reposition after render
    requestAnimationFrame(() => repositionIfNeeded());
  }

  // Reposition picker if it would clip outside viewport
  function repositionIfNeeded() {
    if (!pickerRef) return;

    // Get the shadow host (the positioned element)
    const shadowRoot = pickerRef.getRootNode();
    if (!(shadowRoot instanceof ShadowRoot)) return;
    const host = shadowRoot.host as HTMLElement;
    if (!host) return;

    const rect = pickerRef.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const padding = 8;

    // Check if bottom is clipping
    if (rect.bottom > viewportHeight - padding) {
      const overflow = rect.bottom - (viewportHeight - padding);
      const currentTop = parseInt(host.style.top) || 0;
      const newTop = Math.max(padding, currentTop - overflow);
      host.style.top = `${newTop}px`;
    }

    // Check if right is clipping
    if (rect.right > viewportWidth - padding) {
      const overflow = rect.right - (viewportWidth - padding);
      const currentLeft = parseInt(host.style.left) || 0;
      const newLeft = Math.max(padding, currentLeft - overflow);
      host.style.left = `${newLeft}px`;
    }
  }

  // Checkbox states
  let includeScreenshot = $state(true);
  let includeConsoleLogs = $state(true);
  let suggestImprovements = $state(false);

  let pickerRef: HTMLDivElement | null = $state(null);

  function handleCapture() {
    props.onCapture({
      includeScreenshot,
      includeConsoleLogs,
      suggestImprovements,
    });
  }

  function handleEscape(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
    }
  }

  function isColorValue(value: string): boolean {
    return value.startsWith('#') || value.startsWith('rgb');
  }

  // Framework badge colors (only these have color)
  const frameworkColors: Record<string, { bg: string; text: string; border: string }> = {
    react: { bg: 'rgba(97, 218, 251, 0.15)', text: '#61dafb', border: 'rgba(97, 218, 251, 0.3)' },
    vue: { bg: 'rgba(66, 184, 131, 0.15)', text: '#42b883', border: 'rgba(66, 184, 131, 0.3)' },
    svelte: { bg: 'rgba(255, 62, 0, 0.15)', text: '#ff3e00', border: 'rgba(255, 62, 0, 0.3)' },
    angular: { bg: 'rgba(221, 0, 49, 0.15)', text: '#dd0031', border: 'rgba(221, 0, 49, 0.3)' },
  };

  // Framework SVG icons
  const frameworkIcons: Record<string, string> = {
    react: 'M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38-.318-.184-.688-.277-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44-.96-.236-2.006-.417-3.107-.534-.66-.905-1.345-1.727-2.035-2.447 1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442-1.107.117-2.154.298-3.113.538-.112-.49-.195-.964-.254-1.42-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87-.728.063-1.466.098-2.21.098-.74 0-1.477-.035-2.202-.093-.406-.582-.802-1.204-1.183-1.86-.372-.64-.71-1.29-1.018-1.946.303-.657.646-1.313 1.013-1.954.38-.66.773-1.286 1.18-1.868.728-.064 1.466-.098 2.21-.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933-.2-.39-.41-.783-.64-1.174-.225-.392-.465-.774-.705-1.146zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493-.28-.958-.646-1.956-1.1-2.98.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98-.45 1.017-.812 2.01-1.086 2.964-.484-.15-.944-.318-1.37-.5-1.732-.737-2.852-1.706-2.852-2.474 0-.768 1.12-1.742 2.852-2.476.42-.18.88-.342 1.356-.494zm11.678 4.28c.265.657.49 1.312.676 1.948-.64.157-1.316.29-2.016.39.24-.375.48-.762.705-1.158.225-.39.435-.788.636-1.18zm-9.945.02c.2.392.41.783.64 1.175.23.39.465.772.705 1.143-.695-.102-1.365-.23-2.006-.386.18-.63.406-1.282.66-1.933zM17.92 16.32c.112.493.2.968.254 1.423.23 1.868-.054 3.32-.714 3.708-.147.09-.338.128-.563.128-1.012 0-2.514-.807-4.11-2.28.686-.72 1.37-1.536 2.02-2.44 1.107-.118 2.154-.3 3.113-.54zm-11.83.01c.96.234 2.006.415 3.107.532.66.905 1.345 1.727 2.035 2.446-1.595 1.483-3.092 2.295-4.11 2.295-.22-.005-.406-.05-.553-.132-.666-.38-.955-1.834-.73-3.703.054-.46.142-.944.25-1.438zm4.56.64c.44.02.89.034 1.345.034.46 0 .915-.01 1.36-.034-.44.572-.895 1.095-1.345 1.565-.455-.47-.91-.993-1.36-1.565z',
    vue: 'M24 1.61h-9.94L12 5.16 9.94 1.61H0l12 20.78ZM12 14.08 5.16 2.23h4.43L12 6.41l2.41-4.18h4.43Z',
    svelte: 'M20.68 2.796a7.037 7.037 0 0 0-9.633-1.726L5.39 5.14a6.247 6.247 0 0 0-2.829 4.216A6.5 6.5 0 0 0 3.2 13.4a6.035 6.035 0 0 0-.672 2.833 6.453 6.453 0 0 0 1.152 3.675 7.037 7.037 0 0 0 9.633 1.726l5.656-4.07a6.25 6.25 0 0 0 2.83-4.216 6.5 6.5 0 0 0-.64-4.045 6.04 6.04 0 0 0 .672-2.832 6.453 6.453 0 0 0-1.151-3.675Zm-9.903 18.12a4.261 4.261 0 0 1-4.583-1.616 3.91 3.91 0 0 1-.698-2.227 3.68 3.68 0 0 1 .062-.677l.14-.592.534.319a7.435 7.435 0 0 0 2.257 1.035l.214.062-.02.213a1.189 1.189 0 0 0 .218.78 1.298 1.298 0 0 0 1.395.492 1.212 1.212 0 0 0 .334-.14l5.656-4.07a1.118 1.118 0 0 0 .508-.753 1.187 1.187 0 0 0-.197-.876 1.297 1.297 0 0 0-1.395-.493 1.193 1.193 0 0 0-.334.141l-2.16 1.553a3.93 3.93 0 0 1-1.1.463 4.261 4.261 0 0 1-4.582-1.617 3.909 3.909 0 0 1-.698-2.226 3.66 3.66 0 0 1 1.664-3.087l5.656-4.07a3.928 3.928 0 0 1 1.1-.462 4.261 4.261 0 0 1 4.583 1.617 3.91 3.91 0 0 1 .698 2.226 3.674 3.674 0 0 1-.062.677l-.14.592-.534-.318a7.435 7.435 0 0 0-2.257-1.036l-.214-.062.02-.213a1.19 1.19 0 0 0-.218-.78 1.298 1.298 0 0 0-1.395-.492 1.19 1.19 0 0 0-.334.14l-5.656 4.07a1.118 1.118 0 0 0-.508.754 1.187 1.187 0 0 0 .197.876 1.298 1.298 0 0 0 1.395.492 1.2 1.2 0 0 0 .334-.14l2.16-1.554a3.928 3.928 0 0 1 1.1-.462 4.261 4.261 0 0 1 4.583 1.616 3.91 3.91 0 0 1 .697 2.227 3.66 3.66 0 0 1-1.663 3.086l-5.656 4.07a3.928 3.928 0 0 1-1.1.463Z',
    angular: 'M12 0L1.608 3.876l1.584 13.596L12 24l8.808-6.528 1.584-13.596L12 0zm0 2.16l7.776 2.784-1.296 10.56L12 19.68l-6.48-4.176-1.296-10.56L12 2.16zM12 5.04L7.2 15.6h1.8l.96-2.4h4.08l.96 2.4h1.8L12 5.04zm0 3.024l1.488 3.696h-2.976L12 8.064z',
  };

  let documentClickHandler: ((e: MouseEvent) => void) | null = null;
  let shadowClickHandler: ((e: MouseEvent) => void) | null = null;
  let shadowRoot: ShadowRoot | null = null;

  onMount(() => {
    document.addEventListener('keydown', handleEscape, true);

    const root = pickerRef?.getRootNode();
    const isShadowRoot = root instanceof ShadowRoot;
    const shadowHost = isShadowRoot ? root.host : null;
    shadowRoot = isShadowRoot ? root : null;

    documentClickHandler = (e: MouseEvent) => {
      const path = e.composedPath();
      if (shadowHost) {
        if (!path.includes(shadowHost)) {
          e.stopImmediatePropagation();
          props.onClose();
        }
      } else {
        if (pickerRef && !path.includes(pickerRef)) {
          e.stopImmediatePropagation();
          props.onClose();
        }
      }
    };

    shadowClickHandler = (e: MouseEvent) => {
      const path = e.composedPath();
      if (pickerRef && !path.includes(pickerRef)) {
        e.stopImmediatePropagation();
        props.onClose();
      }
    };

    setTimeout(() => {
      document.addEventListener('click', documentClickHandler!, true);
      if (shadowRoot) {
        shadowRoot.addEventListener('click', shadowClickHandler!, true);
      }
    }, 100);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleEscape, true);
    if (documentClickHandler) {
      document.removeEventListener('click', documentClickHandler, true);
    }
    if (shadowRoot && shadowClickHandler) {
      shadowRoot.removeEventListener('click', shadowClickHandler, true);
    }
  });
</script>

<div
  bind:this={pickerRef}
  data-picker
  class="picker"
>
  <!-- Content area -->
  <div class="content">
    {#if isMultiSelect && props.queuedElements}
        <!-- MULTI-SELECT VIEW with sliding detail panel -->
        <div class="sliding-container">
          <!-- List View -->
          <div class="slide-panel {detailIndex !== null ? 'slide-out-left' : ''}">
            <div class="queue-indicator">
              <span class="queue-badge">{props.queueCount}</span>
              <span class="queue-label">elements selected</span>
              <span class="queue-hint">(click to add/remove)</span>
            </div>

            <div class="context-header">
              <span class="page-url">{props.pageUrl}</span>
            </div>

            <div class="section-label">SELECTED ELEMENTS</div>
            <div class="elements-list">
              {#each props.queuedElements as item, i}
                <div
                  class="element-item clickable"
                  role="button"
                  tabindex="0"
                  onclick={() => showDetail(i)}
                  onkeydown={(e) => e.key === 'Enter' && showDetail(i)}
                  onmouseenter={() => props.onHighlightQueuedElement?.(i)}
                  onmouseleave={() => props.onUnhighlightQueuedElement?.()}
                >
                  <span class="element-index">{i + 1}</span>
                  <div class="element-details">
                    <span class="element-label">{item.label}</span>
                    {#if item.sourceInfo}
                      <div class="element-source">
                        <span
                          class="framework-badge-mini"
                          style="background: {frameworkColors[item.sourceInfo.framework]?.bg ?? 'rgba(255,255,255,0.1)'}; color: {frameworkColors[item.sourceInfo.framework]?.text ?? '#fff'};"
                        >
                          {item.sourceInfo.framework}
                        </span>
                        <span class="component-name-mini">{item.sourceInfo.component}</span>
                        {#if item.sourceInfo.file}
                          <span class="file-location-mini">{item.sourceInfo.file}{item.sourceInfo.line ? `:${item.sourceInfo.line}` : ''}</span>
                        {/if}
                      </div>
                    {/if}
                  </div>
                  <div class="item-actions">
                    <button
                      class="remove-btn"
                      type="button"
                      onclick={(e) => { e.stopPropagation(); props.onRemoveQueuedElement?.(i); }}
                      aria-label="Remove element"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                    <ChevronRight size={14} class="chevron-icon" />
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Detail View -->
          {#if detailIndex !== null && detailItem && detailInfo}
            <div class="slide-panel detail-panel slide-in-right">
              <button class="back-btn" onclick={hideDetail}>
                <ChevronLeft size={14} />
                <span>Back</span>
              </button>

              {#if detailItem.sourceInfo}
                <div class="source-info">
                  <span
                    class="framework-badge"
                    style="background: {frameworkColors[detailItem.sourceInfo.framework]?.bg ?? 'rgba(255,255,255,0.1)'}; color: {frameworkColors[detailItem.sourceInfo.framework]?.text ?? '#fff'}; border-color: {frameworkColors[detailItem.sourceInfo.framework]?.border ?? 'rgba(255,255,255,0.2)'};"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d={frameworkIcons[detailItem.sourceInfo.framework] || ''}/>
                    </svg>
                    {detailItem.sourceInfo.framework.charAt(0).toUpperCase() + detailItem.sourceInfo.framework.slice(1)}
                  </span>
                  <span class="component-name">{detailItem.sourceInfo.component}</span>
                  {#if detailItem.sourceInfo.file}
                    <div class="file-location">{detailItem.sourceInfo.file}{detailItem.sourceInfo.line ? `:${detailItem.sourceInfo.line}` : ''}</div>
                  {/if}
                </div>
              {/if}

              <div class="section-label">ELEMENT</div>
              <div class="html-block">
                <span class="syntax-bracket">&lt;</span><span class="syntax-tag">{detailInfo.tag}</span>
                {#each detailInfo.attrs as { name, value }}
                  <div class="attr-line">
                    <span class="syntax-attr">{name}</span><span class="syntax-punct">=&quot;</span><span class="syntax-value">{value}</span><span class="syntax-punct">&quot;</span>
                  </div>
                {/each}
                <span class="syntax-bracket">&gt;</span>

                {#if detailInfo.textContent}
                  <div class="text-content">&quot;{detailInfo.textContent}&quot;</div>
                {/if}

                {#if detailInfo.childCount > 0}
                  <div class="children-indicator">… {detailInfo.childCount} child{detailInfo.childCount !== 1 ? 'ren' : ''}</div>
                {/if}

                <span class="syntax-bracket">&lt;/</span><span class="syntax-tag-close">{detailInfo.tag}</span><span class="syntax-bracket">&gt;</span>
              </div>

              {#if detailInfo.styles.length > 0}
                <div class="section-label" style="margin-top: 10px;">STYLES</div>
                <div class="styles-block">
                  {#each detailInfo.styles as { prop, value }}
                    <div class="style-row">
                      <span class="style-prop">{prop}</span>
                      <span class="style-value">
                        {#if isColorValue(value)}
                          <span class="color-swatch" style="background-color: {value};"></span>
                        {/if}
                        {value}
                      </span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {:else}
        <!-- SINGLE ELEMENT VIEW -->
        {#if props.sourceInfo}
          <div class="source-info">
            <span
              class="framework-badge"
              style="background: {frameworkColors[props.sourceInfo.framework]?.bg ?? 'rgba(255,255,255,0.1)'}; color: {frameworkColors[props.sourceInfo.framework]?.text ?? '#fff'}; border-color: {frameworkColors[props.sourceInfo.framework]?.border ?? 'rgba(255,255,255,0.2)'};"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d={frameworkIcons[props.sourceInfo.framework] || ''}/>
              </svg>
              {props.sourceInfo.framework.charAt(0).toUpperCase() + props.sourceInfo.framework.slice(1)}
            </span>
            <span class="component-name">{props.sourceInfo.component}</span>
            {#if props.sourceInfo.file}
              <div class="file-location">{props.sourceInfo.file}{props.sourceInfo.line ? `:${props.sourceInfo.line}` : ''}</div>
            {/if}
          </div>
        {/if}

        <div class="context-header">
          <span class="page-url">{props.pageUrl}</span>
          {#if props.parents.length > 0}
            <div class="parent-path">
              {#each props.parents as parent, i}
                <span
                  class="breadcrumb"
                  role="button"
                  tabindex="-1"
                  onclick={() => props.onSelectParent?.(i)}
                  onkeydown={(e) => e.key === 'Enter' && props.onSelectParent?.(i)}
                  onmouseenter={() => props.onHighlightParent?.(i)}
                  onmouseleave={() => props.onUnhighlightParent?.()}
                >{parent.label}</span>{#if i < props.parents.length - 1}<span class="breadcrumb-sep">›</span>{/if}
              {/each}
            </div>
          {/if}
        </div>

        <div class="section-label">ELEMENT</div>
        <div class="html-block">
          <span class="syntax-bracket">&lt;</span><span class="syntax-tag">{props.tag}</span>
          {#each props.attrs as { name, value }}
            <div class="attr-line">
              <span class="syntax-attr">{name}</span><span class="syntax-punct">=&quot;</span><span class="syntax-value">{value}</span><span class="syntax-punct">&quot;</span>
            </div>
          {/each}
          <span class="syntax-bracket">&gt;</span>

          {#if props.textContent}
            <div class="text-content">&quot;{props.textContent}&quot;</div>
          {/if}

          {#if props.childCount > 0}
            <div class="children-indicator">… {props.childCount} child{props.childCount !== 1 ? 'ren' : ''}</div>
          {/if}

          <span class="syntax-bracket">&lt;/</span><span class="syntax-tag-close">{props.tag}</span><span class="syntax-bracket">&gt;</span>
        </div>

        {#if props.styles.length > 0}
          <div class="section-label" style="margin-top: 10px;">STYLES</div>
          <div class="styles-block">
            {#each props.styles as { prop, value }}
              <div class="style-row">
                <span class="style-prop">{prop}</span>
                <span class="style-value">
                  {#if isColorValue(value)}
                    <span class="color-swatch" style="background-color: {value};"></span>
                  {/if}
                  {value}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
  </div>

  <!-- Capture options -->
  <div class="options">
    <label class="option-label">
      <input type="checkbox" bind:checked={includeScreenshot} class="checkbox" />
      <span>Include screenshot</span>
    </label>
    <label class="option-label">
      <input type="checkbox" bind:checked={includeConsoleLogs} class="checkbox" />
      <span>Include console logs</span>
    </label>
    <label class="option-label">
      <input type="checkbox" bind:checked={suggestImprovements} class="checkbox" />
      <span>Suggest improvements</span>
    </label>
  </div>

  <!-- Action buttons -->
  <div class="actions">
    <button class="capture-btn" onclick={handleCapture}>
      <Plus size={14} />
      Add to context
    </button>
    <button class="close-btn" onclick={() => props.onClose()}>
      <X size={14} />
    </button>
  </div>
</div>

<style>
  @import "tailwindcss";

  .picker {
    background: rgba(0, 0, 0, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    padding: 12px;
    min-width: 280px;
    max-width: 420px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    box-shadow: 0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset;
    backdrop-filter: blur(24px) saturate(180%);
  }

  .content {
    margin-bottom: 12px;
    font-family: ui-monospace, monospace;
    font-size: 11px;
    line-height: 1.5;
  }

  .options {
    margin-bottom: 12px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .option-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.7);
    transition: color 0.1s;
  }

  .option-label:hover {
    color: rgba(255, 255, 255, 0.9);
  }

  .checkbox {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.05);
    cursor: pointer;
    accent-color: #3b82f6;
  }

  .actions {
    display: flex;
    gap: 6px;
  }

  .capture-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 10px;
    background: rgba(59, 130, 246, 0.2);
    color: #93c5fd;
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s;
  }

  .capture-btn:hover {
    background: rgba(59, 130, 246, 0.3);
    border-color: rgba(59, 130, 246, 0.5);
    color: #bfdbfe;
  }

  .capture-btn:active {
    transform: scale(0.97);
  }

  .close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    padding: 8px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    background: transparent;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.7);
  }

  /* Queue/multi-select styles */
  :global(.queue-indicator) {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
  }

  :global(.queue-badge) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    color: black;
  }

  :global(.queue-label) {
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
  }

  :global(.queue-hint) {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    margin-left: auto;
  }

  :global(.elements-list) {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 200px;
    overflow-y: auto;
  }

  :global(.element-item) {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s;
  }

  :global(.element-item:hover) {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
  }

  :global(.element-index) {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    flex-shrink: 0;
  }

  :global(.element-details) {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  :global(.element-label) {
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.85);
    font-family: ui-monospace, monospace;
  }

  :global(.element-source) {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  :global(.framework-badge-mini) {
    padding: 1px 5px;
    font-size: 9px;
    font-weight: 600;
    border-radius: 3px;
    text-transform: capitalize;
  }

  :global(.component-name-mini) {
    font-size: 10px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
  }

  :global(.file-location-mini) {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.35);
    font-family: ui-monospace, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.remove-btn) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.3);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.1s, color 0.1s;
  }

  :global(.remove-btn:hover) {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  /* Source info styles */
  :global(.source-info) {
    margin-bottom: 10px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
  }

  :global(.framework-badge) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 600;
    border-radius: 4px;
    border: 1px solid;
    text-transform: capitalize;
  }

  :global(.component-name) {
    display: inline-block;
    margin-left: 8px;
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
  }

  :global(.file-location) {
    margin-top: 4px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    font-family: ui-monospace, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
  }

  /* Context header */
  :global(.context-header) {
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  :global(.page-url) {
    display: block;
    font-size: 9px;
    color: rgba(255, 255, 255, 0.3);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.ancestor-label) {
    display: block;
    margin-top: 3px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.25);
  }

  :global(.parent-path) {
    position: relative;
    display: flex;
    align-items: center;
    margin-top: 3px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.25);
    overflow: hidden;
    white-space: nowrap;
    mask-image: linear-gradient(to right, black calc(100% - 30px), transparent 100%);
    -webkit-mask-image: linear-gradient(to right, black calc(100% - 30px), transparent 100%);
  }

  :global(.breadcrumb) {
    cursor: pointer;
    padding: 1px 3px;
    border-radius: 3px;
    transition: color 0.1s, background 0.1s;
    flex-shrink: 0;
  }

  :global(.breadcrumb:hover) {
    color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.08);
  }

  :global(.breadcrumb-sep) {
    margin: 0 2px;
    color: rgba(255, 255, 255, 0.15);
    flex-shrink: 0;
  }

  :global(.section-label) {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.2);
    margin-bottom: 6px;
    font-family: inherit;
  }

  /* HTML block */
  :global(.html-block) {
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    line-height: 1.6;
    overflow: hidden;
  }

  :global(.syntax-bracket) { color: rgba(255, 255, 255, 0.35); }
  :global(.syntax-tag) { color: #7dcfff; font-weight: 500; }
  :global(.syntax-tag-close) { color: rgba(125, 207, 255, 0.6); }
  :global(.attr-line) { padding-left: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(.syntax-attr) { color: #bb9af7; }
  :global(.syntax-punct) { color: rgba(255, 255, 255, 0.2); }
  :global(.syntax-value) { color: #e0af68; }
  :global(.text-content) { padding-left: 14px; color: #9ece6a; opacity: 0.7; font-style: italic; font-size: 10px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(.children-indicator) { padding-left: 14px; color: rgba(255, 255, 255, 0.2); font-size: 10px; }

  /* Styles block */
  :global(.styles-block) {
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
  }

  :global(.style-row) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 2px 0;
  }

  :global(.style-prop) { color: rgba(255, 255, 255, 0.4); flex-shrink: 0; }
  :global(.style-value) { color: rgba(255, 255, 255, 0.75); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 6px; }
  :global(.color-swatch) { display: inline-block; width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; border: 1px solid rgba(255, 255, 255, 0.15); }

  /* Region block */
  :global(.region-block) {
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
  }

  :global(.region-title) { font-size: 12px; font-weight: 500; color: rgba(255, 255, 255, 0.7); margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
  :global(.region-dims) { display: flex; align-items: baseline; gap: 4px; margin-bottom: 6px; }
  :global(.dims-value) { font-size: 14px; font-weight: 500; color: rgba(255, 255, 255, 0.8); font-variant-numeric: tabular-nums; }
  :global(.dims-unit) { font-size: 10px; color: rgba(255, 255, 255, 0.3); }
  :global(.element-count) { font-size: 11px; color: rgba(255, 255, 255, 0.4); margin-bottom: 6px; }
  :global(.count-number) { color: #7dcfff; font-weight: 500; }
  :global(.tag-breakdown) { display: flex; flex-wrap: wrap; gap: 2px 0; font-size: 10px; line-height: 1.6; }
  :global(.tag-item) { display: inline-flex; align-items: center; gap: 1px; }
  :global(.tag-name) { color: rgba(255, 255, 255, 0.5); }
  :global(.tag-count) { color: rgba(255, 255, 255, 0.25); font-size: 9px; }
  :global(.tag-sep) { margin: 0 4px; color: rgba(255, 255, 255, 0.12); }

  :global(.labels-block) { display: flex; flex-wrap: wrap; gap: 4px; }
  :global(.label-chip) { display: inline-block; padding: 2px 8px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 4px; font-size: 10px; color: rgba(255, 255, 255, 0.55); }

  /* Region elements (non-interactive) */
  :global(.region-element) {
    cursor: default;
  }

  :global(.region-element:hover) {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
  }

  /* Sliding container for multi-select detail view */
  :global(.sliding-container) {
    position: relative;
    overflow: hidden;
    max-height: 350px;
  }

  :global(.detail-panel) {
    position: relative;
    max-height: 350px;
    overflow-y: auto;
  }

  :global(.slide-panel) {
    transition: transform 0.25s ease, opacity 0.25s ease;
  }

  :global(.slide-out-left) {
    transform: translateX(-100%);
    opacity: 0;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    pointer-events: none;
  }

  :global(.slide-in-right) {
    animation: slideInRight 0.25s ease forwards;
  }

  @keyframes slideInRight {
    from {
      transform: translateX(30%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  :global(.clickable) {
    cursor: pointer;
  }

  :global(.item-actions) {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  :global(.chevron-icon) {
    color: rgba(255, 255, 255, 0.25);
    transition: color 0.1s;
  }

  :global(.element-item:hover .chevron-icon) {
    color: rgba(255, 255, 255, 0.5);
  }

  :global(.back-btn) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    margin-bottom: 10px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }

  :global(.back-btn:hover) {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
    border-color: rgba(255, 255, 255, 0.2);
  }
</style>
