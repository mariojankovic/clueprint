<script lang="ts">
  import { onMount } from 'svelte';

  // State
  let mcpConnected = $state(false);
  let networkEntries = $state<Array<{
    url: string;
    method: string;
    status: number;
    statusText: string;
    duration: number;
    timestamp: number;
  }>>([]);
  let consoleEntries = $state<Array<{
    type: string;
    message: string;
    timestamp: number;
  }>>([]);

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function truncateUrl(url: string, maxLength = 60): string {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname + parsed.search;
      if (path.length > maxLength) {
        return '...' + path.slice(-maxLength);
      }
      return path;
    } catch {
      if (url.length > maxLength) {
        return '...' + url.slice(-maxLength);
      }
      return url;
    }
  }

  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function updateMcpStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      mcpConnected = response?.mcpConnected ?? false;
    } catch {
      mcpConnected = false;
    }
  }

  function sendNetworkEntry(entry: typeof networkEntries[0]) {
    chrome.runtime.sendMessage({
      type: 'NETWORK_EVENT',
      payload: entry,
    }).catch(() => {});
  }

  function clearLogs() {
    networkEntries = [];
    consoleEntries = [];
  }

  onMount(() => {
    // Monitor network requests via DevTools API
    chrome.devtools.network.onRequestFinished.addListener((request) => {
      const entry = {
        url: request.request.url,
        method: request.request.method,
        status: request.response.status,
        statusText: request.response.statusText,
        duration: Math.round(request.time * 1000),
        timestamp: Date.now(),
      };

      if (entry.status >= 400) {
        networkEntries = [...networkEntries, entry];
        sendNetworkEntry(entry);
      }
    });

    // Listen for messages
    const listener = (message: any) => {
      if (message.type === 'CONSOLE_EVENT') {
        consoleEntries = [...consoleEntries, {
          type: message.payload.type,
          message: message.payload.message,
          timestamp: message.payload.timestamp,
        }];
      }
      if (message.type === 'STATUS_UPDATE') {
        mcpConnected = message.mcpConnected ?? false;
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    // Initial status
    updateMcpStatus();

    // Periodic status check
    const interval = setInterval(updateMcpStatus, 5000);

    // Clear logs on page navigation
    chrome.devtools.network.onNavigated.addListener(() => {
      networkEntries = [];
      consoleEntries = [];
    });

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      clearInterval(interval);
    };
  });

  const displayedNetwork = $derived(networkEntries.slice(-20).reverse());
  const displayedConsole = $derived(consoleEntries.slice(-20).reverse());
</script>

<div class="min-h-screen bg-black text-white font-['Inter',sans-serif] text-xs p-4">
  <!-- Header -->
  <header class="flex justify-between items-center mb-4">
    <h1 class="text-lg font-normal text-white/90" style="font-family: 'Stack Sans Notch', sans-serif;">clueprint</h1>
    <div class="flex items-center gap-2">
      <div
        class="flex items-center gap-1.5 py-1.5 px-3 rounded-full text-[11px] border {mcpConnected ? 'border-green-500/20 bg-green-500/10 text-green-400' : 'border-red-500/20 bg-red-500/10 text-red-400'}"
      >
        <span class="w-1.5 h-1.5 rounded-full {mcpConnected ? 'bg-green-400' : 'bg-red-400'}"></span>
        <span>MCP {mcpConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
      <button
        class="py-1.5 px-3 border border-white/10 rounded-lg bg-white/5 text-white/70 cursor-pointer text-[11px] transition-all duration-200 hover:bg-white/10 hover:text-white/90"
        onclick={clearLogs}
      >
        Clear
      </button>
    </div>
  </header>

  <div class="flex flex-col gap-4">
    <!-- Network Section -->
    <section class="bg-white/3 border border-white/8 rounded-2xl p-4 backdrop-blur-sm shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
      <h2 class="text-[11px] uppercase tracking-wider text-white/40 mb-3 font-medium">
        Network Failures
      </h2>
      {#if displayedNetwork.length === 0}
        <div class="py-8 text-center text-white/25 text-[11px]">No failed requests yet</div>
      {:else}
        <div class="flex flex-col gap-1.5">
          {#each displayedNetwork as entry}
            <div
              class="flex items-center gap-2 py-2 px-3 rounded-xl text-[11px] bg-white/3 border border-white/6 transition-colors duration-150 hover:bg-white/6"
            >
              <span class="font-medium text-white/60 min-w-10">{entry.method}</span>
              <span
                class="py-0.5 px-2 rounded-full text-[10px] font-medium {entry.status >= 500 ? 'bg-red-500/15 text-red-400' : 'bg-orange-500/15 text-orange-400'}"
              >
                {entry.status}
              </span>
              <span class="flex-1 text-white/50 overflow-hidden text-ellipsis whitespace-nowrap font-mono" title={entry.url}>
                {truncateUrl(entry.url)}
              </span>
              <span class="text-white/25 text-[10px]">{entry.duration}ms</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Console Section -->
    <section class="bg-white/3 border border-white/8 rounded-2xl p-4 backdrop-blur-sm shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
      <h2 class="text-[11px] uppercase tracking-wider text-white/40 mb-3 font-medium">
        Console Errors
      </h2>
      {#if displayedConsole.length === 0}
        <div class="py-8 text-center text-white/25 text-[11px]">No errors yet</div>
      {:else}
        <div class="flex flex-col gap-1.5">
          {#each displayedConsole as entry}
            <div
              class="py-2 px-3 rounded-xl font-mono text-[11px] leading-relaxed wrap-break-word border-l-2 bg-white/3 border border-white/6 {entry.type === 'error' ? 'border-l-red-400' : entry.type === 'warn' ? 'border-l-orange-400' : 'border-l-white/20'}"
            >
              <span class="text-white/25 mr-2">{formatTime(entry.timestamp)}</span>
              <span class="font-medium mr-2 {entry.type === 'error' ? 'text-red-400' : entry.type === 'warn' ? 'text-orange-400' : 'text-white/50'}">{entry.type.toUpperCase()}</span>
              <span class="text-white/60">{@html escapeHtml(entry.message.slice(0, 200))}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>
