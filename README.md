# Clueprint

Browser visibility for AI assistants. Select elements or regions to capture context and share with your AI coding assistant (Claude Code, Cursor, etc.)

## Quick Start

```bash
# Clone the repo
git clone https://github.com/yourusername/clueprint.git
cd clueprint

# Run setup
npx clueprint setup
```

The setup wizard will:
1. Install dependencies
2. Build the Chrome extension
3. Build the MCP server
4. Configure Claude Code integration

Then follow the on-screen instructions to load the extension in Chrome.

## What is Clueprint?

Clueprint gives AI assistants visibility into your browser. Instead of describing what you see or copy-pasting HTML, you can:

- **Option+Click** any element to capture its details, styles, and context
- **Cmd+Shift+Drag** (Mac) / **Ctrl+Shift+Drag** (Windows) to select a region
- **Record flows** to capture user interactions, network requests, and console errors
- **Ask Claude** about what's happening in the browser

The captured data is sent to Claude via MCP (Model Context Protocol), so Claude can see exactly what you're looking at.

## Features

### Element Selection (Option+Click)
Hold Option (Alt on Windows) and click any element to capture:
- Element details (tag, classes, attributes)
- Computed styles (layout, spacing, colors)
- Parent context and siblings
- Console errors related to this element
- Network failures

### Region Selection (Cmd+Shift+Drag)
Hold Cmd+Shift and drag to select a region:
- Screenshot of the selected area
- All elements within the region
- DOM structure
- Aesthetic analysis (colors, typography, spacing)

### Flow Recording
Record user interactions to debug issues:
- Clicks, scrolls, inputs
- Network requests and errors
- Console logs and errors
- Layout shifts

## CLI Commands

```bash
# Full setup (install, build, configure MCP)
npx clueprint setup

# Check installation status
npx clueprint status

# Start MCP server manually
npx clueprint start
```

## Manual Installation

If you prefer manual setup:

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Build

```bash
# Build everything
pnpm run build

# Or build individually
pnpm run build:extension
pnpm run build:server
```

### 3. Load Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select `packages/chrome-extension/dist`

### 4. Configure Claude Code MCP

Add to your `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ai-browser-devtools": {
      "command": "node",
      "args": ["/path/to/clueprint/packages/mcp-server/dist/index.js"]
    }
  }
}
```

Then restart Claude Code.

## Development

```bash
# Watch mode for extension
cd packages/chrome-extension
pnpm run watch

# Watch mode for MCP server
cd packages/mcp-server
pnpm run dev
```

After changes, refresh the extension in `chrome://extensions/`.

## Project Structure

```
packages/
├── chrome-extension/     # Chrome extension (content script, popup, background)
│   ├── src/
│   │   ├── background/   # Service worker
│   │   ├── content/      # Injected into pages
│   │   │   ├── capture/  # DOM and screenshot capture
│   │   │   ├── monitoring/  # Console, network, performance
│   │   │   └── selection/   # Inspect and region select modes
│   │   ├── popup/        # Extension popup (Svelte)
│   │   └── types/        # TypeScript types
│   └── dist/             # Built extension (load this in Chrome)
│
├── mcp-server/           # MCP server for Claude integration
│   ├── src/
│   │   ├── tools/        # MCP tool handlers
│   │   └── analysis/     # Report formatting
│   └── dist/             # Built server
│
└── cli/                  # Setup CLI
    └── src/
        └── commands/     # setup, status, start
```

## How It Works

1. **Chrome Extension** runs on every page, monitoring console errors, network requests, and enabling element selection
2. **Extension Background** maintains a WebSocket connection to the MCP server
3. **MCP Server** exposes tools that Claude can call to get browser data
4. **Claude Code** calls these tools when you ask questions about what's in the browser

## Requirements

- Node.js 18+
- pnpm
- Chrome browser
- Claude Code (or any MCP-compatible AI assistant)

## License

MIT
