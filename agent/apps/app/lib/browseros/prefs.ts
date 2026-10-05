/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

/** @public */
export const BROWSEROS_PREFS = {
  MCP_PORT: 'browseros.server.mcp_port',
  THIRD_PARTY_LLM_PROVIDERS: 'browseros.third_party_llm.providers',
  PROXY_PORT: 'browseros.server.proxy_port',
  SERVER_PORT: 'browseros.server.server_port',
  ALLOW_REMOTE_MCP: 'browseros.server.allow_remote_in_mcp',
  RESTART_SERVER: 'browseros.server.restart_requested',
  SHOW_LLM_CHAT: 'browseros.show_llm_chat',
  SHOW_TOOLBAR_LABELS: 'browseros.show_toolbar_labels',
  VERTICAL_TABS_ENABLED: 'browseros.vertical_tabs_enabled',
  INSTALL_ID: 'browseros.metrics_install_id',
} as const
