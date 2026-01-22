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

  <button
    class="btn btn-full btn-primary"
    onclick={() => onSelect('tag', instruction.trim() || undefined)}
  >
    <Bookmark size={16} />
    Tag for AI
  </button>

  <button
    class="btn btn-full"
    onclick={() => onSelect('fix', instruction.trim() || undefined)}
  >
    <Wrench size={16} />
    Fix
  </button>

  <button
    class="btn btn-full"
    onclick={() => onSelect('beautify', instruction.trim() || undefined)}
  >
    <Sparkles size={16} />
    Beautify
  </button>

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
    background: rgba(0, 0, 0, 0.96);
    backdrop-filter: blur(32px) saturate(200%);
    -webkit-backdrop-filter: blur(32px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
    padding: 14px;
    min-width: 260px;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .picker-header {
    margin-bottom: 12px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 10px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    color: #ffffff;
    cursor: pointer;
    text-align: center;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .btn:active {
    transform: scale(0.98) translateY(0);
  }

  .btn :global(svg) {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .btn-full {
    display: flex;
    width: 100%;
    margin-bottom: 10px;
    text-align: left;
    justify-content: flex-start;
  }

  .btn-full:last-of-type {
    margin-bottom: 14px;
  }

  .btn-primary {
    background: rgba(255, 255, 255, 0.95);
    border-color: rgba(255, 255, 255, 1);
    color: #000000;
  }

  .btn-primary:hover {
    background: rgba(255, 255, 255, 1);
    border-color: rgba(255, 255, 255, 1);
  }

  .note-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    font-size: 12px;
    color: #ffffff;
    background: rgba(255, 255, 255, 0.04);
    outline: none;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .note-input:focus {
    border-color: rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.08);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.06);
  }

  .note-input::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
</style>
