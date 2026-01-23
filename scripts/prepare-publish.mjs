#!/usr/bin/env node

import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publishDir = join(root, 'publish');

console.log('Preparing @clueprint/mcp for publishing...\n');

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
  version: '1.0.0',
  description: 'Browser visibility for AI assistants — MCP server + Chrome extension',
  type: 'module',
  bin: {
    clueprint: './cli/index.js'
  },
  files: ['cli/', 'server/', 'extension/', 'assets/'],
  dependencies: {
    // CLI dependencies
    '@clack/prompts': '^0.10.0',
    chalk: '^5.3.0',
    commander: '^12.1.0',
    'gradient-string': '^3.0.0',
    picocolors: '^1.1.1',
    // MCP server dependencies
    '@modelcontextprotocol/sdk': '^1.0.0',
    ws: '^8.16.0'
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

console.log('\nDone! To publish:\n');
console.log('  cd publish');
console.log('  npm publish --access public\n');
