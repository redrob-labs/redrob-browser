/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * One comparison: search each store for the product, keep the cheapest same-product listing per
 * store, and say plainly which stores were not checked. Fetching a page is the caller's (the server
 * opens it in the person's own browser); everything here is pure, so it is tested on saved pages.
 */

import { parseHTML } from 'linkedom'
import {
  extractListings,
  type MatchedListing,
  matchListing,
  pageProblem,
} from './listings'
import type { ProductIdentity } from './product'
import { type Region, type Store, searchQuery, storesFor } from './stores'

export type StoreOutcome =
  | {
      status: 'ok'
      best: MatchedListing
      variants: MatchedListing[]
      checked: number
    }
  | { status: 'none'; checked: number }
  | { status: 'blocked' | 'sign-in' | 'timeout' | 'failed'; reason?: string }

export interface StoreResult {
  store: Store['id']
  name: string
  searchUrl: string
  outcome: StoreOutcome
}

export interface Comparison {
  region: Region
  query: string
  product: ProductIdentity
  stores: StoreResult[]
  /** The cheapest same-product listing anywhere, if any store had one. */
  lowest?: { store: Store['id']; listing: MatchedListing }
  /** How much less than the page's own price, in the page's currency, when both are known. */
  saving?: number
  checkedAt: number
}

/** Loads a search page and returns its final URL and HTML; throws on timeout or failure. */
export type PageFetcher = (
  url: string,
  options: { timeoutMs: number },
) => Promise<{ url: string; html: string }>

export class PageTimeoutError extends Error {}

export function readSearchPage(
  identity: ProductIdentity,
  store: Store,
  page: { url: string; html: string },
): StoreOutcome {
  const { document } = parseHTML(page.html)
  const problem = pageProblem(document, page.url)
  const listings = extractListings(document, store, page.url)
  if (!listings.length && problem) return { status: problem }
  const matched = listings.map((listing) => matchListing(identity, listing))
  const same = matched
    .filter((listing) => listing.match === 'same')
    .sort((a, b) => a.price.amount - b.price.amount)
  const variants = matched
    .filter((listing) => listing.match === 'variant')
    .sort((a, b) => a.price.amount - b.price.amount)
    .slice(0, 3)
  const best = same[0]
  return best
    ? { status: 'ok', best, variants, checked: listings.length }
    : { status: 'none', checked: listings.length }
}

export async function compareProduct(
  identity: ProductIdentity,
  region: Region,
  fetchPage: PageFetcher,
  options: { timeoutMs?: number; now?: () => number } = {},
): Promise<Comparison> {
  const query = searchQuery(identity)
  const stores = storesFor(region)
  const results = await Promise.all(
    stores.map(async (store): Promise<StoreResult> => {
      const searchUrl = store.searchUrl(query)
      let outcome: StoreOutcome
      try {
        const page = await fetchPage(searchUrl, {
          timeoutMs: options.timeoutMs ?? 20_000,
        })
        outcome = readSearchPage(identity, store, page)
      } catch (error) {
        outcome =
          error instanceof PageTimeoutError
            ? { status: 'timeout' }
            : {
                status: 'failed',
                reason: error instanceof Error ? error.message : String(error),
              }
      }
      return { store: store.id, name: store.name, searchUrl, outcome }
    }),
  )
  let lowest: Comparison['lowest']
  for (const result of results) {
    if (result.outcome.status !== 'ok') continue
    const { best } = result.outcome
    if (!lowest || best.price.amount < lowest.listing.price.amount) {
      lowest = { store: result.store, listing: best }
    }
  }
  const pagePrice = identity.price
  const saving =
    lowest && pagePrice && pagePrice.currency === lowest.listing.price.currency
      ? Math.round((pagePrice.amount - lowest.listing.price.amount) * 100) / 100
      : undefined
  return {
    region,
    query,
    product: identity,
    stores: results,
    lowest,
    saving,
    checkedAt: (options.now ?? Date.now)(),
  }
}
