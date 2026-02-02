<script lang="ts">
  import { MousePointerClick, SquareDashedMousePointer, Circle, Square, X, GripVertical, History, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Check } from 'lucide-svelte';
  import { onMount, onDestroy } from 'svelte';

  interface Props {
    isRecording: boolean;
    isBuffering: boolean;
    isSelectActive: boolean;
    isCollapsed: boolean;
    collapsedEdge: 'left' | 'right' | 'top' | 'bottom' | null;
    isDragging?: boolean;
    skipAnimation?: boolean;
    skipSelectAnimation?: boolean;
    externalToast?: string;
    recordingStartTime?: number;
    onSelect: () => void;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onSendBuffer: () => void;
    onExpand: () => void;
    onClose: () => void;
  }

  let { isRecording, isBuffering, isSelectActive, isCollapsed, collapsedEdge, isDragging = false, skipAnimation = false, skipSelectAnimation = false, externalToast = '', recordingStartTime, onSelect, onStartRecording, onStopRecording, onSendBuffer, onExpand, onClose }: Props = $props();

  // Determine if collapsed to horizontal or vertical edge
  const isHorizontalEdge = $derived(collapsedEdge === 'left' || collapsedEdge === 'right');
  const isVerticalEdge = $derived(collapsedEdge === 'top' || collapsedEdge === 'bottom');

  // Hover state for collapsed pill slide-out
  let isHovered = $state(false);
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleMouseEnter() {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      isHovered = true;
    }, 150); // Small delay to prevent accidental triggers
  }

  function handleMouseLeave() {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      isHovered = false;
    }, 150);
  }

  // Clear hover state when dragging starts
  $effect(() => {
    if (isDragging) {
      isHovered = false;
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
    }
  });

  let showDropdown = $state(false);
  let toastMessage = $state('');
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;
  let elapsedTime = $state('0:00');
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  function updateTimer() {
    if (!recordingStartTime) {
      elapsedTime = '0:00';
      return;
    }
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    elapsedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  $effect(() => {
    if (isRecording && recordingStartTime) {
      updateTimer();
      timerInterval = setInterval(updateTimer, 1000);
    } else if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  });

  onDestroy(() => {
    if (timerInterval) clearInterval(timerInterval);
  });

  function handleRecordClick() {
    if (isRecording) {
      onStopRecording();
    } else {
      showDropdown = !showDropdown;
    }
  }

  function showInternalToast(message: string) {
    toastMessage = message;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toastMessage = ''; }, 2000);
  }

  function selectItem(action: () => void) {
    showDropdown = false;
    action();
  }

  // Computed: which toast to show (external takes priority)
  const activeToast = $derived(externalToast || toastMessage);

  function handleSendBuffer() {
    showDropdown = false;
    onSendBuffer();
    showInternalToast('Sent to AI');
  }

  // Close dropdown on escape key
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && showDropdown) {
      showDropdown = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }

  // Add/remove escape listener when dropdown opens/closes
  $effect(() => {
    if (showDropdown) {
      document.addEventListener('keydown', handleKeyDown, true);
    } else {
      document.removeEventListener('keydown', handleKeyDown, true);
    }
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeyDown, true);
  });
</script>

