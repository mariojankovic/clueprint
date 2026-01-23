import * as p from '@clack/prompts';
import pc from 'picocolors';
import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SetupOptions {
  skipBuild?: boolean;
  skipMcp?: boolean;
}

export async function setup(options: SetupOptions): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' clueprint setup ')));

  const projectRoot = findProjectRoot();

  if (projectRoot) {
    await setupLocal(projectRoot, options);
  } else {
    await setupFromNpm(options);
  }
}

// --- Local dev mode (inside cloned repo) ---

async function setupLocal(projectRoot: string, options: SetupOptions): Promise<void> {
  // Step 1: Install dependencies
  const depsSpinner = p.spinner();
  depsSpinner.start('Installing dependencies...');

  try {
    await runCommand('pnpm', ['install'], { cwd: projectRoot });
    depsSpinner.stop('Dependencies installed');
  } catch (error) {
    depsSpinner.stop('Failed to install dependencies');
    p.log.error('Make sure pnpm is installed: npm install -g pnpm');
    process.exit(1);
  }

  // Step 2: Build extension and MCP server
  if (!options.skipBuild) {
    const buildSpinner = p.spinner();
    buildSpinner.start('Building Chrome extension...');

    try {
      await runCommand('pnpm', ['run', 'build:extension'], { cwd: projectRoot });
      buildSpinner.message('Building MCP server...');
      await runCommand('pnpm', ['run', 'build:server'], { cwd: projectRoot });
      buildSpinner.stop('Extension and MCP server built');
    } catch (error) {
      buildSpinner.stop('Build failed');
      p.log.error('Check the error output above');
      process.exit(1);
    }
  } else {
    p.log.info('Skipping build (--skip-build flag)');
  }

  // Step 3: Configure MCP for Claude Code
  if (!options.skipMcp) {
    const serverPath = join(projectRoot, 'packages/mcp-server/dist/index.js');
    await configureMcp({ command: 'node', args: [serverPath] });
  } else {
    p.log.info('Skipping MCP configuration (--skip-mcp flag)');
  }

  // Step 4: Verify installation
  const verifySpinner = p.spinner();
  verifySpinner.start('Verifying installation...');

  const issues: string[] = [];

  const extensionDist = join(projectRoot, 'packages/chrome-extension/dist');
  if (!existsSync(extensionDist)) {
    issues.push('Extension not built');
  }

  const mcpDist = join(projectRoot, 'packages/mcp-server/dist');
  if (!existsSync(mcpDist)) {
    issues.push('MCP server not built');
  }

  if (issues.length === 0) {
    verifySpinner.stop('Installation verified');
  } else {
    verifySpinner.stop('Installation incomplete');
    issues.forEach(issue => p.log.warn(issue));
  }

  // Print completion message
  const extensionPath = join(projectRoot, 'packages/chrome-extension/dist');

  p.note(
    `${pc.bold('Load the Chrome extension:')}\n` +
    `  ${pc.dim('1.')} Open ${pc.cyan('chrome://extensions/')}\n` +
    `  ${pc.dim('2.')} Enable ${pc.cyan('Developer mode')}\n` +
    `  ${pc.dim('3.')} Click ${pc.cyan('Load unpacked')}\n` +
    `  ${pc.dim('4.')} Select:\n` +
    `     ${pc.dim(extensionPath)}\n\n` +
    `${pc.bold('Then restart Claude Code')} to load the MCP server`,
    'Next steps'
  );

  p.outro(pc.green('Setup complete! Happy debugging ') + pc.cyan(''));
}

// --- npm mode (installed via npx @clueprint/mcp setup) ---

