<script lang="ts">
  interface Props {
    message: string;
    type?: 'info' | 'success' | 'warning';
    duration?: number;
  }

  let { message, type = 'info', duration = 2500 }: Props = $props();

  const dotColors = {
    info: 'bg-indigo-300',
    success: 'bg-emerald-400',
    warning: 'bg-amber-400',
  };

  const dotColor = $derived(dotColors[type]);
</script>

<div class="bg-black/95 text-white py-3.5 px-5 rounded-2xl font-sans text-[13px] font-medium shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-[32px] backdrop-saturate-200 border border-white/10 flex items-center gap-2.5 animate-[slideUp_0.2s_ease-out]">
  <span class="w-2 h-2 rounded-full shrink-0 {dotColor}"></span>
  {message}
</div>

<style>
  @import "tailwindcss";

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
