# Clueprint Chrome Extension

Browser visibility for AI assistants. Select elements or regions to capture context and share with your AI coding assistant.

## Features

- **Option+Click**: Select individual elements to capture their details
- **Cmd+Shift+Drag** (Mac) / **Ctrl+Shift+Drag** (Windows): Select a region of the page
- **Intent-based capture**:
  - **Tag**: Minimal context for AI awareness
  - **Fix**: Includes console errors and network failures
  - **Beautify**: Includes screenshot and aesthetic analysis

## Prerequisites

- Node.js 18+
- npm or pnpm

## Installation

1. Install dependencies:

```bash
cd packages/chrome-extension
npm install
```

2. Build the extension:

```bash
npm run build
```

This creates a `dist/` folder with the built extension.

## Loading in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `dist/` folder inside `packages/chrome-extension/`

The extension icon should appear in your toolbar.

## Development

Run the build in watch mode for automatic rebuilds:

```bash
npm run watch
```

After changes, click the refresh icon on the extension card in `chrome://extensions/` to reload.

## Usage

### Inspect Mode (Option+Click)

1. Hold **Option** (Mac) or **Alt** (Windows) to activate inspect mode
2. Hover over elements to see them highlighted
3. Click an element to open the intent picker
4. Choose an action:
   - **Tag for AI**: Save element context
   - **Fix**: Include console/network errors
   - **Beautify**: Include screenshot for styling help
5. Optionally add a note
6. Press Enter or click a button to capture

### Region Select (Cmd+Shift+Drag)

1. Hold **Cmd+Shift** (Mac) or **Ctrl+Shift** (Windows)
2. Drag to select a region
3. Choose an intent from the picker
4. The region and contained elements are captured

### Toolbar Button

Click the extension icon in your toolbar to access quick actions without keyboard shortcuts.

## MCP Server

The extension includes an MCP (Model Context Protocol) server that AI assistants can use to retrieve captured data. See the main project documentation for MCP integration details.

## Project Structure

```
src/
├── background/     # Service worker
├── content/        # Content script (injected into pages)
│   ├── capture/    # DOM and screenshot capture
│   ├── selection/  # Inspect and free-select modes
│   ├── ui/         # Shadow DOM mounting utilities
│   └── utils/      # Selectors, styles utilities
├── popup/          # Extension popup (Svelte)
├── shared/         # Shared Svelte components
├── devtools/       # DevTools panel
└── types/          # TypeScript type definitions
```
