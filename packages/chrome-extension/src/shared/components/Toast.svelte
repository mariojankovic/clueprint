<script lang="ts">
  interface Props {
    message: string;
    type?: 'info' | 'success' | 'warning';
    duration?: number;
  }

  let { message, type = 'info', duration = 2500 }: Props = $props();

  const accentColors = {
    info: '#a5b4fc',
    success: '#34d399',
    warning: '#fbbf24',
  };

  const accentColor = $derived(accentColors[type]);
</script>

<div class="toast" style="--accent-color: {accentColor}">
  <span class="dot"></span>
  {message}
</div>

<style>
  .toast {
    background: rgba(0, 0, 0, 0.96);
    color: #ffffff;
    padding: 14px 20px;
    border-radius: 16px;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(32px) saturate(200%);
    -webkit-backdrop-filter: blur(32px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    gap: 10px;
    animation: slideUp 0.2s ease-out;
  }

  .dot {
    width: 8px;
    height: 8px;
    background: var(--accent-color, #a5b4fc);
    border-radius: 50%;
    flex-shrink: 0;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
