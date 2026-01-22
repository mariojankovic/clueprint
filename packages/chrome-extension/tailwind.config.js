/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{svelte,ts,js,html}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'Cascadia Code', 'monospace'],
      },
      colors: {
        // Black glassmorphism theme
        glass: {
          bg: 'rgba(0, 0, 0, 0.96)',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-hover': 'rgba(255, 255, 255, 0.15)',
          subtle: 'rgba(255, 255, 255, 0.04)',
          'subtle-hover': 'rgba(255, 255, 255, 0.1)',
        },
      },
      backdropBlur: {
        glass: '32px',
      },
      backdropSaturate: {
        glass: '200%',
      },
      borderRadius: {
        glass: '16px',
        'glass-sm': '10px',
        'glass-lg': '20px',
      },
      boxShadow: {
        glass: '0 24px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04) inset',
        'glass-sm': '0 16px 48px rgba(0, 0, 0, 0.5)',
      },
    },
  },
  plugins: [],
};
