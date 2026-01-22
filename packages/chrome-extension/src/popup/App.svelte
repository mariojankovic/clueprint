<script lang="ts">
  import { onMount } from 'svelte';

  // State
  let isActive = $state(false);
  let isRecording = $state(false);
  let mcpConnected = $state(false);

  // Fetch status from background
  async function fetchStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      if (response) {
        isActive = response.isActive;
        isRecording = response.isRecording;
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
        await chrome.tabs.sendMessage(tab.id, message);
      }
    } catch (error) {
      console.warn('Failed to send message to tab:', error);
    }
  }

  // Handlers
  async function handleInspect() {
    await sendToActiveTab({ type: 'ACTIVATE_INSPECT' });
    window.close();
  }

  async function handleStartRecording() {
    try {
      await chrome.runtime.sendMessage({ type: 'START_RECORDING' });
      isRecording = true;
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }

  async function handleStopRecording() {
    try {
      await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
      isRecording = false;
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }

  async function handleDiagnostics() {
    await sendToActiveTab({ type: 'GET_DIAGNOSTICS' });
    window.close();
  }

  // Listen for status updates
  onMount(() => {
    fetchStatus();

    const listener = (message: any) => {
      if (message.type === 'STATUS_UPDATE') {
        isActive = message.isActive;
        isRecording = message.isRecording;
        mcpConnected = message.mcpConnected;
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  });
</script>

<div class="container">
  <!-- Header -->
  <header class="header">
    <h1 class="logo">clueprint</h1>
    <p class="tagline">browser visibility for AI</p>
  </header>

  <!-- Status -->
  <div class="status">
    <div class="status-item">
      <span class="dot" class:active={isActive} class:recording={isRecording}></span>
      <span>{isRecording ? 'Recording' : isActive ? 'Active' : 'Ready'}</span>
    </div>
    <div class="status-item">
      <span class="dot" class:active={mcpConnected}></span>
      <span>MCP {mcpConnected ? 'connected' : 'waiting'}</span>
    </div>
  </div>

  <!-- Actions -->
  <div class="actions">
    <button class="btn" onclick={handleInspect}>
      <div class="btn-left">
        <span class="btn-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 9l5 12 1.774-5.226L21 14 9 9z"/>
            <path d="M16.071 16.071l4.243 4.243"/>
            <path d="M7.188 2.239l.777 2.897M5.136 7.965l-2.897-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"/>
          </svg>
        </span>
        <span class="btn-label">Inspect Element</span>
      </div>
      <span class="btn-hint">⌥ Click</span>
    </button>

    {#if !isRecording}
      <button class="btn" onclick={handleStartRecording}>
        <div class="btn-left">
          <span class="btn-icon record">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="7"/>
            </svg>
          </span>
          <span class="btn-label">Start Recording</span>
        </div>
        <span class="btn-hint">Capture flow</span>
      </button>
    {:else}
      <button class="btn recording" onclick={handleStopRecording}>
        <div class="btn-left">
          <span class="btn-icon stop">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          </span>
          <span class="btn-label">Stop Recording</span>
        </div>
        <span class="btn-hint">Send to AI</span>
      </button>
    {/if}

    <button class="btn" onclick={handleDiagnostics}>
      <div class="btn-left">
        <span class="btn-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </span>
        <span class="btn-label">Page Diagnostics</span>
      </div>
      <span class="btn-hint">Health check</span>
    </button>
  </div>

  <!-- Shortcuts -->
  <div class="shortcuts">
    <div class="shortcut">
      <span>Inspect</span>
      <kbd>⌥ Click</kbd>
    </div>
    <div class="shortcut">
      <span>Region</span>
      <kbd>⌘⇧ Drag</kbd>
    </div>
  </div>

  <!-- Footer -->
  <footer class="footer">
    <p>Tell your AI: "check the element I selected"</p>
  </footer>
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px;
    background: #000;
    color: #fff;
  }

  .container {
    min-height: 420px;
    display: flex;
    flex-direction: column;
    padding: 24px 20px 20px;
  }

  /* Header */
  .header {
    text-align: center;
    margin-bottom: 24px;
  }

  .logo {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 28px;
    font-weight: 400;
    letter-spacing: -0.02em;
    color: #fff;
    margin-bottom: 4px;
  }

  .tagline {
    font-size: 12px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.4);
    letter-spacing: 0.02em;
  }

  /* Status */
  .status {
    display: flex;
    justify-content: center;
    gap: 20px;
    padding: 14px 0;
    margin-bottom: 20px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    transition: all 0.3s ease;
  }

  .dot.active {
    background: #4ade80;
    box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
  }

  .dot.recording {
    background: #f87171;
    box-shadow: 0 0 8px rgba(248, 113, 113, 0.5);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Actions */
  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
  }

  .btn {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 16px 18px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    color: #fff;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
    transform: translateY(-1px);
  }

  .btn:active {
    transform: translateY(0);
  }

  .btn.recording {
    background: rgba(248, 113, 113, 0.1);
    border-color: rgba(248, 113, 113, 0.2);
  }

  .btn.recording:hover {
    background: rgba(248, 113, 113, 0.15);
    border-color: rgba(248, 113, 113, 0.3);
  }

  .btn-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.5);
  }

  .btn-icon svg {
    color: inherit;
  }

  .btn-icon.record {
    color: rgba(248, 113, 113, 0.8);
  }

  .btn-icon.stop {
    color: #f87171;
  }

  .btn-label {
    font-weight: 500;
    font-size: 13px;
  }

  .btn-hint {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
  }

  /* Shortcuts */
  .shortcuts {
    display: flex;
    justify-content: center;
    gap: 24px;
    padding: 16px 0;
    margin-top: 16px;
  }

  .shortcut {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
  }

  kbd {
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    font-family: inherit;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
  }

  /* Footer */
  .footer {
    text-align: center;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    margin-top: auto;
  }

  .footer p {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.3);
    font-style: italic;
  }
</style>
