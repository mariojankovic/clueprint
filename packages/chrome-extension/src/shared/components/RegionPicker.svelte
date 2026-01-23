<script lang="ts">
  import Picker from './Picker.svelte';
  import { Image } from 'lucide-svelte';

  interface Props {
    width: number;
    height: number;
    elementCount: number;
    tagBreakdown: Array<{ tag: string; count: number }>;
    ancestorLabel: string;
    title: string;
    labels: string[];
    pageUrl: string;
    onSelect: (intent: 'tag' | 'fix' | 'beautify', includeScreenshot: boolean) => void;
    onClose: () => void;
  }

  let { width, height, elementCount, tagBreakdown, ancestorLabel, title, labels, pageUrl, onSelect, onClose }: Props = $props();
  let includeScreenshot = $state(true);
</script>

<Picker onSelect={(intent) => onSelect(intent, includeScreenshot)} {onClose}>
  {#snippet content()}
    <!-- Page context -->
    <div class="context-header">
      <span class="page-url">{pageUrl}</span>
      {#if ancestorLabel}
        <span class="ancestor-label">in {ancestorLabel}</span>
      {/if}
    </div>

    <!-- Section: Region -->
    <div class="section-label">REGION</div>
    <div class="region-block">
      {#if title}
        <div class="region-title">{title}</div>
      {/if}

      <div class="region-dims">
        <span class="dims-value">{width} × {height}</span>
        <span class="dims-unit">px</span>
      </div>

      <div class="element-count">
        <span class="count-number">{elementCount}</span> element{elementCount !== 1 ? 's' : ''}
      </div>

      {#if tagBreakdown.length > 0}
        <div class="tag-breakdown">
          {#each tagBreakdown as { tag, count }, i}
            <span class="tag-item">
              <span class="tag-name">{tag}</span><span class="tag-count">×{count}</span>
            </span>{#if i < tagBreakdown.length - 1}<span class="tag-sep">·</span>{/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- Interactive elements -->
    {#if labels.length > 0}
      <div class="section-label" style="margin-top: 10px;">CONTENT</div>
      <div class="labels-block">
        {#each labels as label}
          <span class="label-chip">{label}</span>
        {/each}
      </div>
    {/if}

    <!-- Screenshot toggle -->
    <label class="screenshot-toggle">
      <input type="checkbox" bind:checked={includeScreenshot} />
      <span>Include screenshot</span>
    </label>
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

  :global(.ancestor-label) {
    display: block;
    margin-top: 3px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.25);
  }

  :global(.section-label) {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.2);
    margin-bottom: 6px;
    font-family: inherit;
  }

  :global(.region-block) {
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
  }

  :global(.region-dims) {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-bottom: 6px;
  }

  :global(.dims-value) {
    font-size: 14px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
    font-variant-numeric: tabular-nums;
  }

  :global(.dims-unit) {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.3);
  }

  :global(.element-count) {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 6px;
  }

  :global(.count-number) {
    color: #7dcfff;
    font-weight: 500;
  }

  :global(.tag-breakdown) {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 0;
    font-size: 10px;
    line-height: 1.6;
  }

  :global(.tag-item) {
    display: inline-flex;
    align-items: center;
    gap: 1px;
  }

  :global(.tag-name) {
    color: rgba(255, 255, 255, 0.5);
  }

  :global(.tag-count) {
    color: rgba(255, 255, 255, 0.25);
    font-size: 9px;
  }

  :global(.tag-sep) {
    margin: 0 4px;
    color: rgba(255, 255, 255, 0.12);
  }

  :global(.region-title) {
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  }

  :global(.labels-block) {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  :global(.label-chip) {
    display: inline-block;
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.55);
  }

  :global(.screenshot-toggle) {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    user-select: none;
  }

  :global(.screenshot-toggle input[type="checkbox"]) {
    appearance: none;
    width: 12px;
    height: 12px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
    cursor: pointer;
    position: relative;
  }

  :global(.screenshot-toggle input[type="checkbox"]:checked) {
    background: rgba(125, 207, 255, 0.2);
    border-color: rgba(125, 207, 255, 0.5);
  }

  :global(.screenshot-toggle input[type="checkbox"]:checked::after) {
    content: '';
    position: absolute;
    top: 1px;
    left: 3px;
    width: 4px;
    height: 7px;
    border: solid rgba(125, 207, 255, 0.9);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
  }
</style>
