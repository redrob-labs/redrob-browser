/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Smart Compare: search each store in the person's own browser, in background tabs grouped as
 * "Smart Compare" and collapsed, read the results, close the tabs. The person's own sessions and
 * region apply, which is the point: it is the price they would actually be offered.
 *
 * No model is called. Matching is by model number, and a store that refused or asked to sign in is
 * reported as not checked rather than as "no cheaper price".
 */

import type { BrowserSession } from '@browseros/browser-core/core/session'
import {
  type Comparison,
  compareProduct,
  type PageFetcher,
  PageTimeoutError,
} from '@browseros/shopping/compare'
import type { ProductIdentity } from '@browseros/shopping/product'
import type { Region } from '@browseros/shopping/stores'
import { logger } from '../../lib/logger'

const CACHE_MS = 30 * 60_000
const CACHE_LIMIT = 200
const GROUP_TITLE = 'Smart Compare'

interface TabGroup {
  groupId: string
}

export class SmartCompare {
  private readonly cache = new Map<string, Comparison>()
  private readonly running = new Map<string, Promise<Comparison>>()
  private groupId: string | null = null

  constructor(
    private readonly session: BrowserSession,
    private readonly now: () => number = Date.now,
  ) {}

  private key(identity: ProductIdentity, region: Region): string {
    return `${region}|${identity.gtin ?? identity.models[0] ?? identity.title.toLowerCase()}`
  }

  /** The comparison, from the cache when it is under 30 minutes old unless `fresh`. */
  compare(
    identity: ProductIdentity,
    region: Region,
    options: { fresh?: boolean; groupTitle?: string } = {},
  ): Promise<Comparison> {
    const key = this.key(identity, region)
    const cached = this.cache.get(key)
    if (!options.fresh && cached && this.now() - cached.checkedAt < CACHE_MS) {
      // The page's own price may differ from the cached page's; the saving is the asker's.
      return Promise.resolve({
        ...cached,
        product: identity,
        saving: saving(identity, cached),
      })
    }
    const inFlight = this.running.get(key)
    if (inFlight) return inFlight
    const run = compareProduct(
      identity,
      region,
      this.fetcher(options.groupTitle),
      {
        now: this.now,
      },
    )
      .then((result) => {
        this.cache.set(key, result)
        while (this.cache.size > CACHE_LIMIT) {
          const oldest = this.cache.keys().next().value
          if (oldest === undefined) break
          this.cache.delete(oldest)
        }
        return result
      })
      .finally(() => this.running.delete(key))
    this.running.set(key, run)
    return run
  }

  /** Opens a search page in a background tab in the Smart Compare group, reads it, closes it. */
  private fetcher(groupTitle = GROUP_TITLE): PageFetcher {
    return async (url, { timeoutMs }) => {
      const pages = this.session.pages
      const pageId = await pages.newPage(url, { background: true })
      try {
        await this.group(pageId, groupTitle)
        const deadline = this.now() + timeoutMs
        // Search pages render their results after load; wait for load, then a moment for scripts.
        while (true) {
          const info = await pages.refresh(pageId)
          if (info && !info.isLoading) break
          if (this.now() > deadline) throw new PageTimeoutError(url)
          await Bun.sleep(250)
        }
        await Bun.sleep(1_500)
        const { session } = await pages.getSession(pageId)
        const result = await session.Runtime.evaluate({
          expression:
            '({ url: location.href, html: document.documentElement.outerHTML })',
          returnByValue: true,
          timeout: 10_000,
        })
        const value = result.result?.value as
          | { url: string; html: string }
          | undefined
        if (!value) throw new Error('the page could not be read')
        return value
      } finally {
        await pages.close(pageId).catch((error) =>
          logger.warn('Smart Compare could not close a tab', {
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      }
    }
  }

  private async group(pageId: number, title: string): Promise<void> {
    const tabId = this.session.pages.getTabId(pageId)
    if (tabId === undefined) return
    try {
      if (this.groupId) {
        await this.session.cdp('Browser.addTabsToGroup', {
          groupId: this.groupId,
          tabIds: [tabId],
        })
        return
      }
      throw new Error('no group yet')
    } catch {
      try {
        const { group } = (await this.session.cdp('Browser.createTabGroup', {
          tabIds: [tabId],
          title,
        })) as { group: TabGroup }
        this.groupId = group.groupId
        await this.session.cdp('Browser.updateTabGroup', {
          groupId: group.groupId,
          collapsed: true,
          color: 'grey',
        })
      } catch (error) {
        // Grouping is courtesy; a comparison never fails because a tab could not be grouped.
        logger.debug('Smart Compare could not group a tab', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
}

function saving(
  identity: ProductIdentity,
  result: Comparison,
): number | undefined {
  const own = identity.price
  const low = result.lowest?.listing.price
  return own && low && own.currency === low.currency
    ? Math.round((own.amount - low.amount) * 100) / 100
    : undefined
}
