/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Reads pages in the person's own browser without getting in their way: each page opens in a
 * background tab, in a collapsed group named for the work ("Smart Compare", "Talent Scout · Backend"),
 * is read once it has loaded, and is closed whatever happens. The person's own sessions and region
 * apply, which is why the reading happens here rather than from a server.
 *
 * Shared by Smart Compare and Talent Scout. It adds what reading people's profiles needs and a price
 * search did not:
 *   * sites AI never reads are refused before a tab is opened;
 *   * a per-site pace: one page at a time on a site, some seconds apart, jittered, so the reading
 *     looks like a person working and not like a crawler;
 *   * a per-site daily budget, after which the site is reported as at its limit, not retried.
 *
 * What it returns is the page's HTML or its rendered visible text (`innerText`), never both: text a
 * page hides from people (zero size, the background's colour) is not in innerText, which is how
 * candidate-written instructions addressed to AI tools stay out of what a model reads.
 */

import type { BrowserSession } from '@browseros/browser-core/core/session'
import { logger } from '../../lib/logger'

export class PageTimeoutError extends Error {}

/** The site is one the person listed as never to be read by AI. Nothing was opened. */
export class NeverReadSiteError extends Error {}

/** The site's daily read budget is used up. Nothing was opened. */
export class ReadBudgetError extends Error {}

export interface SitePace {
  /** Milliseconds between two reads on the same site: a random value in [min, max]. */
  minMs: number
  maxMs: number
  /** Reads a day on this site, counted from local midnight. */
  dailyBudget?: number
}

export interface ReadOptions {
  /** The tab group's title, in the person's language. */
  group: string
  timeoutMs: number
  /** `html` for parsers; `text` for anything a model reads. */
  as?: 'html' | 'text'
  /** Groups reads for pacing and budgets, e.g. "linkedin". Defaults to the URL's host. */
  site?: string
  pace?: SitePace
  /** Extra time after load for the page's scripts to render. */
  settleMs?: number
}

export interface ReadPage {
  url: string
  html?: string
  text?: string
}

interface TabGroup {
  groupId: string
}

/** No pause between reads: Smart Compare searches a different store in each tab. */
const NO_PACE: SitePace = { minMs: 0, maxMs: 0 }

export class BackgroundReader {
  private readonly groups = new Map<string, string>()
  /** Per site: the read in progress, so the next waits for it. */
  private readonly tails = new Map<string, Promise<unknown>>()
  private readonly lastRead = new Map<string, number>()
  private readonly used = new Map<string, { day: string; count: number }>()

  constructor(
    private readonly session: BrowserSession,
    private readonly options: {
      now?: () => number
      sleep?: (ms: number) => Promise<void>
      random?: () => number
      /** Sites AI never reads; checked on every read, so a change applies at once. */
      neverRead?: (url: string) => boolean
    } = {},
  ) {}

  private now(): number {
    return (this.options.now ?? Date.now)()
  }

  private sleep(ms: number): Promise<void> {
    return ms > 0
      ? (this.options.sleep ?? ((t) => Bun.sleep(t)))(ms)
      : Promise.resolve()
  }

  private siteOf(url: string, site?: string): string {
    if (site) return site
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return url
    }
  }

  /** Reads left today on `site`, or undefined when it has no budget. */
  remaining(site: string, pace: SitePace): number | undefined {
    if (pace.dailyBudget === undefined) return undefined
    const day = new Date(this.now()).toDateString()
    const used = this.used.get(site)
    return pace.dailyBudget - (used?.day === day ? used.count : 0)
  }

  read(url: string, options: ReadOptions): Promise<ReadPage> {
    if (this.options.neverRead?.(url)) {
      return Promise.reject(
        new NeverReadSiteError(
          `${new URL(url).hostname} is a site AI never reads`,
        ),
      )
    }
    const site = this.siteOf(url, options.site)
    const pace = options.pace ?? NO_PACE
    const previous = this.tails.get(site) ?? Promise.resolve()
    const run = previous
      .catch(() => {})
      .then(async () => {
        if ((this.remaining(site, pace) ?? 1) <= 0) {
          throw new ReadBudgetError(`today's reads on ${site} are used up`)
        }
        const last = this.lastRead.get(site)
        if (last !== undefined && pace.maxMs > 0) {
          const random = (this.options.random ?? Math.random)()
          const gap = pace.minMs + random * (pace.maxMs - pace.minMs)
          await this.sleep(last + gap - this.now())
        }
        const day = new Date(this.now()).toDateString()
        const used = this.used.get(site)
        this.used.set(site, {
          day,
          count: (used?.day === day ? used.count : 0) + 1,
        })
        try {
          return await this.open(url, options)
        } finally {
          this.lastRead.set(site, this.now())
        }
      })
    this.tails.set(site, run)
    return run
  }

  private async open(url: string, options: ReadOptions): Promise<ReadPage> {
    const pages = this.session.pages
    const pageId = await pages.newPage(url, { background: true })
    try {
      await this.group(pageId, options.group)
      const deadline = this.now() + options.timeoutMs
      // Pages render their content after load; wait for load, then a moment for scripts.
      while (true) {
        const info = await pages.refresh(pageId)
        if (info && !info.isLoading) break
        if (this.now() > deadline) throw new PageTimeoutError(url)
        await this.sleep(250)
      }
      await this.sleep(options.settleMs ?? 1_500)
      // A page can redirect to a listed site (a sign-in hop); it is not read either.
      const { session } = await pages.getSession(pageId)
      const result = await session.Runtime.evaluate({
        expression:
          options.as === 'text'
            ? '({ url: location.href, text: document.body ? document.body.innerText : "" })'
            : '({ url: location.href, html: document.documentElement.outerHTML })',
        returnByValue: true,
        timeout: 10_000,
      })
      const value = result.result?.value as ReadPage | undefined
      if (!value) throw new Error('the page could not be read')
      if (this.options.neverRead?.(value.url)) {
        throw new NeverReadSiteError(
          `${new URL(value.url).hostname} is a site AI never reads`,
        )
      }
      return value
    } finally {
      await pages.close(pageId).catch((error) =>
        logger.warn('a background tab could not be closed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  private async group(pageId: number, title: string): Promise<void> {
    const tabId = this.session.pages.getTabId(pageId)
    if (tabId === undefined) return
    const existing = this.groups.get(title)
    if (existing) {
      try {
        await this.session.cdp('Browser.addTabsToGroup', {
          groupId: existing,
          tabIds: [tabId],
        })
        return
      } catch {
        // The person closed or ungrouped it; make a new one.
        this.groups.delete(title)
      }
    }
    try {
      const { group } = (await this.session.cdp('Browser.createTabGroup', {
        tabIds: [tabId],
        title,
      })) as { group: TabGroup }
      this.groups.set(title, group.groupId)
      await this.session.cdp('Browser.updateTabGroup', {
        groupId: group.groupId,
        collapsed: true,
        color: 'grey',
      })
    } catch (error) {
      // Grouping is courtesy; a read never fails because a tab could not be grouped.
      logger.debug('a background tab could not be grouped', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
