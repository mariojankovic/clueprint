<script lang="ts">
  import { MousePointerClick, SquareDashedMousePointer, Circle, X, GripVertical, History } from 'lucide-svelte';

  interface Props {
    isRecording: boolean;
    isBuffering: boolean;
    isInspectActive: boolean;
    isRegionActive: boolean;
    onInspect: () => void;
    onRegion: () => void;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onSendBuffer: () => void;
    onClose: () => void;
  }

  let { isRecording, isBuffering, isInspectActive, isRegionActive, onInspect, onRegion, onStartRecording, onStopRecording, onSendBuffer, onClose }: Props = $props();

  let showDropdown = $state(false);
  let toastMessage = $state('');
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleRecordClick() {
    if (isRecording) {
      onStopRecording();
    } else {
      showDropdown = !showDropdown;
    }
  }

  function showToast(message: string) {
    toastMessage = message;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toastMessage = ''; }, 2000);
  }

  function selectItem(action: () => void) {
    showDropdown = false;
    action();
  }

  function handleSendBuffer() {
    showDropdown = false;
    onSendBuffer();
    showToast('Sent to AI');
  }
</script>

<div class="relative">
<div
  class="widget-enter flex items-center gap-0.5 py-1.5 px-2 bg-black/80 border border-white/10 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[24px] backdrop-saturate-[180%] font-sans select-none"
>
  <div
    data-drag-handle
    class="flex items-center justify-center w-4 h-8 mr-1 cursor-grab text-white/20 transition-colors duration-200 hover:text-white/40 active:cursor-grabbing active:text-white/50"
  >
    <GripVertical size={12} />
  </div>

  <button
    title="Inspect Element"
    class="relative flex items-center justify-center w-8 h-8 p-0 bg-transparent border-none rounded-[10px] cursor-pointer transition-all duration-200 hover:bg-white/[0.08] hover:text-white/90 active:scale-95 {isInspectActive ? 'bg-white/[0.12] text-white' : 'text-white/50'}"
    onclick={onInspect}
  >
    <MousePointerClick size={16} strokeWidth={1.5} />
  </button>

  <button
    title="Select Region"
    class="relative flex items-center justify-center w-8 h-8 p-0 bg-transparent border-none rounded-[10px] cursor-pointer transition-all duration-200 hover:bg-white/[0.08] hover:text-white/90 active:scale-95 {isRegionActive ? 'bg-white/[0.12] text-white' : 'text-white/50'}"
    onclick={onRegion}
  >
    <SquareDashedMousePointer size={16} strokeWidth={1.5} />
  </button>

  <div class="w-px h-4 bg-white/[0.08] mx-1.5"></div>

  <div class="relative">
    <button
      title={isRecording ? 'Stop Recording' : 'Record'}
      class="relative flex items-center justify-center w-8 h-8 p-0 bg-transparent border-none rounded-[10px] cursor-pointer transition-all duration-200 hover:bg-white/[0.08] active:scale-95 {isRecording ? 'bg-red-400/15 hover:bg-red-400/20' : ''}"
      onclick={handleRecordClick}
    >
      <Circle
        size={14}
        fill="#f87171"
        class={isRecording ? 'animate-pulse' : ''}
      />
    </button>

    {#if showDropdown}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="fixed inset-0 z-10" role="presentation" onclick={() => showDropdown = false}></div>
      <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 min-w-[180px] py-1 bg-black/[0.92] border border-white/10 rounded-[10px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-[24px] z-20 dropdown-fade-in">
        <button
          class="flex items-center gap-2.5 w-full py-[7px] px-3 text-left text-white/85 text-xs bg-transparent border-none rounded-md cursor-pointer font-[inherit] whitespace-nowrap transition-colors duration-150 hover:bg-white/[0.08]"
          onclick={() => selectItem(onStartRecording)}
        >
          <Circle size={10} fill="#f87171" class="shrink-0" />
          Start Recording
        </button>
        <button
          class="flex items-center gap-2.5 w-full py-[7px] px-3 text-left text-xs bg-transparent border-none rounded-md font-[inherit] whitespace-nowrap transition-colors duration-150 {isBuffering ? 'text-white/85 cursor-pointer hover:bg-white/[0.08]' : 'text-white/30 cursor-not-allowed'}"
          disabled={!isBuffering}
          onclick={handleSendBuffer}
        >
          <History size={12} strokeWidth={1.5} class="shrink-0" />
          Send Last 30s
        </button>
      </div>
    {/if}
  </div>

  <div class="w-px h-4 bg-white/[0.08] mx-1.5"></div>

  <button
    title="Close"
    class="relative flex items-center justify-center w-8 h-8 p-0 bg-transparent border-none rounded-[10px] text-white/30 cursor-pointer transition-all duration-200 hover:bg-white/[0.08] hover:text-white/70 active:scale-95"
    onclick={onClose}
  >
    <X size={14} strokeWidth={2} />
  </button>
</div>

{#if toastMessage}
  <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-black/90 border border-white/10 rounded-lg text-[11px] text-white/80 whitespace-nowrap font-sans toast-fade-in">
    {toastMessage}
  </div>
{/if}
</div>

<style>
  @import "tailwindcss";

  @keyframes widget-enter {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes widget-exit {
    from {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    to {
      opacity: 0;
      transform: translateY(4px) scale(0.98);
    }
  }

  @keyframes dropdown-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes toast-lifecycle {
    0% { opacity: 0; }
    15% { opacity: 1; }
    85% { opacity: 1; }
    100% { opacity: 0; }
  }

  .widget-enter {
    animation: widget-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  :global(.widget-exit) {
    animation: widget-exit 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  .dropdown-fade-in {
    animation: dropdown-fade-in 0.15s ease-out forwards;
  }

  .toast-fade-in {
    animation: toast-lifecycle 2s ease-out forwards;
  }
</style>
