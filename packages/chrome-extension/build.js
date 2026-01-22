/**
 * Build script for Chrome extension using esbuild + Svelte
 */

const esbuild = require('esbuild');
const sveltePlugin = require('esbuild-svelte');
const sveltePreprocess = require('svelte-preprocess');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

// Svelte plugin configuration with PostCSS/Tailwind support
function createSveltePlugin() {
  return sveltePlugin({
    preprocess: sveltePreprocess({
      postcss: true,
    }),
    compilerOptions: {
      css: 'injected', // Inject CSS into component JS
    },
  });
}

// Ensure dist directory exists
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy static files
function copyStaticFiles() {
  // Copy manifest
  fs.copyFileSync(
    path.join(__dirname, 'manifest.json'),
    path.join(distDir, 'manifest.json')
  );

  // Copy styles
  const stylesDir = path.join(distDir, 'styles');
  if (!fs.existsSync(stylesDir)) {
    fs.mkdirSync(stylesDir, { recursive: true });
  }
  fs.copyFileSync(
    path.join(__dirname, 'styles', 'overlay.css'),
    path.join(stylesDir, 'overlay.css')
  );

  // Copy popup HTML
  const popupDir = path.join(distDir, 'popup');
  if (!fs.existsSync(popupDir)) {
    fs.mkdirSync(popupDir, { recursive: true });
  }
  fs.copyFileSync(
    path.join(__dirname, 'src', 'popup', 'popup.html'),
    path.join(popupDir, 'popup.html')
  );

  // Copy devtools HTML files
  const devtoolsDir = path.join(distDir, 'devtools');
  if (!fs.existsSync(devtoolsDir)) {
    fs.mkdirSync(devtoolsDir, { recursive: true });
  }
  fs.copyFileSync(
    path.join(__dirname, 'src', 'devtools', 'devtools.html'),
    path.join(devtoolsDir, 'devtools.html')
  );
  fs.copyFileSync(
    path.join(__dirname, 'src', 'devtools', 'panel.html'),
    path.join(devtoolsDir, 'panel.html')
  );

  // Create icons directory and placeholder icons
  const iconsDir = path.join(distDir, 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  // Create simple SVG icons as placeholders
  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="#0066ff" rx="16"/>
    <text x="64" y="80" font-family="Arial" font-size="60" fill="white" text-anchor="middle">🔧</text>
  </svg>`;

  // For now, create placeholder PNG files (in production, use real icons)
  const sizes = [16, 32, 48, 128];
  for (const size of sizes) {
    const iconPath = path.join(iconsDir, `icon${size}.png`);
    if (!fs.existsSync(iconPath)) {
      // Create a simple placeholder (1x1 blue pixel PNG)
      // In production, replace with actual icons
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xd7, 0x63, 0x08, 0x60, 0xf8, 0x0f,
        0x00, 0x00, 0x84, 0x00, 0x81, 0x4e, 0x89, 0x43,
        0x8e, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
        0x44, 0xae, 0x42, 0x60, 0x82
      ]);
      fs.writeFileSync(iconPath, pngHeader);
    }
  }

  console.log('Static files copied');
}

// Build configuration
const buildOptions = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch,
  target: ['chrome100'],
  format: 'esm',
  logLevel: 'info',
};

// Build all entry points
async function build() {
  try {
    copyStaticFiles();

    // Content script (now with Svelte for Shadow DOM UI)
    await esbuild.build({
      ...buildOptions,
      entryPoints: ['src/content/index.ts'],
      outfile: 'dist/content/index.js',
      format: 'iife', // Content scripts need IIFE format
      plugins: [createSveltePlugin()],
      conditions: ['svelte', 'browser'],
    });

    // Background service worker
    await esbuild.build({
      ...buildOptions,
      entryPoints: ['src/background/index.ts'],
      outfile: 'dist/background/index.js',
    });

    // Popup (Svelte)
    await esbuild.build({
      ...buildOptions,
      entryPoints: ['src/popup/main.ts'],
      outfile: 'dist/popup/popup.js',
      format: 'iife',
      plugins: [createSveltePlugin()],
      conditions: ['svelte', 'browser'],
    });

    // DevTools
    await esbuild.build({
      ...buildOptions,
      entryPoints: ['src/devtools/devtools.ts'],
      outfile: 'dist/devtools/devtools.js',
      format: 'iife',
    });

    // DevTools Panel
    await esbuild.build({
      ...buildOptions,
      entryPoints: ['src/devtools/panel.ts'],
      outfile: 'dist/devtools/panel.js',
      format: 'iife',
    });

    console.log('Build complete!');

    if (isWatch) {
      console.log('Watching for changes...');
      // In watch mode, we'd set up file watchers
      // For simplicity, just keep the process running
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
