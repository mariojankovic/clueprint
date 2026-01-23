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

<div class="min-h-screen bg-[#1e1e1e] text-[#d4d4d4] font-mono text-xs">
  <!-- Header -->
  <header class="flex justify-between items-center py-2 px-3 bg-[#252526] border-b border-[#3c3c3c]">
    <h1 class="text-[13px] font-medium text-white">Clueprint</h1>
    <div class="flex items-center gap-2">
      <div
        class="flex items-center gap-1 py-1 px-2 rounded text-[11px] {mcpConnected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}"
      >
        <span>MCP: {mcpConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
      <button
        class="py-1.5 px-3 border-none rounded bg-[#0e639c] text-white cursor-pointer text-[11px] hover:bg-[#1177bb]"
        onclick={clearLogs}
      >
        Clear
      </button>
    </div>
  </header>

  <div class="p-3">
    <!-- Network Section -->
    <section class="mb-4">
      <h2 class="text-[11px] uppercase tracking-wider text-[#888] mb-2 pb-1 border-b border-[#3c3c3c]">
        Network Requests (Failures Only)
      </h2>
      {#if displayedNetwork.length === 0}
        <div class="py-6 text-center text-[#666]">No failed requests yet</div>
      {:else}
        <div class="flex flex-col gap-1">
          {#each displayedNetwork as entry}
            <div
              class="flex items-center gap-2 py-1.5 px-2 rounded text-[11px] {entry.status >= 400 ? 'bg-red-500/10' : 'bg-[#252526]'}"
            >
              <span class="font-semibold text-[#569cd6] min-w-[40px]">{entry.method}</span>
              <span
                class="py-0.5 px-1.5 rounded text-[10px] font-semibold {entry.status >= 400 ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}"
              >
                {entry.status}
              </span>
              <span class="flex-1 text-[#9cdcfe] overflow-hidden text-ellipsis whitespace-nowrap" title={entry.url}>
                {truncateUrl(entry.url)}
              </span>
              <span class="text-[#888] text-[10px]">{entry.duration}ms</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Console Section -->
    <section>
      <h2 class="text-[11px] uppercase tracking-wider text-[#888] mb-2 pb-1 border-b border-[#3c3c3c]">
        Console Errors
      </h2>
      {#if displayedConsole.length === 0}
        <div class="py-6 text-center text-[#666]">No errors yet</div>
      {:else}
        <div class="flex flex-col gap-1">
          {#each displayedConsole as entry}
            <div
              class="py-1.5 px-2 rounded font-mono text-[11px] leading-relaxed break-words border-l-[3px] {entry.type === 'error' ? 'border-l-red-500 bg-red-500/10' : entry.type === 'warn' ? 'border-l-orange-500 bg-orange-500/10' : 'border-l-[#3c3c3c] bg-[#252526]'}"
            >
              <span class="text-[#888] mr-2">{formatTime(entry.timestamp)}</span>
              <span class="font-semibold mr-2">{entry.type.toUpperCase()}</span>
              <span>{@html escapeHtml(entry.message.slice(0, 200))}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>
