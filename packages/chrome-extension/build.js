/**
 * Build script for Chrome extension using esbuild + Svelte
 */

const esbuild = require('esbuild');
const sveltePlugin = require('esbuild-svelte');
const sveltePreprocess = require('svelte-preprocess');
const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const postcssLoadConfig = require('postcss-load-config');

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
    // Filter out expected warnings
    filterWarnings: (warning) => {
      // Ignore unused CSS selector warnings (from Tailwind utilities)
      if (warning.code === 'css_unused_selector') return false;
      // Ignore quoted attribute warnings (Svelte 5 migration)
      if (warning.code === 'attribute_quoted') return false;
      // Ignore state_referenced_locally for defaultOptions (we intentionally capture initial value)
      if (warning.code === 'state_referenced_locally' && warning.message?.includes('defaultOptions')) return false;
      return true;
    },
  });
}

// Ensure dist directory exists
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Compile CSS with PostCSS/Tailwind
async function compileCss(inputPath, outputPath) {
  const css = fs.readFileSync(inputPath, 'utf8');
  const { plugins, options } = await postcssLoadConfig({ cwd: __dirname });
  const result = await postcss(plugins).process(css, {
    ...options,
    from: inputPath,
    to: outputPath,
  });

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, result.css);
  console.log(`CSS compiled: ${path.relative(__dirname, outputPath)}`);
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

  // Copy page-detect.js for framework detection (runs in page context)
  const contentDir = path.join(distDir, 'content');
  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir, { recursive: true });
  }
  fs.copyFileSync(
    path.join(__dirname, 'src', 'content', 'capture', 'page-detect.js'),
    path.join(contentDir, 'page-detect.js')
  );

  // Copy offscreen HTML
  const offscreenDir = path.join(distDir, 'offscreen');
  if (!fs.existsSync(offscreenDir)) {
    fs.mkdirSync(offscreenDir, { recursive: true });
  }
  fs.copyFileSync(
    path.join(__dirname, 'src', 'offscreen', 'offscreen.html'),
    path.join(offscreenDir, 'offscreen.html')
  );

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
    const contentCtx = await esbuild.context({
      ...buildOptions,
      entryPoints: ['src/content/index.ts'],
      outfile: 'dist/content/index.js',
      format: 'iife', // Content scripts need IIFE format
      plugins: [createSveltePlugin()],
      conditions: ['svelte', 'browser'],
    });

    // Background service worker
    const backgroundCtx = await esbuild.context({
      ...buildOptions,
      entryPoints: ['src/background/index.ts'],
      outfile: 'dist/background/index.js',
    });

    // Popup CSS (Tailwind)
    await compileCss(
      path.join(__dirname, 'src/popup/popup.css'),
      path.join(distDir, 'popup/popup.css')
    );

    // Popup (Svelte)
    const popupCtx = await esbuild.context({
      ...buildOptions,
      entryPoints: ['src/popup/main.ts'],
      outfile: 'dist/popup/popup.js',
      format: 'iife',
      plugins: [createSveltePlugin()],
      conditions: ['svelte', 'browser'],
    });

    // DevTools
    const devtoolsCtx = await esbuild.context({
      ...buildOptions,
      entryPoints: ['src/devtools/devtools.ts'],
      outfile: 'dist/devtools/devtools.js',
      format: 'iife',
    });

    // DevTools Panel CSS (Tailwind)
    await compileCss(
      path.join(__dirname, 'src/devtools/panel.css'),
      path.join(distDir, 'devtools/panel.css')
    );

    // DevTools Panel (Svelte)
    const panelCtx = await esbuild.context({
      ...buildOptions,
      entryPoints: ['src/devtools/panel.ts'],
      outfile: 'dist/devtools/panel.js',
      format: 'iife',
      plugins: [createSveltePlugin()],
      conditions: ['svelte', 'browser'],
    });

    // Offscreen document (for clipboard without focus)
    const offscreenCtx = await esbuild.context({
      ...buildOptions,
      entryPoints: ['src/offscreen/offscreen.ts'],
      outfile: 'dist/offscreen/offscreen.js',
      format: 'iife',
    });

    // Initial build
    await Promise.all([
      contentCtx.rebuild(),
      backgroundCtx.rebuild(),
      popupCtx.rebuild(),
      devtoolsCtx.rebuild(),
      panelCtx.rebuild(),
      offscreenCtx.rebuild(),
    ]);

    console.log('Build complete!');

    if (isWatch) {
      // Start watching all contexts
      await Promise.all([
        contentCtx.watch(),
        backgroundCtx.watch(),
        popupCtx.watch(),
        devtoolsCtx.watch(),
        panelCtx.watch(),
        offscreenCtx.watch(),
      ]);
      console.log('Watching for changes... (Ctrl+C to stop)');
    } else {
      // Cleanup contexts when not watching
      await Promise.all([
        contentCtx.dispose(),
        backgroundCtx.dispose(),
        popupCtx.dispose(),
        devtoolsCtx.dispose(),
        panelCtx.dispose(),
        offscreenCtx.dispose(),
      ]);
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
