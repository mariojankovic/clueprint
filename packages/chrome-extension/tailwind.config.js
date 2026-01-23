/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{svelte,ts,js,html}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
        mono: ['SF Mono', 'Monaco', 'Cascadia Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
