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

  // Copy icons directory
  const srcIconsDir = path.join(__dirname, 'icons');
  const distIconsDir = path.join(distDir, 'icons');
  if (!fs.existsSync(distIconsDir)) {
    fs.mkdirSync(distIconsDir, { recursive: true });
  }

  // Copy clueprint.png to dist/icons
  const srcIcon = path.join(srcIconsDir, 'clueprint.png');
  if (fs.existsSync(srcIcon)) {
    fs.copyFileSync(srcIcon, path.join(distIconsDir, 'clueprint.png'));
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