<div class="relative">
  {#if isCollapsed}
  <!-- Collapsed mode: expandable edge pill -->
  <div
    data-widget-pill
    class="collapsed-pill {isDragging || skipAnimation ? '' : 'pill-enter'} flex items-center bg-black/80 border border-solid border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.3)] backdrop-blur-xl cursor-pointer
      {collapsedEdge === 'left' ? 'flex-row rounded-r-xl rounded-l-none' : ''}
      {collapsedEdge === 'right' ? 'flex-row-reverse rounded-l-xl rounded-r-none' : ''}
      {collapsedEdge === 'top' ? 'flex-col rounded-b-xl rounded-t-none' : ''}
      {collapsedEdge === 'bottom' ? 'flex-col-reverse rounded-t-xl rounded-b-none' : ''}
      {isRecording ? '!bg-red-500 !border-red-400/50' : ''}"
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
    role="toolbar"
    tabindex="0"
  >
    <!-- Chevron indicator (shows checkmark on success) -->
    <button
      class="flex items-center justify-center p-0 bg-transparent border-none cursor-pointer
        {isHorizontalEdge ? 'w-6 h-10' : 'w-10 h-6'}"
      onclick={onExpand}
      title="Expand Clueprint"
    >
      {#if externalToast}
        <Check size={14} color="#34d399" strokeWidth={3} />
      {:else if isRecording}
        <Circle size={10} fill="white" class="animate-pulse" />
      {:else if collapsedEdge === 'left'}
        <ChevronRight size={14} color="white" />
      {:else if collapsedEdge === 'right'}
        <ChevronLeft size={14} color="white" />
      {:else if collapsedEdge === 'top'}
        <ChevronDown size={14} color="white" />
      {:else}
        <ChevronUp size={14} color="white" />
      {/if}
    </button>

    <!-- Action buttons (slide out on hover, but not during drag) -->
    <div
      data-action-buttons
      class="flex items-center overflow-hidden transition-all duration-200 ease-out
        {isHorizontalEdge ? 'flex-row' : 'flex-col'}
        {isHovered && !isRecording && !isDragging ? (isHorizontalEdge ? 'max-w-24 pl-1 opacity-100' : 'max-h-24 pt-1 opacity-100') : (isHorizontalEdge ? 'max-w-0 opacity-0' : 'max-h-0 opacity-0')}"
    >
      <button
        title="Select element"
        class="flex items-center justify-center w-7 h-7 p-0 bg-transparent border-none rounded-lg cursor-pointer transition-all duration-200 hover:bg-white/10 text-white/60 hover:text-white/90"
        onclick={onSelect}
      >
        <MousePointerClick size={14} strokeWidth={1.5} />
      </button>
      <button
        title="Record"
        class="flex items-center justify-center w-7 h-7 p-0 bg-transparent border-none rounded-lg cursor-pointer transition-all duration-200 hover:bg-white/10"
        onclick={onStartRecording}
      >
        <Circle size={12} fill="#f87171" />
      </button>
    </div>
  </div>
  {:else if isRecording}
  <!-- Recording mode: compact bar matching other states -->
  <div
    data-widget-pill
    class="{isDragging || skipAnimation ? '' : 'pill-enter'} flex items-center gap-2 min-h-[44px] py-1.5 px-3 bg-black/80 border border-solid border-white/10 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[24px] backdrop-saturate-[180%] font-sans select-none"
  >
    <!-- Recording indicator dot + timer -->
    <div class="flex items-center gap-2">
      <Circle size={10} fill="#f87171" class="animate-pulse shrink-0" />
      <span class="text-[11px] font-medium text-white/70 tabular-nums">{elapsedTime}</span>
    </div>

    <div class="w-px h-4 bg-white/[0.08]"></div>

    <!-- Stop button -->
    <button
      title="Stop Recording"
      class="flex items-center justify-center w-7 h-7 p-0 bg-transparent border-none rounded-lg cursor-pointer transition-all duration-200 hover:bg-white/[0.08] active:scale-95"
      onclick={onStopRecording}
    >
      <Square size={10} fill="#f87171" class="text-red-400" />
    </button>
  </div>
  {:else if activeToast}
  <!-- Toast state: morphs to show message -->
  <div
    data-widget-pill
    class="pill-enter flex items-center gap-2 min-h-[44px] py-1.5 px-3 bg-black/80 border border-solid border-white/10 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[24px] backdrop-saturate-[180%] font-sans select-none"
  >
    <svg class="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span class="text-[11px] font-medium whitespace-nowrap text-shine">{activeToast}</span>
  </div>
  {:else if isSelectActive}
  <div
    data-widget-pill
    class="{isDragging || skipAnimation || skipSelectAnimation ? '' : 'pill-enter'} flex items-center gap-2 min-h-[44px] py-1.5 px-3 bg-black/80 border border-solid border-white/10 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[24px] backdrop-saturate-[180%] font-sans select-none"
  >
    <div class="flex items-center gap-2 text-white/50">
      <SquareDashedMousePointer size={14} strokeWidth={1.5} class="shrink-0" />
      <span class="text-[11px] whitespace-nowrap text-shine">Click element or drag region</span>
    </div>
  </div>
  {:else}
  <div
    data-widget-pill
    class="{isDragging || skipAnimation ? '' : 'pill-enter'} flex items-center gap-0.5 py-1.5 px-2 bg-black/80 border border-solid border-white/10 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[24px] backdrop-saturate-[180%] font-sans select-none"
  >
    <div
      data-drag-handle
      class="flex items-center justify-center w-4 h-8 mr-1 cursor-grab text-white/20 transition-colors duration-200 hover:text-white/40 active:cursor-grabbing active:text-white/50"
    >
      <GripVertical size={12} />
    </div>

    <button
      title="Select (click = element, drag = region)"
      class="relative flex items-center justify-center w-8 h-8 p-0 bg-transparent border-none rounded-[10px] cursor-pointer transition-all duration-200 hover:bg-white/[0.08] hover:text-white/90 active:scale-95 text-white/50"
      onclick={onSelect}
    >
      <MousePointerClick size={16} strokeWidth={1.5} />
    </button>

    <div class="w-px h-4 bg-white/[0.08] mx-1.5"></div>

    <div class="relative">
      <button
        title="Record"
        class="relative flex items-center justify-center w-8 h-8 p-0 bg-transparent border-none rounded-[10px] cursor-pointer transition-all duration-200 hover:bg-white/[0.08] active:scale-95"
        onclick={handleRecordClick}
      >
        <Circle size={14} fill="#f87171" />
      </button>

      {#if showDropdown}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="fixed inset-0"
          style="z-index: 2147483640; pointer-events: auto;"
          role="presentation"
          onclick={() => showDropdown = false}
          onmousedown={() => showDropdown = false}
        ></div>
        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 min-w-[180px] py-1 bg-black/[0.92] border border-white/10 rounded-[10px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-[24px] dropdown-fade-in" style="z-index: 2147483641;">
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
  {/if}
</div>

<style>
  @import "tailwindcss";

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

  :global(.widget-exit) {
    animation: widget-exit 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes pill-enter {
    from {
      opacity: 0;
      transform: scale(0.82);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .pill-enter {
    animation: pill-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .dropdown-fade-in {
    animation: dropdown-fade-in 0.15s ease-out forwards;
  }


  @keyframes shine {
    0% {
      background-position: 100% center;
    }
    20% {
      background-position: 100% center;
    }
    70% {
      background-position: -100% center;
    }
    100% {
      background-position: -100% center;
    }
  }

  .text-shine {
    background: linear-gradient(
      to right,
      rgba(255, 255, 255, 0.4) 0%,
      rgba(255, 255, 255, 1) 20%,
      rgba(255, 255, 255, 1) 30%,
      rgba(255, 255, 255, 0.4) 50%
    );
    background-size: 200% auto;
    color: transparent !important;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent !important;
    animation: shine 2.5s ease-in-out infinite;
  }

  .toast-fade-in {
    animation: toast-lifecycle 2s ease-out forwards;
  }

  .collapsed-container {
    position: relative;
  }

  @keyframes slide-out {
    from {
      opacity: 0;
      transform: translateX(-50%) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
  }

  @keyframes slide-out-horizontal {
    from {
      opacity: 0;
      transform: translateY(-50%) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translateY(-50%) scale(1);
    }
  }

  .slide-out-panel {
    animation: slide-out 0.15s ease-out forwards;
  }

  .slide-out-panel[class*="left-"],
  .slide-out-panel[class*="right-"] {
    animation: slide-out-horizontal 0.15s ease-out forwards;
  }
</style>
