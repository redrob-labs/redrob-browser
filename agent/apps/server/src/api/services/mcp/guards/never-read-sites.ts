/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * "Sites AI never reads": a page on a listed site cannot be read, captured or acted on by the
 * agent, at any privacy level. The agent may still open such a page when asked; it simply cannot
 * see it. Applies to every caller of the browser tools, external agents included.
 */

import {
  errorResult,
  type ToolResult,
} from '@browseros/browser-mcp/tools/framework'
import { isNeverReadSite } from '../../../../lib/privacy/settings'
import type {
  BrowserToolCall,
  BrowserToolGuard,
} from '../browser-tool-dispatch'

/** Tools that only manage tabs, windows or history never expose a page's content. */
const CONTENT_FREE_TOOLS = new Set([
  'tabs',
  'tab_groups',
  'windows',
  'history',
  'navigate',
  'wait',
])

let listedSites: () => readonly string[] = () => []

/** Called once by the server with the live settings, so a change applies to the next tool call. */
export function setNeverReadSitesSource(source: () => readonly string[]): void {
  listedSites = source
}

function pagesOf(call: BrowserToolCall): number[] {
  const pages: number[] = []
  for (const key of ['page', 'pageId']) {
    const value = call.args[key]
    if (typeof value === 'number') pages.push(value)
  }
  return pages
}

export const guardNeverReadSites: BrowserToolGuard = (call) =>
  guardNeverReadSitesCall(call, listedSites())

export function guardNeverReadSitesCall(
  call: BrowserToolCall,
  sites: readonly string[],
): ToolResult | null {
  if (!sites.length || CONTENT_FREE_TOOLS.has(call.tool.name)) return null
  for (const pageId of pagesOf(call)) {
    const url = call.context.session.pages.getInfo(pageId)?.url
    if (url && isNeverReadSite(url, sites)) {
      return errorResult(
        `${call.tool.name}: this page is on a site the person asked AI never to read. Do not try to read or act on it another way; tell them it is on their list in Settings, Privacy.`,
      )
    }
  }
  // `run` scripts can reach any open page, so they are refused while a listed site is open.
  if (call.tool.name === 'run') {
    const listed = call.context.session.pages
      .known()
      .some((page) => isNeverReadSite(page.url, sites))
    if (listed) {
      return errorResult(
        'run: a page on a site the person asked AI never to read is open, so scripts are unavailable until it is closed.',
      )
    }
  }
  return null
}
