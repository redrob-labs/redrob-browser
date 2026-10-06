/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { beforeAll, describe, expect, it, mock } from 'bun:test'
import { createElement, type FC } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The three sections are stubbed so this exercises the page's own composition.
mock.module('./MCPServerHeader', () => ({
  MCPServerHeader: () => createElement('div', null, 'server-header'),
}))

mock.module('./IntegrationsSection', () => ({
  IntegrationsSection: () => createElement('div', null, 'integrations'),
}))

mock.module('./MCPToolsSection', () => ({
  MCPToolsSection: () => createElement('div', null, 'tools'),
}))

mock.module('@/lib/browseros/helpers', () => ({
  getMcpServerUrl: async () => 'http://127.0.0.1:9200/mcp',
}))

let MCPSettingsPage: FC

beforeAll(async () => {
  MCPSettingsPage = (await import('./MCPSettingsPage')).MCPSettingsPage
})

describe('MCPSettingsPage', () => {
  // This page used to mount a permanent banner advertising another upstream
  // product between the header and the integrations. The guard asserted that it
  // was there; it now asserts the page goes straight from one to the other.
  it('renders the server header, integrations and tools, with no promo between', () => {
    const html = renderToStaticMarkup(createElement(MCPSettingsPage))

    const headerIndex = html.indexOf('server-header')
    const integrationsIndex = html.indexOf('integrations')
    const toolsIndex = html.indexOf('tools')
    expect(headerIndex).toBeGreaterThan(-1)
    expect(integrationsIndex).toBeGreaterThan(headerIndex)
    expect(toolsIndex).toBeGreaterThan(integrationsIndex)

    const between = html.slice(
      headerIndex + 'server-header'.length,
      integrationsIndex,
    )
    expect(between).not.toContain('MCP support')
    expect(html).not.toContain('BrowserOS')
  })
})
