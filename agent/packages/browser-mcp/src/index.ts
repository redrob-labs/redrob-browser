/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

export { BROWSER_MCP_INSTRUCTIONS } from './mcp-prompt'
export type { BrowserMcpServerOptions } from './mcp-server'
export { createBrowserMcpServer } from './mcp-server'
export type {
  ContentItem,
  ToolResponseOptions,
  ToolResultMetadata,
} from './response'
export { ToolResponse } from './response'
export type {
  ContentBlock,
  ToolAnnotations,
  ToolContext,
  ToolDefinition,
  ToolInputSchema,
  ToolResult,
} from './tools/framework'
export {
  abortableDelay,
  clampTimeout,
  defineTool,
  errorResult,
  executeTool,
  textResult,
  throwIfAborted,
} from './tools/framework'
export type { BrowserOutputFileAccess } from './tools/output-file'
export {
  createBrowserOutputFileAccess,
  recordBrowserOutputFile,
  withBrowserOutputFileAccess,
} from './tools/output-file'
export type {
  BrowserToolDefaults,
  BrowserToolExecutionEvent,
  BrowserToolExecutor,
  BrowserToolRegistrationOptions,
} from './tools/register'
export { registerBrowserTools } from './tools/register'
export { BROWSER_TOOLS } from './tools/registry'
