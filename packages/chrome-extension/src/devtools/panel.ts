/**
 * DevTools Panel Script
 * Provides detailed network monitoring with request/response bodies
 */

const networkLog = document.getElementById('networkLog')!;
const consoleLog = document.getElementById('consoleLog')!;
const mcpStatus = document.getElementById('mcpStatus')!;
const btnClear = document.getElementById('btnClear')!;

// Network entries storage
const networkEntries: Array<{
  url: string;
  method: string;
  status: number;
  statusText: string;
  duration: number;
  timestamp: number;
}> = [];

// Console entries storage
const consoleEntries: Array<{
  type: string;
  message: string;
  timestamp: number;
}> = [];

/**
 * Format timestamp
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Truncate URL for display
 */
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

/**
 * Render network log
 */
function renderNetworkLog() {
  if (networkEntries.length === 0) {
    networkLog.innerHTML = '<div class="empty-state">No failed requests yet</div>';
    return;
  }

  networkLog.innerHTML = networkEntries
    .slice(-20) // Show last 20 entries
    .reverse()
    .map(entry => `
      <div class="network-entry ${entry.status >= 400 ? 'error' : ''}">
        <span class="network-method">${entry.method}</span>
        <span class="network-status ${entry.status >= 400 ? 'error' : 'success'}">${entry.status}</span>
        <span class="network-url" title="${entry.url}">${truncateUrl(entry.url)}</span>
        <span class="network-duration">${entry.duration}ms</span>
      </div>
    `)
    .join('');
}

/**
 * Render console log
 */
function renderConsoleLog() {
  if (consoleEntries.length === 0) {
    consoleLog.innerHTML = '<div class="empty-state">No errors yet</div>';
    return;
  }

  consoleLog.innerHTML = consoleEntries
    .slice(-20)
    .reverse()
    .map(entry => {
      const className = entry.type === 'error' ? 'error' : entry.type === 'warn' ? 'warning' : '';
      return `
        <div class="log-entry ${className}">
          <span class="log-time">${formatTime(entry.timestamp)}</span>
          <span class="log-type">${entry.type.toUpperCase()}</span>
          <span class="log-message">${escapeHtml(entry.message.slice(0, 200))}</span>
        </div>
      `;
    })
    .join('');
}

/**
 * Escape HTML characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Update MCP status
 */
async function updateMcpStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (response?.mcpConnected) {
      mcpStatus.className = 'status-badge connected';
      mcpStatus.innerHTML = '<span>MCP: Connected</span>';
    } else {
      mcpStatus.className = 'status-badge disconnected';
      mcpStatus.innerHTML = '<span>MCP: Disconnected</span>';
    }
  } catch {
    mcpStatus.className = 'status-badge disconnected';
    mcpStatus.innerHTML = '<span>MCP: Unknown</span>';
  }
}

/**
 * Send network entry to background
 */
function sendNetworkEntry(entry: typeof networkEntries[0]) {
  chrome.runtime.sendMessage({
    type: 'NETWORK_EVENT',
    payload: {
      url: entry.url,
      method: entry.method,
      status: entry.status,
      statusText: entry.statusText,
      duration: entry.duration,
      timestamp: entry.timestamp,
    },
  }).catch(() => {
    // Background may not be ready
  });
}

/**
 * Monitor network requests via DevTools API
 */
function startNetworkMonitoring() {
  chrome.devtools.network.onRequestFinished.addListener((request) => {
    const entry = {
      url: request.request.url,
      method: request.request.method,
      status: request.response.status,
      statusText: request.response.statusText,
      duration: Math.round(request.time * 1000),
      timestamp: Date.now(),
    };

    // Only track failures
    if (entry.status >= 400) {
      networkEntries.push(entry);
      sendNetworkEntry(entry);
      renderNetworkLog();

      // Get response body for errors
      request.getContent((content, encoding) => {
        if (content && content.length < 1000) {
          // Could send response body to background if needed
        }
      });
    }
  });
}

/**
 * Monitor console via inspected window
 */
function startConsoleMonitoring() {
  // We can't directly intercept console from DevTools panel,
  // but we can evaluate code in the inspected window
  // The content script already handles this
}

/**
 * Clear all logs
 */
function clearLogs() {
  networkEntries.length = 0;
  consoleEntries.length = 0;
  renderNetworkLog();
  renderConsoleLog();
}

// Event listeners
btnClear.addEventListener('click', clearLogs);

// Listen for console events from content script (via background)
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CONSOLE_EVENT') {
    consoleEntries.push({
      type: message.payload.type,
      message: message.payload.message,
      timestamp: message.payload.timestamp,
    });
    renderConsoleLog();
  }

  if (message.type === 'STATUS_UPDATE') {
    if (message.mcpConnected) {
      mcpStatus.className = 'status-badge connected';
      mcpStatus.innerHTML = '<span>MCP: Connected</span>';
    } else {
      mcpStatus.className = 'status-badge disconnected';
      mcpStatus.innerHTML = '<span>MCP: Disconnected</span>';
    }
  }
});

// Initialize
startNetworkMonitoring();
startConsoleMonitoring();
updateMcpStatus();
renderNetworkLog();
renderConsoleLog();

// Periodic status check
setInterval(updateMcpStatus, 5000);
