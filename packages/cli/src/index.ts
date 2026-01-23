#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// MCP server mode: no CLI args + non-TTY stdin means Claude Code is spawning us.
// Run the MCP server directly with stdio passthrough. No output, no banners.
if (process.argv.length === 2 && !process.stdin.isTTY) {
  const serverPath = findServerPath();
  if (!serverPath) {
    process.stderr.write('[clueprint] MCP server not found\n');
    process.exit(1);
  }

  const server = spawn('node', [serverPath], {
    stdio: 'inherit',
    env: process.env,
  });

  server.on('error', (err) => {
    process.stderr.write(`[clueprint] Failed to start: ${err.message}\n`);
    process.exit(1);
  });

  server.on('close', (code) => process.exit(code ?? 0));
} else {
  // CLI mode: import commander and handle commands
  const { Command } = await import('commander');
  const gradient = (await import('gradient-string')).default;
  const pc = (await import('picocolors')).default;
  const { setup } = await import('./commands/setup.js');
  const { status } = await import('./commands/status.js');

  const BANNER = `
       _                         _        _
  ___ | |  _   _    ___   _ __  (_) _ __  | |_
 / __|| | | | | |  / _ \\ | '_ \\ | || '_ \\ | __|
| (__ | | | |_| | |  __/ | |_) || || | | || |_
 \\___||_|  \\__,_|  \\___| | .__/ |_||_| |_| \\__|
                          |_|
`;

  function printBanner(): void {
    const clueprintGradient = gradient(['#7c3aed', '#06b6d4']);
    console.log(clueprintGradient.multiline(BANNER));
    console.log(pc.dim('  Browser visibility for AI assistants\n'));
  }

  const program = new Command();

  program
    .name('clueprint')
    .description('Browser visibility for AI assistants')
    .version('0.1.0');

  program
    .command('setup')
    .description('Set up Clueprint (build extension, configure MCP)')
    .option('--skip-build', 'Skip building the extension')
    .option('--skip-mcp', 'Skip MCP configuration')
    .action(async (options) => {
      await setup(options);
    });

  program
    .command('status')
    .description('Check Clueprint installation status')
    .action(async () => {
      await status();
    });

  program
    .command('start')
    .description('Start the MCP server')
    .option('-p, --port <port>', 'Port to run the server on', '7007')
    .action(async (options) => {
      const { startServer } = await import('./commands/start.js');
      await startServer(options);
    });

  // Default command (no args) shows help with banner
  if (process.argv.length === 2) {
    printBanner();
    program.help();
  }

  program.parse();
}

function findServerPath(): string | null {
  // 1. Published package: cli/index.js → ../server/index.cjs
  const publishedPath = join(__dirname, '..', 'server', 'index.cjs');
  if (existsSync(publishedPath)) {
    return publishedPath;
  }

  // 2. Local dev: packages/cli/dist/index.js → ../../mcp-server/dist/index.js
  const devPath = join(__dirname, '..', '..', 'mcp-server', 'dist', 'index.js');
  if (existsSync(devPath)) {
    return devPath;
  }

  // 3. Installed at ~/.clueprint/server/index.cjs
  const homePath = join(process.env.HOME || '', '.clueprint', 'server', 'index.cjs');
  if (existsSync(homePath)) {
    return homePath;
  }

  return null;
}
