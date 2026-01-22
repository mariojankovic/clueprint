<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'default' | 'primary' | 'danger' | 'full';
    onclick?: () => void;
    children: Snippet;
  }

  let { variant = 'default', onclick, children }: Props = $props();

  const baseClasses = 'inline-flex items-center justify-center gap-2 px-3.5 py-2.5 border rounded-[10px] text-white text-sm font-medium cursor-pointer transition-all duration-200';

  const variantClasses = {
    default: 'bg-white/[0.04] border-white/10 hover:bg-white/10 hover:border-white/20',
    primary: 'bg-white/[0.08] border-white/[0.12] shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:bg-white/[0.12] hover:border-white/20',
    danger: 'bg-red-500/15 border-red-500/30 shadow-[0_8px_24px_rgba(239,68,68,0.2)] hover:bg-red-500/25 hover:border-red-500/40',
    full: 'w-full text-left justify-start mb-2.5 last:mb-3.5',
  };

  $effect(() => {
    // Variant reactivity
  });
</script>

<button
  class="{baseClasses} {variantClasses[variant]} hover:-translate-y-px active:scale-[0.98] active:translate-y-0"
  onclick={onclick}
>
  {@render children()}
</button>

<style>
  button :global(svg) {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
</style>
