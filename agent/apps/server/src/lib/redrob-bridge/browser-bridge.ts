/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The Redrob app bridge for the browser: hands the shared Redrob Code daemon a small set of
 * browser tools so a prompt in any Redrob surface (a phone chat included) can drive this browser
 * while it is up. A thin adapter over the same `BrowserSession` the in-process agent and the MCP
 * server use -- tabs, navigation, content, snapshot refs, input, screenshots -- not a second driver.
 *
 * Protocol: redrob-code `docs/APP-BRIDGE.md`. Transport: the vendored `./app-bridge` (MCP over
 * loopback, registered with the daemon). The browser works without the daemon: a bridge that
 * cannot start is logged and forgotten.
 */

import type { Browser } from '@browseros/browser-core/browser'
import { buildContentMarkdownExpression } from '@browseros/browser-core/content-markdown'
import type { BrowserSession } from '@browseros/browser-core/core/session'
import { writeTempToolOutputBinaryFile } from '@browseros/browser-mcp/output-file'
import { z } from 'zod'
import { logger } from '../logger'
import {
  type AppBridgeHandle,
  startAppBridge,
  type ToolDef,
} from './app-bridge'

const APP_NAME = 'browser'
const DEFAULT_READ_CHARS = 8000
const MAX_FIND_RESULTS = 20

const tabId = z
  .number()
  .int()
  .optional()
  .describe('Tab id from list_tabs. Omitted: the active tab.')

