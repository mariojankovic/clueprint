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
  const port = options.port || '7007';
  const mcpServerPath = findServerPath();

  if (!mcpServerPath) {
    // Only use fancy output if interactive
    if (process.stdin.isTTY) {
      p.log.error('MCP server not found');
      p.outro(pc.dim('Run: clueprint setup'));
    } else {
      process.stderr.write('[MCP] Server not found\n');
    }
    process.exit(1);
  }

  // MCP stdio mode: stdin is not a TTY, so an MCP client is connected.
  // Pass stdio through directly — no banners, no spinners, no color wrapping.
  if (!process.stdin.isTTY) {
    const serverProcess = spawn('node', [mcpServerPath], {
      env: { ...process.env, PORT: port },
      stdio: 'inherit',
    });

    serverProcess.on('error', (error) => {
      process.stderr.write(`[MCP] Failed to start: ${error.message}\n`);
      process.exit(1);
    });

    serverProcess.on('close', (code) => {
      process.exit(code ?? 0);
    });

    return;
  }

  // Interactive mode: show fancy UI
  p.intro(pc.bgCyan(pc.black(' clueprint start ')));

  const spinner = p.spinner();
  spinner.start('Starting MCP server...');

  const serverProcess = spawn('node', [mcpServerPath], {
    env: { ...process.env, PORT: port },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let started = false;

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

  serverProcess.stderr?.on('data', (data) => {
    const output = data.toString();

    if (!started && checkStarted(output)) {
      started = true;
      spinner.stop(`MCP server running`);
      console.log();
      console.log(pc.dim('  Press Ctrl+C to stop'));
      console.log();
    }

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

  process.on('SIGINT', () => {
    console.log('\n');
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      p.outro(pc.dim('Server stopped'));
      process.exit(0);
    }, 300);
  });

  await new Promise(() => {});
}

function findServerPath(): string | null {
  // 1. Published package: server is sibling to cli/ directory
  //    publish/cli/commands/start.js → publish/server/index.cjs
  const publishedPath = join(__dirname, '..', '..', 'server', 'index.cjs');
  if (existsSync(publishedPath)) {
    return publishedPath;
  }

  // 2. Local dev: find project root and use packages/mcp-server/dist/index.js
  const projectRoot = findProjectRoot();
  if (projectRoot) {
    const devPath = join(projectRoot, 'packages/mcp-server/dist/index.js');
    if (existsSync(devPath)) {
      return devPath;
    }
  }

  // 3. Installed at ~/.clueprint/server/index.cjs
  const homePath = join(process.env.HOME || '', '.clueprint', 'server', 'index.cjs');
  if (existsSync(homePath)) {
    return homePath;
  }

  return null;
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

  return null;
}
