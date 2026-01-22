#!/usr/bin/env node

import { Command } from 'commander';
import gradient from 'gradient-string';
import pc from 'picocolors';
import { setup } from './commands/setup.js';
import { status } from './commands/status.js';

const BANNER = `
   _____ _                       _       _
  / ____| |                     (_)     | |
 | |    | |_   _  ___ _ __  _ __ _ _ __ | |_
 | |    | | | | |/ _ \\ '_ \\| '__| | '_ \\| __|
 | |____| | |_| |  __/ |_) | |  | | | | | |_
  \\_____|_|\\__,_|\\___| .__/|_|  |_|_| |_|\\__|
                     | |
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
