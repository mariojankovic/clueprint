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
    setTimeout(() => inputEl?.focus(), 50);
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
    class="btn btn-primary"
    onclick={() => onSelect('tag', instruction.trim() || undefined)}
  >
    <Bookmark size={16} />
    Tag for AI
  </button>

  <input
    bind:this={inputEl}
    bind:value={instruction}
    type="text"
    class="picker-input"
    placeholder="Add a note (optional)..."
    onkeydown={handleKeydown}
  />

  <div class="btn-row">
    <button
      class="btn"
      onclick={() => onSelect('fix', instruction.trim() || undefined)}
    >
      <Wrench size={16} />
      Fix
    </button>
    <button
      class="btn"
      onclick={() => onSelect('beautify', instruction.trim() || undefined)}
    >
      <Sparkles size={16} />
      Beautify
    </button>
  </div>

  <div class="picker-hint">Press Enter to tag, or choose an action</div>
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

  .picker-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    font-size: 13px;
    color: #ffffff;
    background: rgba(255, 255, 255, 0.04);
    margin-bottom: 12px;
    outline: none;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .picker-input:focus {
    border-color: rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.08);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.06);
  }

  .picker-input::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }

  .btn-row {
    display: flex;
    gap: 12px;
  }

  .btn {
    flex: 1;
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

  .btn-primary {
    width: 100%;
    margin-bottom: 12px;
    background: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.3);
  }

  .btn-primary:hover {
    background: rgba(99, 102, 241, 0.25);
    border-color: rgba(99, 102, 241, 0.4);
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

  .picker-hint {
    margin-top: 10px;
    color: rgba(255, 255, 255, 0.35);
    font-size: 10px;
    text-align: center;
  }
</style>
