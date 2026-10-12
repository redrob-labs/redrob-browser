/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The person page each tab shows, by tab id, written by the hiring content script. URL and site
 * only: what is on the page is read when the recruiter asks, not stored here.
 */

import { storage } from '@wxt-dev/storage'

export interface HiringPage {
  url: string
  site: string
  siteName: string
}

export const hiringPageByTabStorage = storage.defineItem<
  Record<string, HiringPage>
>('local:hiring.pageByTab', { fallback: {} })
