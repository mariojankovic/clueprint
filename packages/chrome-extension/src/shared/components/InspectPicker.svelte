<script lang="ts">
  import Picker from './Picker.svelte';

  interface Props {
    tag: string;
    attrs: Array<{ name: string; value: string }>;
    textContent: string;
    parents: Array<{ label: string }>;
    pageUrl: string;
    childCount: number;
    styles: Array<{ prop: string; value: string }>;
    onSelect: (intent: 'tag' | 'fix' | 'beautify') => void;
    onClose: () => void;
    onHighlightParent: (index: number) => void;
    onUnhighlightParent: () => void;
    onSelectParent: (index: number) => void;
  }

  let { tag, attrs, textContent, parents, pageUrl, childCount, styles, onSelect, onClose, onHighlightParent, onUnhighlightParent, onSelectParent }: Props = $props();

  function isColorValue(value: string): boolean {
    return value.startsWith('#') || value.startsWith('rgb');
  }
</script>

<Picker {onSelect} {onClose}>
  {#snippet content()}
    <!-- Page & location context -->
    <div class="context-header">
      <span class="page-url">{pageUrl}</span>
      {#if parents.length > 0}
        <div class="parent-path">
          {#each parents as parent, i}
            <span
              class="breadcrumb"
              role="button"
              tabindex="-1"
              onclick={() => onSelectParent(i)}
              onkeydown={(e) => e.key === 'Enter' && onSelectParent(i)}
              onmouseenter={() => onHighlightParent(i)}
              onmouseleave={() => onUnhighlightParent()}
            >{parent.label}</span>{#if i < parents.length - 1}<span class="breadcrumb-sep">›</span>{/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- Section: DOM -->
    <div class="section-label">ELEMENT</div>

    <!-- Syntax-highlighted HTML tag -->
    <div class="html-block">
      <span class="syntax-bracket">&lt;</span><span class="syntax-tag">{tag}</span>
      {#each attrs as { name, value }}
        <div class="attr-line">
          <span class="syntax-attr">{name}</span><span class="syntax-punct">=&quot;</span><span class="syntax-value">{value}</span><span class="syntax-punct">&quot;</span>
        </div>
      {/each}
      <span class="syntax-bracket">&gt;</span>

      {#if textContent}
        <div class="text-content">&quot;{textContent}&quot;</div>
      {/if}

      {#if childCount > 0}
        <div class="children-indicator">… {childCount} child{childCount !== 1 ? 'ren' : ''}</div>
      {/if}

      <span class="syntax-bracket">&lt;/</span><span class="syntax-tag-close">{tag}</span><span class="syntax-bracket">&gt;</span>
    </div>

    <!-- Section: Styles -->
    {#if styles.length > 0}
      <div class="section-label" style="margin-top: 10px;">STYLES</div>
      <div class="styles-block">
        {#each styles as { prop, value }}
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
  {/snippet}
</Picker>

<style>
  @import "tailwindcss";

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

  :global(.parent-path) {
    display: flex;
    align-items: center;
    margin-top: 3px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.25);
    overflow-x: auto;
    white-space: nowrap;
    scrollbar-width: none;
  }

  :global(.parent-path::-webkit-scrollbar) {
    display: none;
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

  :global(.html-block) {
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    line-height: 1.6;
    overflow: hidden;
  }

  :global(.syntax-bracket) {
    color: rgba(255, 255, 255, 0.35);
  }

  :global(.syntax-tag) {
    color: #7dcfff;
    font-weight: 500;
  }

  :global(.syntax-tag-close) {
    color: rgba(125, 207, 255, 0.6);
  }

  :global(.attr-line) {
    padding-left: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.syntax-attr) {
    color: #bb9af7;
  }

  :global(.syntax-punct) {
    color: rgba(255, 255, 255, 0.2);
  }

  :global(.syntax-value) {
    color: #e0af68;
  }

  :global(.text-content) {
    padding-left: 14px;
    color: #9ece6a;
    opacity: 0.7;
    font-style: italic;
    font-size: 10px;
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.children-indicator) {
    padding-left: 14px;
    color: rgba(255, 255, 255, 0.2);
    font-size: 10px;
  }

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

  :global(.style-prop) {
    color: rgba(255, 255, 255, 0.4);
    flex-shrink: 0;
  }

  :global(.style-value) {
    color: rgba(255, 255, 255, 0.75);
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  :global(.color-swatch) {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }
</style>

