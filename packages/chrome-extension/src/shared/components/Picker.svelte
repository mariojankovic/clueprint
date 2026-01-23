<script lang="ts">
  import { Bookmark, Wrench, Sparkles, X } from 'lucide-svelte';
  import { onMount, onDestroy } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    content: Snippet;
    onSelect: (intent: 'tag' | 'fix' | 'beautify') => void;
    onClose: () => void;
  }

  let { content, onSelect, onClose }: Props = $props();
  let pickerRef: HTMLDivElement | null = $state(null);

  function handleEscape(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }

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
          onClose();
        }
      } else {
        if (pickerRef && !path.includes(pickerRef)) {
          e.stopImmediatePropagation();
          onClose();
        }
      }
    };

    shadowClickHandler = (e: MouseEvent) => {
      const path = e.composedPath();
      if (pickerRef && !path.includes(pickerRef)) {
        e.stopImmediatePropagation();
        onClose();
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
  class="bg-black/70 border border-white/10 rounded-[14px] p-3 min-w-[280px] max-w-[420px] font-sans shadow-[0_16px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-xl backdrop-saturate-[180%]"
>
  <!-- Content area -->
  <div class="mb-3 font-mono text-[11px] leading-relaxed">
    {@render content()}
  </div>

  <!-- Action buttons row -->
  <div class="flex gap-1.5">
    <button
      class="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 border border-white/10 rounded-[10px] bg-white/[0.06] text-white/80 cursor-pointer text-[11px] font-medium font-sans transition-all duration-150 hover:bg-white/[0.12] hover:border-white/15 hover:text-white active:scale-[0.97] [&_svg]:w-3.5 [&_svg]:h-3.5 [&_svg]:shrink-0 [&_svg]:opacity-70"
      onclick={() => onSelect('tag')}
    >
      <Bookmark size={14} />
      Context
    </button>

    <button
      class="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 border border-white/10 rounded-[10px] bg-white/[0.06] text-white/80 cursor-pointer text-[11px] font-medium font-sans transition-all duration-150 hover:bg-white/[0.12] hover:border-white/15 hover:text-white active:scale-[0.97] [&_svg]:w-3.5 [&_svg]:h-3.5 [&_svg]:shrink-0 [&_svg]:opacity-70"
      onclick={() => onSelect('fix')}
    >
      <Wrench size={14} />
      Fix
    </button>

    <button
      class="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 border border-white/10 rounded-[10px] bg-white/[0.06] text-white/80 cursor-pointer text-[11px] font-medium font-sans transition-all duration-150 hover:bg-white/[0.12] hover:border-white/15 hover:text-white active:scale-[0.97] [&_svg]:w-3.5 [&_svg]:h-3.5 [&_svg]:shrink-0 [&_svg]:opacity-70"
      onclick={() => onSelect('beautify')}
    >
      <Sparkles size={14} />
      Beautify
    </button>

    <button
      class="inline-flex items-center justify-center w-8 py-2 border border-white/[0.06] rounded-[10px] bg-transparent text-white/40 cursor-pointer transition-all duration-150 hover:bg-white/[0.08] hover:text-white/70 active:scale-[0.97]"
      onclick={() => onClose()}
    >
      <X size={14} />
    </button>
  </div>
</div>

<style>
  @import "tailwindcss";
</style>
