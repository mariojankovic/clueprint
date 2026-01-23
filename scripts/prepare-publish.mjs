#!/usr/bin/env node

import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publishDir = join(root, 'publish');

// Version from git tag (v1.2.3 → 1.2.3) or fallback
const version = process.env.RELEASE_VERSION?.replace(/^v/, '') || '1.1.1';

console.log(`Preparing @clueprint/mcp@${version} for publishing...\n`);

// Step 1: Build all packages
console.log('1. Building all packages...');
execSync('pnpm run build', { cwd: root, stdio: 'inherit' });
console.log('');

// Step 2: Clean and create publish directory
console.log('2. Assembling publish directory...');
if (existsSync(publishDir)) {
  rmSync(publishDir, { recursive: true });
}
mkdirSync(publishDir, { recursive: true });

// Step 3: Copy built outputs
cpSync(join(root, 'packages/cli/dist'), join(publishDir, 'cli'), { recursive: true });
cpSync(join(root, 'packages/mcp-server/dist'), join(publishDir, 'server'), { recursive: true });
cpSync(join(root, 'packages/chrome-extension/dist'), join(publishDir, 'extension'), { recursive: true });

// Rename server to .cjs (package has "type": "module" for CLI, but server is CJS bundle)
const serverSrc = join(publishDir, 'server', 'index.js');
const serverDest = join(publishDir, 'server', 'index.cjs');
const serverContent = readFileSync(serverSrc, 'utf-8');
writeFileSync(serverDest, serverContent);
rmSync(serverSrc);

// Copy README and assets
cpSync(join(root, 'README.md'), join(publishDir, 'README.md'));
cpSync(join(root, 'assets'), join(publishDir, 'assets'), { recursive: true });

console.log('   cli/       ← packages/cli/dist');
console.log('   server/    ← packages/mcp-server/dist');
console.log('   extension/ ← packages/chrome-extension/dist');
console.log('   README.md  ← README.md');

// Step 4: Generate package.json
const packageJson = {
  name: '@clueprint/mcp',
  version,
  description: 'Browser visibility for AI assistants — MCP server + Chrome extension',
  type: 'module',
  bin: {
    mcp: './cli/index.js',
    clueprint: './cli/index.js',
  },
  files: ['cli/', 'server/', 'extension/', 'assets/'],
  dependencies: {
    // CLI dependencies (server is self-contained via esbuild bundle)
    '@clack/prompts': '^0.10.0',
    chalk: '^5.3.0',
    commander: '^12.1.0',
    'gradient-string': '^3.0.0',
    picocolors: '^1.1.1',
  },
  engines: { node: '>=18' },
  keywords: ['mcp', 'browser', 'devtools', 'chrome', 'claude', 'ai', 'debugging'],
  license: 'MIT',
  repository: {
    type: 'git',
    url: 'https://github.com/mariojankovic/clueprint.git'
  }
};

writeFileSync(join(publishDir, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');
console.log('   package.json generated');

// Step 5: Stamp version into extension manifest and create ZIP
console.log('\n5. Creating Chrome Web Store ZIP...');
const manifestPath = join(publishDir, 'extension', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
manifest.version = version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`   manifest.json version → ${version}`);

const extensionDir = join(publishDir, 'extension');
const zipPath = join(publishDir, 'clueprint-extension.zip');
execSync(`cd "${extensionDir}" && zip -r "${zipPath}" .`, { stdio: 'pipe' });
console.log('   clueprint-extension.zip created');

console.log('\nDone! To publish:\n');
console.log('  cd publish');
console.log('  npm publish --access public\n');
