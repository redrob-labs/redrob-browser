/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The product each tab is showing, by tab id, written by the product content script. Local storage
 * (as selected text is) because content scripts cannot write session storage; entries are removed
 * when the tab leaves the product or closes.
 */

import type { ProductIdentity } from '@browseros/shopping/product'
import type { Region } from '@browseros/shopping/stores'
import { storage } from '@wxt-dev/storage'

export const productByTabStorage = storage.defineItem<
  Record<string, ProductIdentity>
>('local:smartCompare.productByTab', { fallback: {} })

/** The person's region override; null follows the browser's language. */
export const regionOverrideStorage = storage.defineItem<Region | null>(
  'local:smartCompare.region',
  { fallback: null },
)

/** The badge on the toolbar button, in the region's currency: the button says what it would do. */
export const BADGE_FOR_REGION: Record<Region, string> = {
  KR: '₩',
  IN: '₹',
  US: '$',
}
