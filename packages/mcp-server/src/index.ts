#!/usr/bin/env node
/**
 * AI Browser DevTools MCP Server
 * Entry point
 */

import { createMCPServer } from './server.js';

// Start the server
createMCPServer().catch((error) => {
  console.error('[MCP] Failed to start server:', error);
  process.exit(1);
});
