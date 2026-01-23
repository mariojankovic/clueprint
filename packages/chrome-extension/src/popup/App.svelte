<script lang="ts">
  import { onMount } from 'svelte';
  import { MousePointerClick, SquareDashedMousePointer, Activity, Clapperboard, Layers, Eye, EyeOff, Circle } from 'lucide-svelte';

  // State
  let isActive = $state(false);
  let isRecording = $state(false);
  let isBuffering = $state(false);
  let mcpConnected = $state(false);
  let widgetVisible = $state(true);
  let isMac = $state(true);

  // Fetch status from background
  async function fetchStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      if (response) {
        isActive = response.isActive;
        isRecording = response.isRecording;
        isBuffering = response.isBuffering;
        mcpConnected = response.mcpConnected;
      }
    } catch (error) {
      console.warn('Failed to get status:', error);
    }
  }

  // Send message to active tab
  async function sendToActiveTab(message: object) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, message);
        return response;
      }
    } catch (error) {
      console.warn('Failed to send message to tab:', error);
    }
  }

  // Toggle floating widget
  async function toggleWidget() {
    const response = await sendToActiveTab({ type: 'TOGGLE_WIDGET' });
    if (response) {
      widgetVisible = response.visible;
    } else {
      widgetVisible = !widgetVisible;
    }
  }

  // Toggle background capture
  async function toggleBuffer() {
    const response = await chrome.runtime.sendMessage({ type: 'TOGGLE_BUFFER' });
    if (response) {
      isBuffering = response.isBuffering;
    }
  }

  // Modifier key display
  function mod() {
    return isMac ? '⌘' : 'Ctrl+';
  }

  // Fetch widget visibility from content script
  async function fetchWidgetState() {
    const response = await sendToActiveTab({ type: 'GET_WIDGET_STATE' });
    if (response && typeof response.visible === 'boolean') {
      widgetVisible = response.visible;
    }
  }

  // Listen for status updates
  onMount(() => {
    isMac = navigator.platform.startsWith('Mac');
    fetchStatus();
    fetchWidgetState();

    const listener = (message: any) => {
      if (message.type === 'STATUS_UPDATE') {
        isActive = message.isActive;
        isRecording = message.isRecording;
        isBuffering = message.isBuffering;
        mcpConnected = message.mcpConnected;
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  });
</script>

<div class="w-[320px] flex flex-col px-5 pt-6 pb-5 bg-black text-white font-sans text-[13px]">
  <!-- Header -->
  <header class="text-center mb-5">
    <h1 class="text-[28px] font-normal tracking-tight text-white mb-1" style="font-family: 'Stack Sans Notch', sans-serif;">clueprint</h1>
    <p class="text-xs font-normal text-white/40 tracking-wide">From clueless to flawless</p>
  </header>

  <!-- Status -->
  <div class="flex justify-center gap-5 py-3 mb-5 bg-white/[0.03] border border-white/[0.06] rounded-xl backdrop-blur-[20px]">
    <div class="flex items-center gap-2 text-xs text-white/50">
      <span
        class="w-1.5 h-1.5 rounded-full transition-all duration-300 {isRecording ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)] animate-pulse' : isActive ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-white/20'}"
      ></span>
      <span>{isRecording ? 'Recording' : isActive ? 'Active' : 'Ready'}</span>
    </div>
    <div class="flex items-center gap-2 text-xs text-white/50">
      <span
        class="w-1.5 h-1.5 rounded-full transition-all duration-300 {mcpConnected ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-white/20'}"
      ></span>
      <span>MCP {mcpConnected ? 'connected' : 'waiting'}</span>
    </div>
  </div>

  <!-- Capabilities -->
  <div class="mb-4">
    <h2 class="text-[11px] font-medium text-white/30 uppercase tracking-wider mb-3">Ask your AI about</h2>
    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/[0.03] transition-colors">
        <div class="flex items-center gap-2.5">
          <span class="flex items-center justify-center w-5 text-white/40">
            <MousePointerClick size={14} strokeWidth={1.5} />
          </span>
          <span class="text-white/70">Any element</span>
        </div>
        <kbd class="py-0.5 px-1.5 bg-white/[0.06] border border-white/10 rounded text-[10px] text-white/40 font-sans">{mod()}⇧S</kbd>
      </div>

      <div class="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/[0.03] transition-colors">
        <div class="flex items-center gap-2.5">
          <span class="flex items-center justify-center w-5 text-white/40">
            <SquareDashedMousePointer size={14} strokeWidth={1.5} />
          </span>
          <span class="text-white/70">A screen region</span>
        </div>
        <kbd class="py-0.5 px-1.5 bg-white/[0.06] border border-white/10 rounded text-[10px] text-white/40 font-sans">{mod()}⇧X</kbd>
      </div>

      <div class="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/[0.03] transition-colors">
        <div class="flex items-center gap-2.5">
          <span class="flex items-center justify-center w-5 text-white/40">
            <Activity size={14} strokeWidth={1.5} />
          </span>
          <span class="text-white/70">Page health & diagnostics</span>
        </div>
      </div>

      <div class="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/[0.03] transition-colors">
        <div class="flex items-center gap-2.5">
          <span class="flex items-center justify-center w-5 text-white/40">
            <Clapperboard size={14} strokeWidth={1.5} />
          </span>
          <span class="text-white/70">A recorded user flow</span>
        </div>
      </div>

      <div class="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/[0.03] transition-colors">
        <div class="flex items-center gap-2.5">
          <span class="flex items-center justify-center w-5 text-white/40">
            <Layers size={14} strokeWidth={1.5} />
          </span>
          <span class="text-white/70">DOM changes over time</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Toggles -->
  <div class="pt-3 border-t border-white/[0.06]">
    <button
      class="flex items-center justify-between w-full py-2.5 px-3 rounded-lg bg-transparent border-none text-white cursor-pointer transition-colors hover:bg-white/[0.05]"
      onclick={toggleWidget}
    >
      <div class="flex items-center gap-2.5">
        <span class="flex items-center justify-center w-5 text-white/40">
          {#if widgetVisible}
            <EyeOff size={14} strokeWidth={1.5} />
          {:else}
            <Eye size={14} strokeWidth={1.5} />
          {/if}
        </span>
        <span class="text-[13px] text-white/70">{widgetVisible ? 'Hide' : 'Show'} floating toolbar</span>
      </div>
    </button>
    <button
      class="flex items-center justify-between w-full py-2.5 px-3 rounded-lg bg-transparent border-none text-white cursor-pointer transition-colors hover:bg-white/[0.05]"
      onclick={toggleBuffer}
    >
      <div class="flex items-center gap-2.5">
        <span class="flex items-center justify-center w-5 text-white/40">
          <Circle size={12} fill={isBuffering ? '#4ade80' : 'none'} strokeWidth={1.5} />
        </span>
        <span class="text-[13px] text-white/70">{isBuffering ? 'Disable' : 'Enable'} background capture</span>
      </div>
    </button>
  </div>

  <!-- Footer -->
  <footer class="text-center pt-3 mt-3 border-t border-white/[0.06]">
    <p class="text-[11px] text-white/25 italic">Select something, then tell your AI about it</p>
  </footer>
</div>

