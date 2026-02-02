// Offscreen document for clipboard operations without focus changes

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'COPY_TO_CLIPBOARD' && message.text) {
    copyToClipboard(message.text).then(success => {
      sendResponse({ success });
    });
    return true; // Keep channel open for async response
  }
});

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback to execCommand
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    textarea.remove();
    return success;
  }
}
