/**
 * MCP Server Implementation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  createWebSocketServer,
  isExtensionConnected,
  getCurrentSelection,
  getCurrentRecording,
  isRecordingActive,
  requestDiagnostics,
  startRecording,
  stopRecording,
  requestSnapshot,
  requestDiff,
} from './websocket.js';

import {
  formatElementReport,
  formatRegionReport,
  formatFlowReport,
  formatDiagnosticsReport,
} from './analysis/format.js';

import type { InspectCapture, FreeSelectCapture } from './types/index.js';

// Tool definitions
const TOOLS = [
  {
    name: 'inspect',
    description: 'Get detailed information about what the user selected in the browser — either a single element (via Option+Click) or a region (via Cmd+Shift+Drag). Auto-detects the selection type. Call when the user says "clueprint inspect", mentions selecting/inspecting an element, or clicking on something in the browser.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        includeScreenshot: {
          type: 'boolean',
          default: false,
          description: 'Include a screenshot (always included for region selections)',
        },
        cssDetail: {
          type: 'number',
          enum: [0, 1, 2, 3],
          default: 1,
          description: 'CSS detail level for element selections: 0=none, 1=layout+visual, 2=+typography, 3=full computed',
        },
      },
    },
  },
  {
    name: 'audit',
    description: 'Get current page diagnostics including console errors, network failures, performance metrics, and accessibility issues. Call when the user says "clueprint audit", asks what\'s wrong with the page, or wants a health/error check.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        includeWarnings: {
          type: 'boolean',
          default: false,
          description: 'Include warnings, not just errors',
        },
        includePerformance: {
          type: 'boolean',
          default: true,
          description: 'Include performance metrics (LCP, CLS)',
        },
      },
    },
  },
  {
    name: 'start_flow_recording',
    description: 'Start recording user actions, network requests, and errors in the browser. User will perform actions then stop recording. Call when user wants to show you a sequence of steps or reproduce a bug.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'stop_flow_recording',
    description: 'Stop the current flow recording and return the captured timeline of events, network requests, and errors.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        includeSuccessfulRequests: {
          type: 'boolean',
          default: false,
          description: 'Include successful (2xx) network requests',
        },
      },
    },
  },
  {
    name: 'recording',
    description: 'Get the most recent flow recording. Call when the user says "clueprint recording" or asks about what was recorded.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'snapshot_dom',
    description: 'Take a snapshot of the current DOM state for later comparison. Returns a snapshot ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        selector: {
          type: 'string',
          description: 'Optional CSS selector to snapshot a subtree instead of full page',
        },
      },
    },
  },
  {
    name: 'diff_dom_snapshots',
    description: 'Compare two DOM snapshots to see what changed (classes, sizes, styles). Useful for debugging dynamic content.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        before: {
          type: 'string',
          description: 'ID of the "before" snapshot',
        },
        after: {
          type: 'string',
          description: 'ID of the "after" snapshot',
        },
      },
      required: ['before', 'after'],
    },
  },
];

// Prompt definitions
const PROMPTS = [
  {
    name: 'inspect',
    description: 'Analyze the element or region selected in the browser',
  },
  {
    name: 'audit',
    description: 'Check the current page for errors, network failures, and performance issues',
  },
  {
    name: 'recording',
    description: 'Get and analyze the most recent flow recording from the browser',
  },
];

/**
 * Create error response
 */
function errorResponse(message: string) {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Create text response
 */
function textResponse(text: string, screenshot?: string) {
  const content: Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }> = [
    { type: 'text', text },
  ];

  if (screenshot) {
    // Remove data URL prefix if present
    const base64Data = screenshot.replace(/^data:image\/[a-z]+;base64,/, '');
    content.push({
      type: 'image',
      data: base64Data,
      mimeType: 'image/jpeg',
    });
  }

  return { content };
}

/**
 * Handle tool calls
 */
