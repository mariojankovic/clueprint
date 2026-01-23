import * as p from '@clack/prompts';
import pc from 'picocolors';
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface StartOptions {
  port?: string;
}

export async function startServer(options: StartOptions): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' clueprint start ')));

  const port = options.port || '7007';
  const projectRoot = findProjectRoot();

  if (!projectRoot) {
    p.log.error('Clueprint project not found');
    p.outro(pc.red('Run from the project directory'));
    process.exit(1);
  }

  const mcpServerPath = join(projectRoot, 'packages/mcp-server/dist/index.js');

  if (!existsSync(mcpServerPath)) {
    p.log.error('MCP server not built');
    p.outro(pc.dim('Run: clueprint setup'));
    process.exit(1);
  }

  const spinner = p.spinner();
  spinner.start('Starting MCP server...');

  const serverProcess = spawn('node', [mcpServerPath], {
    env: { ...process.env, PORT: port },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let started = false;

  // Helper to check for server started patterns
  function checkStarted(output: string): boolean {
    return output.includes('Server started') ||
           output.includes('listening') ||
           output.includes('ready');
  }

  serverProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    if (!started && checkStarted(output)) {
      started = true;
      spinner.stop(`MCP server running`);
      console.log();
      console.log(pc.dim('  Press Ctrl+C to stop'));
      console.log();
    }
    process.stdout.write(pc.dim(output));
  });

  // Server logs often go to stderr - don't treat as error
  serverProcess.stderr?.on('data', (data) => {
    const output = data.toString();

    // Check if this is actually a success message
    if (!started && checkStarted(output)) {
      started = true;
      spinner.stop(`MCP server running`);
      console.log();
      console.log(pc.dim('  Press Ctrl+C to stop'));
      console.log();
    }

    // Color warnings yellow, errors red, info dim
    if (output.includes('error') || output.includes('Error')) {
      process.stderr.write(pc.red(output));
    } else if (output.includes('warn') || output.includes('already in use')) {
      process.stderr.write(pc.yellow(output));
    } else {
      process.stderr.write(pc.dim(output));
    }
  });

  serverProcess.on('error', (error) => {
    spinner.stop('Failed to start server');
    p.log.error(error.message);
    process.exit(1);
  });

  serverProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(pc.red(`Server exited with code ${code}`));
      process.exit(code);
    }
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n');
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      p.outro(pc.dim('Server stopped'));
      process.exit(0);
    }, 300);
  });

  // Keep process running
  await new Promise(() => {});
}

function findProjectRoot(): string | null {
  let dir = process.cwd();

  while (dir !== '/') {
    const packageJson = join(dir, 'package.json');
    if (existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'));
        if (pkg.name === 'clueprint' || existsSync(join(dir, 'packages/chrome-extension'))) {
          return dir;
        }
      } catch {
        // Continue searching
      }
    }
    dir = dirname(dir);
  }

  const globalRoot = join(__dirname, '../../../../..');
  if (existsSync(join(globalRoot, 'packages/chrome-extension'))) {
    return globalRoot;
  }

  return null;
}
