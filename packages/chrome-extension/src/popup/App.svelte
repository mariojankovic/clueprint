<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Target,
    Circle,
    Square,
    Activity,
    Zap,
    Command,
    Option,
    MousePointer2,
    Scan,
    PanelBottomOpen
  } from 'lucide-svelte';

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

  async function handleShowToolbar() {
    await sendToActiveTab({ type: 'SHOW_WIDGET' });
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
  <!-- Header with glassmorphism -->
  <header class="header">
    <div class="header-glow"></div>
    <div class="header-content">
      <div class="logo">
        <Zap size={24} strokeWidth={2.5} />
      </div>
      <h1>Clueprint</h1>
      <p>Give your AI deep browser visibility</p>
    </div>
  </header>

  <!-- Status Bar -->
  <div class="status-bar">
    <div class="status-item">
      <span class="status-dot" class:active={isActive} class:recording={isRecording}></span>
      <span>{isRecording ? 'Recording...' : isActive ? 'Active' : 'Inactive'}</span>
    </div>
    <div class="status-item">
      <span class="status-dot" class:active={mcpConnected}></span>
      <span>MCP: {mcpConnected ? 'Connected' : 'Disconnected'}</span>
    </div>
  </div>

  <!-- Actions -->
  <div class="actions">
    <div class="action-group">
      <h3>Element Selection</h3>
      <button class="btn primary" onclick={handleInspect}>
        <div class="btn-icon">
          <Target size={20} />
        </div>
        <div class="btn-content">
          <div class="btn-title">Inspect Element</div>
          <div class="btn-desc">Click any element to capture</div>
        </div>
      </button>
    </div>

    <div class="action-group">
      <h3>Recording</h3>
      {#if !isRecording}
        <button class="btn glass" onclick={handleStartRecording}>
          <div class="btn-icon recording-icon">
            <Circle size={20} />
          </div>
          <div class="btn-content">
            <div class="btn-title">Start Recording</div>
            <div class="btn-desc">Capture a flow of actions</div>
          </div>
        </button>
      {:else}
        <button class="btn danger" onclick={handleStopRecording}>
          <div class="btn-icon">
            <Square size={18} />
          </div>
          <div class="btn-content">
            <div class="btn-title">Stop Recording</div>
            <div class="btn-desc">End and send to AI</div>
          </div>
        </button>
      {/if}
    </div>

    <div class="action-group">
      <h3>Diagnostics</h3>
      <button class="btn glass" onclick={handleDiagnostics}>
        <div class="btn-icon">
          <Activity size={20} />
        </div>
        <div class="btn-content">
          <div class="btn-title">Page Health Check</div>
          <div class="btn-desc">Errors, performance, accessibility</div>
        </div>
      </button>
    </div>

    <div class="action-group">
      <h3>Quick Access</h3>
      <button class="btn glass" onclick={handleShowToolbar}>
        <div class="btn-icon">
          <PanelBottomOpen size={20} />
        </div>
        <div class="btn-content">
          <div class="btn-title">Show Floating Toolbar</div>
          <div class="btn-desc">Pin controls to the page</div>
        </div>
      </button>
    </div>
  </div>

  <!-- Shortcuts -->
  <div class="shortcuts">
    <h3>Keyboard Shortcuts</h3>
    <div class="shortcut">
      <span>Inspect element</span>
      <div class="shortcut-keys">
        <kbd><Option size={12} /></kbd>
        <span>+</span>
        <kbd><MousePointer2 size={12} /></kbd>
      </div>
    </div>
    <div class="shortcut">
      <span>Select region</span>
      <div class="shortcut-keys">
        <kbd><Command size={12} /></kbd>
        <kbd>Shift</kbd>
        <span>+</span>
        <kbd><Scan size={12} /></kbd>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <footer class="footer">
    Tell your AI: "I selected an element" or "Check this page"
  </footer>
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 14px;
    min-width: 300px;
    background: #000000;
    color: #ffffff;
    overflow: hidden;
  }

  .container {
    position: relative;
  }

  /* Header with gradient and glow */
  .header {
    position: relative;
    padding: 20px 16px;
    text-align: center;
    overflow: hidden;
  }

  .header-glow {
    position: absolute;
    top: -50%;
    left: 50%;
    transform: translateX(-50%);
    width: 200px;
    height: 200px;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.06) 0%, transparent 70%);
    pointer-events: none;
  }

  .header-content {
    position: relative;
    z-index: 1;
  }

  .logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    margin-bottom: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .logo :global(svg) {
    color: white;
  }

  .header h1 {
    font-size: 18px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 4px;
  }

  .header p {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  /* Status bar with glassmorphism */
  .status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    margin: 0 12px;
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(32px) saturate(200%);
    -webkit-backdrop-filter: blur(32px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    transition: all 0.3s ease;
  }

  .status-dot.active {
    background: #34d399;
    box-shadow: 0 0 10px rgba(52, 211, 153, 0.5);
  }

  .status-dot.recording {
    background: #f87171;
    box-shadow: 0 0 10px rgba(248, 113, 113, 0.5);
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.1); }
  }

  /* Actions */
  .actions {
    padding: 16px;
  }

  .action-group {
    margin-bottom: 16px;
  }

  .action-group h3 {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 8px;
    padding-left: 4px;
  }

  /* Glassmorphism buttons */
  .btn {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 14px 16px;
    margin-bottom: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(32px) saturate(200%);
    -webkit-backdrop-filter: blur(32px) saturate(200%);
    cursor: pointer;
    font-size: 13px;
    text-align: left;
    color: #ffffff;
    transition: all 0.2s ease;
  }

  .btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
    transform: translateY(-1px);
  }

  .btn:active {
    transform: translateY(0) scale(0.99);
  }

  .btn.primary {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  .btn.primary:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  }

  .btn.danger {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
    box-shadow: 0 8px 24px rgba(239, 68, 68, 0.2);
  }

  .btn.danger:hover {
    background: rgba(239, 68, 68, 0.25);
    border-color: rgba(239, 68, 68, 0.4);
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 10px;
  }

  .btn-icon :global(svg) {
    color: #ffffff;
  }

  .btn.primary .btn-icon {
    background: rgba(255, 255, 255, 0.08);
  }

  .recording-icon :global(svg) {
    color: #f87171;
  }

  .btn-content {
    flex: 1;
  }

  .btn-title {
    font-weight: 500;
    color: #ffffff;
  }

  .btn-desc {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.45);
    margin-top: 2px;
  }

  .btn.primary .btn-desc {
    color: rgba(255, 255, 255, 0.6);
  }

  /* Shortcuts */
  .shortcuts {
    padding: 14px 16px;
    margin: 0 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 14px;
  }

  .shortcuts h3 {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.35);
    margin-bottom: 10px;
  }

  .shortcut {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }

  .shortcut-keys {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .shortcut-keys span {
    color: rgba(255, 255, 255, 0.25);
    font-size: 10px;
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 22px;
    padding: 0 6px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    font-family: inherit;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.6);
  }

  kbd :global(svg) {
    color: rgba(255, 255, 255, 0.6);
  }

  /* Footer */
  .footer {
    padding: 16px;
    text-align: center;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
</style>