async function handleToolCall(name: string, args: Record<string, unknown>) {
  // Check extension connection first
  if (!isExtensionConnected()) {
    return errorResponse(
      'Browser extension not connected. Please ensure:\n' +
      '1. AI Browser DevTools extension is installed in Chrome\n' +
      '2. The extension popup shows "MCP: Connected"\n' +
      '3. Refresh the page if just installed'
    );
  }

  switch (name) {
    case 'inspect': {
      const selection = getCurrentSelection();

      if (!selection) {
        return errorResponse(
          'Nothing selected. To select:\n' +
          '1. Hold Option (Alt on Windows) and click any element, or\n' +
          '2. Use Cmd+Shift+Drag to select a region\n' +
          '3. Then say "clueprint inspect"'
        );
      }

      if (selection.mode === 'free-select') {
        const capture = selection as FreeSelectCapture;
        const report = formatRegionReport(capture);
        return textResponse(report, capture.screenshot);
      }

      const capture = selection as InspectCapture;
      const report = formatElementReport(capture);

      // Check selection age
      const ageMs = Date.now() - capture.timestamp;
      let warning = '';
      if (ageMs > 60000) {
        warning = `\n\n⚠️ Selection is ${Math.round(ageMs / 1000)}s old. The page may have changed. Select again for fresh data.`;
      }

      const includeScreenshot = args.includeScreenshot as boolean;
      return textResponse(
        report + warning,
        includeScreenshot ? capture.screenshot : undefined
      );
    }

    case 'audit': {
      try {
        const diagnostics = await requestDiagnostics();
        const report = formatDiagnosticsReport(diagnostics);
        return textResponse(report);
      } catch (error) {
        return errorResponse(`Failed to get diagnostics: ${error}`);
      }
    }

    case 'start_flow_recording': {
      if (isRecordingActive()) {
        return errorResponse('Recording is already in progress. Stop it first with stop_flow_recording.');
      }

      try {
        await startRecording();
        return textResponse(
          'Recording started! Now:\n' +
          '1. Perform the actions you want to capture in the browser\n' +
          '2. End by selecting the problem element (Option+Click)\n' +
          '3. Tell me "stop recording" when done'
        );
      } catch (error) {
        return errorResponse(`Failed to start recording: ${error}`);
      }
    }

    case 'stop_flow_recording': {
      if (!isRecordingActive()) {
        const existing = getCurrentRecording();
        if (existing) {
          const report = formatFlowReport(existing);
          return textResponse(report);
        }
        return errorResponse('No recording in progress. Start one with start_flow_recording.');
      }

      try {
        const recording = await stopRecording();
        const report = formatFlowReport(recording);
        return textResponse(report);
      } catch (error) {
        return errorResponse(`Failed to stop recording: ${error}`);
      }
    }

    case 'recording': {
      const recording = getCurrentRecording();

      if (!recording) {
        if (isRecordingActive()) {
          return errorResponse('Recording is still in progress. Stop it first with stop_flow_recording.');
        }
        return errorResponse('No recording available. Start one with start_flow_recording.');
      }

      const report = formatFlowReport(recording);
      return textResponse(report);
    }

    case 'snapshot_dom': {
      try {
        const selector = args.selector as string | undefined;
        const snapshot = await requestSnapshot(selector);
        return textResponse(
          `DOM snapshot taken.\n` +
          `ID: ${snapshot.id}\n` +
          `Elements: ${snapshot.elements.size}\n` +
          `URL: ${snapshot.url}\n\n` +
          `Use this ID with diff_dom_snapshots to compare changes.`
        );
      } catch (error) {
        return errorResponse(`Failed to take snapshot: ${error}`);
      }
    }

    case 'diff_dom_snapshots': {
      const before = args.before as string;
      const after = args.after as string;

      if (!before || !after) {
        return errorResponse('Both "before" and "after" snapshot IDs are required.');
      }

      try {
        const diff = await requestDiff(before, after);

        if ('error' in diff) {
          return errorResponse(diff.error as string);
        }

        const lines: string[] = [];
        lines.push(`DOM DIFF: ${before} → ${after}`);
        lines.push('━'.repeat(40));
        lines.push(`Changes: ${diff.changes.length}`);
        lines.push('');

        for (const change of diff.changes.slice(0, 20)) {
          const emoji = change.type === 'added' ? '➕' : change.type === 'removed' ? '➖' : '🔄';
          lines.push(`${emoji} ${change.type.toUpperCase()}: ${change.selector}`);

          if (change.changes) {
            if (change.changes.classes) {
              if (change.changes.classes.added.length) {
                lines.push(`   + classes: ${change.changes.classes.added.join(', ')}`);
              }
              if (change.changes.classes.removed.length) {
                lines.push(`   - classes: ${change.changes.classes.removed.join(', ')}`);
              }
            }
            if (change.changes.size) {
              lines.push(`   size: ${change.changes.size.before.width}×${change.changes.size.before.height} → ${change.changes.size.after.width}×${change.changes.size.after.height}`);
            }
          }
        }

        return textResponse(lines.join('\n'));
      } catch (error) {
        return errorResponse(`Failed to diff snapshots: ${error}`);
      }
    }

    default:
      return errorResponse(`Unknown tool: ${name}`);
  }
}

/**
 * Create and start the MCP server
 */
export async function createMCPServer(): Promise<void> {
  // Start WebSocket server for extension communication
  const wsServer = await createWebSocketServer();

  if (wsServer) {
    console.error('[MCP] WebSocket server started successfully');
  } else {
    console.error('[MCP] Running without WebSocket server - extension connection not available');
  }

  // Create MCP server
  const server = new Server(
    {
      name: 'clueprint',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
    }
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(name, args as Record<string, unknown>);
  });

  // Handle list prompts request
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: PROMPTS };
  });

  // Handle get prompt request
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name } = request.params;

    switch (name) {
      case 'inspect':
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: 'I selected something in the browser. Use the inspect tool to get details about my selection (it auto-detects element vs region). Describe what was selected and any issues you notice.',
              },
            },
          ],
        };

      case 'audit':
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: 'Run a page audit using the audit tool (include warnings). Report any console errors, network failures, performance issues, or accessibility problems found on the current page.',
              },
            },
          ],
        };

      case 'recording':
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: 'Get the most recent flow recording using the recording tool and analyze it. Summarize what actions were captured, any errors that occurred, and highlight anything notable.',
              },
            },
          ],
        };

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP] Server started and connected to stdio');
}