async function setupFromNpm(options: SetupOptions): Promise<void> {
  const clueprintDir = join(homedir(), '.clueprint');

  // Resolve bundled assets relative to CLI location
  // In the published package: cli/commands/setup.js → ../../extension/ and ../../server/
  const packageRoot = join(__dirname, '..', '..');
  const bundledExtension = join(packageRoot, 'extension');
  const bundledServer = join(packageRoot, 'server');

  // Verify bundled assets exist
  if (!existsSync(bundledExtension)) {
    p.cancel('Bundled extension not found. The package may be corrupted.');
    process.exit(1);
  }
  if (!existsSync(bundledServer)) {
    p.cancel('Bundled MCP server not found. The package may be corrupted.');
    process.exit(1);
  }

  // Step 1: Copy extension + server to ~/.clueprint/
  const copySpinner = p.spinner();
  copySpinner.start('Installing Chrome extension and MCP server...');

  try {
    mkdirSync(clueprintDir, { recursive: true });
    // Clean previous install to remove stale files from older versions
    const extDest = join(clueprintDir, 'extension');
    const serverDest = join(clueprintDir, 'server');
    if (existsSync(extDest)) rmSync(extDest, { recursive: true });
    if (existsSync(serverDest)) rmSync(serverDest, { recursive: true });
    cpSync(bundledExtension, extDest, { recursive: true });
    cpSync(bundledServer, serverDest, { recursive: true });
    copySpinner.stop('Chrome extension and MCP server installed');
  } catch (error) {
    copySpinner.stop('Installation failed');
    p.log.error(`Could not copy files to ${clueprintDir}`);
    process.exit(1);
  }

  // Step 2: Configure MCP for Claude Code (npx for automatic updates)
  if (!options.skipMcp) {
    await configureMcp({ command: 'npx', args: ['-y', '@clueprint/mcp'] });
  } else {
    p.log.info('Skipping MCP configuration (--skip-mcp flag)');
  }

  // Step 3: Verify
  const verifySpinner = p.spinner();
  verifySpinner.start('Verifying installation...');

  const issues: string[] = [];
  if (!existsSync(join(clueprintDir, 'extension', 'manifest.json'))) {
    issues.push('Extension not installed correctly');
  }
  if (!existsSync(join(clueprintDir, 'server', 'index.cjs'))) {
    issues.push('MCP server not installed correctly');
  }

  if (issues.length === 0) {
    verifySpinner.stop('Installation verified');
  } else {
    verifySpinner.stop('Installation incomplete');
    issues.forEach(issue => p.log.warn(issue));
  }

  // Print completion message
  const extensionPath = join(clueprintDir, 'extension');

  p.note(
    `${pc.bold('Load the Chrome extension:')}\n` +
    `  ${pc.dim('1.')} Open ${pc.cyan('chrome://extensions/')}\n` +
    `  ${pc.dim('2.')} Enable ${pc.cyan('Developer mode')}\n` +
    `  ${pc.dim('3.')} Click ${pc.cyan('Load unpacked')}\n` +
    `  ${pc.dim('4.')} Select:\n` +
    `     ${pc.dim(extensionPath)}\n\n` +
    `${pc.bold('Then restart Claude Code')} to load the MCP server`,
    'Next steps'
  );

  p.outro(pc.green('Setup complete! Happy debugging ') + pc.cyan(''));
}

// --- Shared utilities ---

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

function runCommand(command: string, args: string[], options: { cwd: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      stdio: 'pipe',
      shell: true,
    });

    let stderr = '';

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `Command failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

interface McpConfig {
  command: string;
  args: string[];
}

/**
 * Check if `claude` CLI is available in PATH.
 */
function isClaudeCliAvailable(): boolean {
  try {
    execSync('claude --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Configure MCP server for Claude Code.
 *
 * Strategy:
 * 1. Try `claude mcp add --scope user` (canonical, works in all projects)
 * 2. Fall back to writing ~/.claude.json directly (the correct user-scope location)
 *
 * IMPORTANT: User-scope MCP config lives in ~/.claude.json (NOT ~/.claude/mcp.json).
 * The ~/.claude/mcp.json file is NOT read for user-scope servers.
 */
async function configureMcp(mcpConfig: McpConfig): Promise<boolean> {
  const mcpSpinner = p.spinner();
  mcpSpinner.start('Configuring MCP server for Claude Code...');

  // Strategy 1: Use `claude mcp add` (official API)
  if (isClaudeCliAvailable()) {
    try {
      // Remove existing entry first (ignore errors if not found)
      try {
        execSync('claude mcp remove clueprint --scope user', { stdio: 'pipe' });
      } catch {
        // Not found, that's fine
      }

      // Build the command: claude mcp add --scope user --transport stdio clueprint -- <command> <args...>
      const cmdArgs = [mcpConfig.command, ...mcpConfig.args].map(a => `"${a}"`).join(' ');
      execSync(
        `claude mcp add --scope user --transport stdio clueprint -- ${cmdArgs}`,
        { stdio: 'pipe' }
      );
      mcpSpinner.stop('MCP server registered (user scope - works in all projects)');
      p.log.success(`Command: ${pc.dim(`${mcpConfig.command} ${mcpConfig.args.join(' ')}`)}`);
      return true;
    } catch (error) {
      // Fall through to manual config
      mcpSpinner.message('Falling back to manual configuration...');
    }
  }

  // Strategy 2: Write to ~/.claude.json directly (user-scope config file)
  const claudeConfigPath = join(homedir(), '.claude.json');

  let config: Record<string, unknown> = {};
  if (existsSync(claudeConfigPath)) {
    try {
      config = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
    } catch {
      config = {};
    }
  }

  const mcpServers = (config.mcpServers || {}) as Record<string, unknown>;

  mcpServers['clueprint'] = {
    type: 'stdio',
    command: mcpConfig.command,
    args: mcpConfig.args,
  };

  config.mcpServers = mcpServers;

  try {
    writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2) + '\n');
    mcpSpinner.stop('MCP server configured (user scope - works in all projects)');
    p.log.success(`Config: ${pc.dim(claudeConfigPath)}`);
    p.log.success(`Command: ${pc.dim(`${mcpConfig.command} ${mcpConfig.args.join(' ')}`)}`);
    return true;
  } catch (error) {
    mcpSpinner.stop('Failed to configure MCP server');
    p.log.error(`Could not write to ${claudeConfigPath}`);
    return false;
  }
}
