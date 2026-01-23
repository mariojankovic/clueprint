<script lang="ts">
  import { MousePointerClick, SquareDashedMousePointer, Circle, X, GripVertical } from 'lucide-svelte';

  interface Props {
    isRecording: boolean;
    isInspectActive: boolean;
    isRegionActive: boolean;
    onInspect: () => void;
    onRegion: () => void;
    onRecord: () => void;
    onClose: () => void;
  }

  let { isRecording, isInspectActive, isRegionActive, onInspect, onRegion, onRecord, onClose }: Props = $props();
</script>

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

  <button
    title="Record Flow"
    class="relative flex items-center justify-center w-8 h-8 p-0 bg-transparent border-none rounded-[10px] cursor-pointer transition-all duration-200 hover:bg-white/[0.08] active:scale-95 {isRecording ? 'bg-red-400/15 hover:bg-red-400/20' : ''}"
    onclick={onRecord}
  >
    <Circle size={14} fill="#f87171" class={isRecording ? 'animate-pulse' : ''} />
  </button>

  <div class="w-px h-4 bg-white/[0.08] mx-1.5"></div>

  <button
    title="Close"
    class="relative flex items-center justify-center w-8 h-8 p-0 bg-transparent border-none rounded-[10px] text-white/30 cursor-pointer transition-all duration-200 hover:bg-white/[0.08] hover:text-white/70 active:scale-95"
    onclick={onClose}
  >
    <X size={14} strokeWidth={2} />
  </button>
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

  .widget-enter {
    animation: widget-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  :global(.widget-exit) {
    animation: widget-exit 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
</style>
