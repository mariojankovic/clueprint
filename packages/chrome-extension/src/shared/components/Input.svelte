<script lang="ts">
  interface Props {
    value?: string;
    placeholder?: string;
    onkeydown?: (e: KeyboardEvent) => void;
  }

  let { value = $bindable(''), placeholder = '', onkeydown }: Props = $props();
</script>

<input
  bind:value
  type="text"
  class="w-full py-2.5 px-2.5 border border-white/10 rounded-lg text-[11px] text-white/80 bg-white/[0.04] outline-none font-sans transition-all duration-150 focus:border-white/20 focus:bg-white/[0.06] placeholder:text-white/30 box-border"
  {placeholder}
  {onkeydown}
/>

<style>
  @import "tailwindcss";
</style>