/** Starts the bridge; resolves to undefined (after logging) when the daemon cannot be reached. */
export async function startBrowserBridge(args: {
  browser: Browser
  version: string
}): Promise<AppBridgeHandle | undefined> {
  const session = args.browser.session
  try {
    const bridge = await startAppBridge({
      name: APP_NAME,
      version: args.version,
      tools: buildTools(args.browser, session),
    })
    logger.info('Redrob app bridge up', { url: bridge.url, id: bridge.id })
    return bridge
  } catch (error) {
    logger.warn('Redrob app bridge not started; the daemon is unreachable', {
      error: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }
}

function buildTools(browser: Browser, session: BrowserSession): ToolDef[] {
  const resolveTab = async (requested?: number): Promise<number> => {
    if (requested !== undefined) {
      const pages = await session.pages.list()
      if (!pages.some((p) => p.pageId === requested)) {
        throw new Error(`No open tab with id ${requested}.`)
      }
      return requested
    }
    const active = await session.pages.getActive()
    if (!active) throw new Error('No active tab; pass tab_id or open one.')
    return active.pageId
  }

  const describe = async (pageId: number): Promise<string> => {
    const info =
      (await session.pages.refresh(pageId)) ?? session.pages.getInfo(pageId)
    if (!info) return `tab ${pageId}`
    return `${info.url}${info.title ? ` (${info.title})` : ''}`
  }

  return [
    {
      name: 'list_tabs',
      description:
        'List every open browser tab, one per line: id, title and url, with the active tab marked.',
      handler: async () => {
        const pages = await session.pages.list()
        if (pages.length === 0) return '(no open tabs)'
        return pages
          .map(
            (p) =>
              `${p.isActive ? '*' : ' '} [${p.pageId}] ${p.title || '(untitled)'} - ${p.url}`,
          )
          .join('\n')
      },
    },
    {
      name: 'open_tab',
      description:
        'Open a new tab at the given url in the visible window and answer its tab id.',
      input: z.object({ url: z.string().describe('The url to open.') }),
      handler: async ({ url }) => {
        const pageId = await browser.newPage(String(url), { background: false })
        return `opened tab ${pageId}: ${await describe(pageId)}`
      },
    },
    {
      name: 'navigate',
      description:
        'Navigate a tab (the active one when tab_id is omitted) to a url and answer the final url and title.',
      input: z.object({ tab_id: tabId, url: z.string() }),
      handler: async ({ tab_id, url }) => {
        const pageId = await resolveTab(tab_id as number | undefined)
        await session.nav(pageId).goto(String(url))
        return `tab ${pageId}: ${await describe(pageId)}`
      },
    },
    {
      name: 'read_page',
      description:
        'Answer the readable text of a tab as markdown, capped at max_chars (default 8000), with the total length.',
      input: z.object({
        tab_id: tabId,
        max_chars: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Cap on the answered text. Default 8000.'),
      }),
      handler: async ({ tab_id, max_chars }) => {
        const pageId = await resolveTab(tab_id as number | undefined)
        const cap =
          typeof max_chars === 'number' ? max_chars : DEFAULT_READ_CHARS
        const { session: page } = await session.pages.getSession(pageId)
        const result = await page.Runtime.evaluate({
          expression: buildContentMarkdownExpression({}),
          returnByValue: true,
        })
        if (result.exceptionDetails) {
          throw new Error(
            result.exceptionDetails.exception?.description ??
              result.exceptionDetails.text,
          )
        }
        const text = ((result.result?.value as string) ?? '').trim()
        const header = `tab ${pageId}: ${await describe(pageId)} -- ${text.length} chars total${
          text.length > cap ? `, first ${cap} shown` : ''
        }`
        return `${header}\n\n${text.slice(0, cap) || '(empty)'}`
      },
    },
    {
      name: 'find',
      description:
        'Find up to 20 interactive elements on a tab whose role or text matches query; answers one per line as ref, role and text. Refs are what click and type_text take.',
      input: z.object({
        tab_id: tabId,
        query: z.string().describe('Case-insensitive text to match.'),
      }),
      handler: async ({ tab_id, query }) => {
        const pageId = await resolveTab(tab_id as number | undefined)
        const { text } = await session.observe(pageId).snapshot()
        const needle = String(query).toLowerCase()
        const matches: string[] = []
        for (const line of text.split('\n')) {
          const ref = /\[ref=(e\d+)\]/.exec(line)
          if (!ref) continue
          const body = line
            .replace(/^\s*-\s*/, '')
            .replace(/\s*\[ref=e\d+\].*$/, '')
          if (!body.toLowerCase().includes(needle)) continue
          matches.push(`${ref[1]}  ${body}`)
          if (matches.length >= MAX_FIND_RESULTS) break
        }
        if (matches.length === 0)
          return `no interactive element matches "${query}" on tab ${pageId}`
        return matches.join('\n')
      },
    },
    {
      name: 'click',
      description:
        'Click the element with the given ref (from find) on a tab and answer the tab url and title afterwards.',
      input: z.object({
        tab_id: tabId,
        ref: z.string().describe('Element ref from find, e.g. "e12".'),
      }),
      handler: async ({ tab_id, ref }) => {
        const pageId = await resolveTab(tab_id as number | undefined)
        await session.input(pageId).click(String(ref))
        return `clicked ${ref}; tab ${pageId}: ${await describe(pageId)}`
      },
    },
    {
      name: 'type_text',
      description:
        'Type text into the element with the given ref (from find) on a tab, replacing its value, and press Enter when submit is true.',
      input: z.object({
        tab_id: tabId,
        ref: z.string().describe('Element ref from find, e.g. "e12".'),
        text: z.string(),
        submit: z
          .boolean()
          .optional()
          .describe('Press Enter after typing. Default false.'),
      }),
      handler: async ({ tab_id, ref, text, submit }) => {
        const pageId = await resolveTab(tab_id as number | undefined)
        const input = session.input(pageId)
        await input.fill(String(ref), String(text), { clear: true })
        if (submit === true) await input.press('Enter')
        return `typed into ${ref}${submit === true ? ' and pressed Enter' : ''}; tab ${pageId}: ${await describe(pageId)}`
      },
    },
    {
      name: 'screenshot',
      description:
        'Save a PNG screenshot of a tab under the browser data directory and answer the file path.',
      input: z.object({ tab_id: tabId }),
      handler: async ({ tab_id }) => {
        const pageId = await resolveTab(tab_id as number | undefined)
        const shot = await session.screenshot(pageId, { format: 'png' })
        const path = await writeTempToolOutputBinaryFile({
          toolName: 'bridge-screenshot',
          extension: 'png',
          content: Buffer.from(shot.data, 'base64'),
        })
        return path
      },
    },
  ]
}
