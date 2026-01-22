<script lang="ts">
  import { Bookmark, Wrench, Sparkles } from 'lucide-svelte';
  import { onMount, onDestroy } from 'svelte';

  interface Props {
    elementName: string;
    onSelect: (intent: 'tag' | 'fix' | 'beautify', instruction?: string) => void;
    onClose: () => void;
  }

  let { elementName, onSelect, onClose }: Props = $props();
  let instruction = $state('');
  let inputEl: HTMLInputElement | undefined = $state();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSelect('tag', instruction.trim() || undefined);
    }
  }

  function handleEscape(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as Node;
    const picker = document.querySelector('.picker-container');
    if (picker && !picker.contains(target)) {
      onClose();
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleEscape, true);
    setTimeout(() => document.addEventListener('click', handleClickOutside), 100);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleEscape, true);
    document.removeEventListener('click', handleClickOutside);
  });
</script>

<div class="picker-container">
  <div class="picker-header">{elementName}</div>

  <div class="btn-group">
    <button
      class="btn btn-primary"
      onclick={() => onSelect('tag', instruction.trim() || undefined)}
    >
      <Bookmark size={14} />
      Tag for AI
    </button>

    <div class="btn-row">
      <button
        class="btn"
        onclick={() => onSelect('fix', instruction.trim() || undefined)}
      >
        <Wrench size={14} />
        Fix
      </button>

      <button
        class="btn"
        onclick={() => onSelect('beautify', instruction.trim() || undefined)}
      >
        <Sparkles size={14} />
        Beautify
      </button>
    </div>
  </div>

  <input
    bind:this={inputEl}
    bind:value={instruction}
    type="text"
    class="note-input"
    placeholder="Add a note (optional)..."
    onkeydown={handleKeydown}
  />
</div>

<style>
  .picker-container {
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    padding: 12px;
    min-width: 220px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .picker-header {
    margin-bottom: 10px;
    padding: 0 2px;
    color: rgba(255, 255, 255, 0.4);
    font-size: 10px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-weight: 500;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .btn-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
  }

  .btn-row {
    display: flex;
    gap: 6px;
  }

  .btn-row .btn {
    flex: 1;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    text-align: center;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.15s ease;
  }

  .btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.15);
    color: #fff;
  }

  .btn:active {
    transform: scale(0.98);
  }

  .btn :global(svg) {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    opacity: 0.7;
  }

  .btn-primary {
    background: rgba(255, 255, 255, 0.95);
    border-color: transparent;
    color: #000;
  }

  .btn-primary :global(svg) {
    opacity: 0.8;
  }

  .btn-primary:hover {
    background: #fff;
  }

  .note-input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.04);
    outline: none;
    font-family: inherit;
    transition: all 0.15s ease;
  }

  .note-input:focus {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.06);
  }

  .note-input::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }
</style>
