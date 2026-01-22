<script lang="ts">
  interface Props {
    message: string;
    duration?: number;
  }

  let { message, duration = 2500 }: Props = $props();
</script>

<div class="toast">
  {@html message}
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
    animation: fadeOut var(--duration, 2500ms) forwards;
    max-width: 360px;
    backdrop-filter: blur(32px) saturate(200%);
    -webkit-backdrop-filter: blur(32px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .toast :global(strong) {
    font-weight: 600;
    color: #a5b4fc;
  }

  @keyframes fadeOut {
    0% {
      opacity: 1;
      transform: translateY(0);
    }
    75% {
      opacity: 1;
      transform: translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateY(-8px);
    }
  }
</style>
