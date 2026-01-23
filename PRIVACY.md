# Privacy Policy

**Clueprint** is a browser extension and MCP server that gives AI coding assistants visibility into your browser. This policy explains what data is collected and how it is used.

## Data Collection

Clueprint captures the following data **only when explicitly triggered by the user** (via keyboard shortcuts, button clicks, or starting a recording):

- **Website content**: DOM elements, HTML attributes, computed CSS styles, text content, and screenshots of selected regions
- **User activity**: Click events, scroll positions, and keyboard inputs during active flow recordings
- **Console output**: JavaScript errors and warnings from the browser console
- **Network requests**: Failed network requests (URL, status code, timing) during recordings or audits

## Data Storage

All captured data is stored **locally on your machine**:

- Transmitted via local WebSocket (localhost) from the Chrome extension to the local MCP server
- The MCP server runs on your machine and communicates with your AI assistant via stdio
- No data is sent to any remote server, cloud service, or third party

## Data Sharing

Clueprint does **not**:

- Send any data to external servers
- Use analytics or tracking services
- Collect personally identifiable information
- Store data beyond the current session (except user preferences in Chrome's local storage)

The only recipient of captured data is your locally-running AI assistant (e.g., Claude Code) through the Model Context Protocol.

## Permissions

The extension requires these permissions to function:

- **activeTab**: Access the current page's DOM when inspection is triggered
- **scripting**: Inject content scripts for element selection overlays
- **storage**: Store user preferences (enabled state, recording status) locally
- **tabs**: Detect navigation to re-establish content script connections
- **alarms**: Maintain the local WebSocket connection
- **Host permissions (all URLs)**: Operate on any page the developer is working on

## Changes

This policy may be updated as the extension evolves. Changes will be reflected in this document in the project repository.

## Contact

For questions about this privacy policy, open an issue at: https://github.com/mariojankovic/clueprint/issues
