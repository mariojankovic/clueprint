/**
 * Popup Script
 * Quick actions and status display
 */

// DOM elements
const statusDot = document.getElementById('statusDot')!;
const statusText = document.getElementById('statusText')!;
const mcpDot = document.getElementById('mcpDot')!;
const mcpText = document.getElementById('mcpText')!;
const btnInspect = document.getElementById('btnInspect')!;
const btnStartRecording = document.getElementById('btnStartRecording')!;
const btnStopRecording = document.getElementById('btnStopRecording')!;
const btnDiagnostics = document.getElementById('btnDiagnostics')!;

// State
let isRecording = false;

/**
 * Update UI based on status
 */
function updateStatus(status: {
  isActive: boolean;
  isRecording: boolean;
  hasSelection: boolean;
  mcpConnected: boolean;
}) {
  // Content script status
  if (status.isActive) {
    statusDot.classList.add('active');
    statusText.textContent = 'Active';
  } else {
    statusDot.classList.remove('active');
    statusText.textContent = 'Inactive';
  }

  // MCP connection status
  if (status.mcpConnected) {
    mcpDot.classList.add('active');
    mcpText.textContent = 'MCP: Connected';
  } else {
    mcpDot.classList.remove('active');
    mcpText.textContent = 'MCP: Disconnected';
  }

  // Recording status
  isRecording = status.isRecording;
  updateRecordingUI();
}

/**
 * Update recording buttons visibility
 */
function updateRecordingUI() {
  if (isRecording) {
    btnStartRecording.classList.add('hidden');
    btnStopRecording.classList.remove('hidden');
    statusDot.classList.add('recording');
    statusText.textContent = 'Recording...';
  } else {
    btnStartRecording.classList.remove('hidden');
    btnStopRecording.classList.add('hidden');
    statusDot.classList.remove('recording');
  }
}

/**
 * Get current status from background
 */
async function fetchStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (response) {
      updateStatus(response);
    }
  } catch (error) {
    console.warn('Failed to get status:', error);
  }
}

/**
 * Send message to active tab's content script
 */
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

// Button handlers
btnInspect.addEventListener('click', async () => {
  await sendToActiveTab({ type: 'ACTIVATE_INSPECT' });
  window.close();
});

btnStartRecording.addEventListener('click', async () => {
  try {
    await chrome.runtime.sendMessage({ type: 'START_RECORDING' });
    isRecording = true;
    updateRecordingUI();
  } catch (error) {
    console.error('Failed to start recording:', error);
  }
});

btnStopRecording.addEventListener('click', async () => {
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    isRecording = false;
    updateRecordingUI();
  } catch (error) {
    console.error('Failed to stop recording:', error);
  }
});

btnDiagnostics.addEventListener('click', async () => {
  await sendToActiveTab({ type: 'GET_DIAGNOSTICS' });
  window.close();
});

// Listen for status updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATUS_UPDATE') {
    updateStatus(message);
  }
});

// Initial status fetch
fetchStatus();
