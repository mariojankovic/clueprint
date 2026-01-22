import * as p from '@clack/prompts';
import pc from 'picocolors';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
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

  if (!projectRoot) {
    p.cancel('Could not find Clueprint project. Run from the project directory.');
    process.exit(1);
  }

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
    await configureMcp(projectRoot);
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

function findProjectRoot(): string | null {
  let dir = process.cwd();

  while (dir !== '/') {
    const packageJson = join(dir, 'package.json');
    if (existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'));
        if (pkg.name === 'ai-browser-devtools' || existsSync(join(dir, 'packages/chrome-extension'))) {
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

async function configureMcp(projectRoot: string): Promise<boolean> {
  const claudeConfigDir = join(homedir(), '.claude');
  const claudeSettingsPath = join(claudeConfigDir, 'claude_desktop_config.json');
  const mcpServerPath = join(projectRoot, 'packages/mcp-server/dist/index.js');

  // Check if Claude Code config exists
  if (!existsSync(claudeConfigDir)) {
    const shouldCreate = await p.confirm({
      message: 'Claude Code config not found. Create MCP configuration?',
      initialValue: true,
    });

    if (p.isCancel(shouldCreate) || !shouldCreate) {
      p.log.info('Skipping MCP configuration');
      return false;
    }

    mkdirSync(claudeConfigDir, { recursive: true });
  }

  // Read existing config
  let config: Record<string, unknown> = {};
  if (existsSync(claudeSettingsPath)) {
    try {
      config = JSON.parse(readFileSync(claudeSettingsPath, 'utf-8'));
    } catch {
      config = {};
    }
  }

  const mcpServers = (config.mcpServers || {}) as Record<string, unknown>;
  const existingClueprint = mcpServers['ai-browser-devtools'];

  if (existingClueprint) {
    const shouldOverwrite = await p.confirm({
      message: 'Clueprint MCP already configured. Overwrite?',
      initialValue: false,
    });

    if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
      p.log.info('Keeping existing MCP configuration');
      return true;
    }
  }

  mcpServers['ai-browser-devtools'] = {
    command: 'node',
    args: [mcpServerPath],
  };

  config.mcpServers = mcpServers;

  try {
    writeFileSync(claudeSettingsPath, JSON.stringify(config, null, 2));
    p.log.success('MCP server configured for Claude Code');
    return true;
  } catch (error) {
    p.log.error(`Could not write to ${claudeSettingsPath}`);
    return false;
  }
}
