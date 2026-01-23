<script lang="ts">
  interface Props {
    message: string;
    duration?: number;
  }

  let { message, duration = 2500 }: Props = $props();
</script>

<div
  class="bg-black/95 text-white py-3.5 px-5 rounded-2xl font-sans text-[13px] font-medium shadow-[0_16px_48px_rgba(0,0,0,0.5)] max-w-[360px] backdrop-blur-[32px] backdrop-saturate-200 border border-white/10 animate-[fadeOut_var(--duration,2500ms)_forwards] [&_strong]:font-semibold [&_strong]:text-indigo-300"
  style="--duration: {duration}ms"
>
  {@html message}
</div>

<style>
  @import "tailwindcss";

  @keyframes fadeOut {
    0% { opacity: 1; transform: translateY(0); }
    75% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-8px); }
  }
</style>
