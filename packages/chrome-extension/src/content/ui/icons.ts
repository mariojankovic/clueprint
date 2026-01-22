/**
 * Shared Lucide icons for Shadow DOM UI
 * These are the same icons from lucide-svelte, exported as SVG strings
 * for use in vanilla DOM manipulation (Shadow DOM content scripts)
 */

type IconProps = {
  size?: number;
  strokeWidth?: number;
  class?: string;
};

const DEFAULT_SIZE = 16;
const DEFAULT_STROKE = 2;

function createIcon(paths: string, props: IconProps = {}): string {
  const size = props.size ?? DEFAULT_SIZE;
  const strokeWidth = props.strokeWidth ?? DEFAULT_STROKE;
  const className = props.class ? ` class="${props.class}"` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${className}>${paths}</svg>`;
}

// Icon path definitions (from Lucide)
const PATHS = {
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  sparkles: '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>',
  circle: '<circle cx="12" cy="12" r="10"/>',
  square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
} as const;

// Exported icon functions
export const Wrench = (props?: IconProps) => createIcon(PATHS.wrench, props);
export const Sparkles = (props?: IconProps) => createIcon(PATHS.sparkles, props);
export const Check = (props?: IconProps) => createIcon(PATHS.check, props);
export const X = (props?: IconProps) => createIcon(PATHS.x, props);
export const Target = (props?: IconProps) => createIcon(PATHS.target, props);
export const Scan = (props?: IconProps) => createIcon(PATHS.scan, props);
export const Circle = (props?: IconProps) => createIcon(PATHS.circle, props);
export const Square = (props?: IconProps) => createIcon(PATHS.square, props);

// Default export for convenience
export default {
  Wrench,
  Sparkles,
  Check,
  X,
  Target,
  Scan,
  Circle,
  Square,
};
