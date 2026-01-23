import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface StatusCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  hint?: string;
}

export async function status(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' clueprint status ')));

  const checks: StatusCheck[] = [];
  const projectRoot = findProjectRoot();

  // Check 1: Project found
  if (!projectRoot) {
    p.log.error('Clueprint project not found');
    p.log.message(pc.dim('Run this command from within the clueprint directory'));
    p.outro(pc.red('Status check failed'));
    return;
  }

  checks.push({
    name: 'Project',
    status: 'ok',
    message: `Found at ${projectRoot}`,
  });

  // Check 2: Dependencies installed
  const nodeModulesExists = existsSync(join(projectRoot, 'node_modules'));
  const extensionNodeModules = existsSync(join(projectRoot, 'packages/chrome-extension/node_modules'));

  if (nodeModulesExists && extensionNodeModules) {
    checks.push({
      name: 'Dependencies',
      status: 'ok',
      message: 'Installed',
    });
  } else {
    checks.push({
      name: 'Dependencies',
      status: 'error',
      message: 'Not installed',
      hint: 'Run: pnpm install',
    });
  }

  // Check 3: Extension built
  const extensionDist = join(projectRoot, 'packages/chrome-extension/dist');
  const manifestExists = existsSync(join(extensionDist, 'manifest.json'));

  if (existsSync(extensionDist) && manifestExists) {
    checks.push({
      name: 'Chrome Extension',
      status: 'ok',
      message: 'Built',
    });
  } else {
    checks.push({
      name: 'Chrome Extension',
      status: 'error',
      message: 'Not built',
      hint: 'Run: pnpm run build:extension',
    });
  }

  // Check 4: MCP server built
  const mcpDist = join(projectRoot, 'packages/mcp-server/dist');
  const mcpIndexExists = existsSync(join(mcpDist, 'index.js'));

  if (existsSync(mcpDist) && mcpIndexExists) {
    checks.push({
      name: 'MCP Server',
      status: 'ok',
      message: 'Built',
    });
  } else {
    checks.push({
      name: 'MCP Server',
      status: 'error',
      message: 'Not built',
      hint: 'Run: pnpm run build:server',
    });
  }

  // Check 5: Claude Code MCP configuration
  const claudeConfigPath = join(homedir(), '.claude', 'mcp.json');

  if (existsSync(claudeConfigPath)) {
    try {
      const config = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
      const mcpServers = config.mcpServers || {};

      if (mcpServers['clueprint']) {
        const serverConfig = mcpServers['clueprint'];
        const serverPath = serverConfig.args?.[0] || 'unknown';
        const serverExists = existsSync(serverPath);

        if (serverExists) {
          checks.push({
            name: 'Claude Code MCP',
            status: 'ok',
            message: 'Configured',
          });
        } else {
          checks.push({
            name: 'Claude Code MCP',
            status: 'warning',
            message: 'Server path not found',
            hint: `Expected: ${serverPath}`,
          });
        }
      } else {
        checks.push({
          name: 'Claude Code MCP',
          status: 'warning',
          message: 'Not configured',
          hint: 'Run: clueprint setup',
        });
      }
    } catch {
      checks.push({
        name: 'Claude Code MCP',
        status: 'warning',
        message: 'Config parse error',
        hint: 'Check ~/.claude/mcp.json',
      });
    }
  } else {
    checks.push({
      name: 'Claude Code MCP',
      status: 'warning',
      message: 'Not configured',
      hint: 'Run: clueprint setup',
    });
  }

  // Print checks
  console.log();
  for (const check of checks) {
    const icon = check.status === 'ok'
      ? pc.green('')
      : check.status === 'warning'
        ? pc.yellow('')
        : pc.red('');

    const name = pc.bold(check.name.padEnd(18));
    const message = check.status === 'ok'
      ? pc.green(check.message)
      : check.status === 'warning'
        ? pc.yellow(check.message)
        : pc.red(check.message);

    console.log(`  ${icon}  ${name} ${message}`);

    if (check.hint) {
      console.log(`      ${pc.dim(check.hint)}`);
    }
  }
  console.log();

  // Summary
  const errors = checks.filter(c => c.status === 'error').length;
  const warnings = checks.filter(c => c.status === 'warning').length;

  if (errors === 0 && warnings === 0) {
    p.outro(pc.green('All systems go!'));
  } else if (errors > 0) {
    p.outro(pc.red(`${errors} issue${errors > 1 ? 's' : ''} found. Run: clueprint setup`));
  } else {
    p.outro(pc.yellow(`${warnings} warning${warnings > 1 ? 's' : ''}`));
  }
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
