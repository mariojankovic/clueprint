#!/usr/bin/env bash
# Start the WebSocket server for Chrome extension communication
# This should run separately from the MCP server instances spawned by Claude Code

set -e

cd "$(dirname "$0")"

echo "Starting AI Browser DevTools WebSocket server..."
echo "This will listen on port 7007 for Chrome extension connections"
echo ""

# Start the server (it will also handle MCP protocol via stdio)
node dist/index.js
