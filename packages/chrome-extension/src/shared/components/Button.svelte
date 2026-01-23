<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'action' | 'action-danger';
    onclick?: () => void;
    children: Snippet;
    right?: Snippet;
  }

  let { variant = 'secondary', onclick, children, right }: Props = $props();
</script>

{#if variant === 'primary'}
  <button
    class="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 border border-transparent rounded-[10px] bg-white/95 text-black cursor-pointer text-center text-xs font-medium transition-all duration-150 hover:bg-white active:scale-[0.98] [&_svg]:w-3.5 [&_svg]:h-3.5 [&_svg]:shrink-0 [&_svg]:opacity-80"
    {onclick}
  >
    {@render children()}
  </button>
{:else if variant === 'action'}
  <button
    class="flex justify-between items-center w-full h-14 px-[18px] bg-white/[0.04] border border-white/[0.08] rounded-xl text-white cursor-pointer transition-all duration-200 backdrop-blur-[20px] hover:bg-white/[0.08] hover:border-white/[0.12] hover:-translate-y-px active:translate-y-0"
    {onclick}
  >
    <div class="flex items-center gap-3">
      {@render children()}
    </div>
    {#if right}
      {@render right()}
    {/if}
  </button>
{:else if variant === 'action-danger'}
  <button
    class="flex justify-between items-center w-full h-14 px-[18px] bg-red-400/10 border border-red-400/20 rounded-xl text-white cursor-pointer transition-all duration-200 backdrop-blur-[20px] hover:bg-red-400/[0.15] hover:border-red-400/30 hover:-translate-y-px active:translate-y-0"
    {onclick}
  >
    <div class="flex items-center gap-3">
      {@render children()}
    </div>
    {#if right}
      {@render right()}
    {/if}
  </button>
{:else}
  <button
    class="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 border border-white/10 rounded-[10px] bg-white/5 text-white/80 cursor-pointer text-center text-xs font-medium transition-all duration-150 hover:bg-white/10 hover:border-white/15 hover:text-white active:scale-[0.98] [&_svg]:w-3.5 [&_svg]:h-3.5 [&_svg]:shrink-0 [&_svg]:opacity-70"
    {onclick}
  >
    {@render children()}
  </button>
{/if}

<style>
  @import "tailwindcss";
</style>
