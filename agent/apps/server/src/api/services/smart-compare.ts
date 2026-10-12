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
import {
  BackgroundReader,
  PageTimeoutError as ReaderTimeoutError,
} from './background-reader'

const CACHE_MS = 30 * 60_000
const CACHE_LIMIT = 200
const GROUP_TITLE = 'Smart Compare'

export class SmartCompare {
  private readonly cache = new Map<string, Comparison>()
  private readonly running = new Map<string, Promise<Comparison>>()
  private readonly reader: BackgroundReader

  constructor(
    session: BrowserSession | BackgroundReader,
    private readonly now: () => number = Date.now,
  ) {
    this.reader =
      session instanceof BackgroundReader
        ? session
        : new BackgroundReader(session, { now })
  }

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

  /** Each search page through the shared reader, in the Smart Compare group. */
  private fetcher(groupTitle = GROUP_TITLE): PageFetcher {
    return async (url, { timeoutMs }) => {
      try {
        const page = await this.reader.read(url, {
          group: groupTitle,
          timeoutMs,
          as: 'html',
        })
        return { url: page.url, html: page.html ?? '' }
      } catch (error) {
        // compareProduct reports its own timeout type as "timeout" rather than "failed".
        if (error instanceof ReaderTimeoutError) throw new PageTimeoutError(url)
        throw error
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
