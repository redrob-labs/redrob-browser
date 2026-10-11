/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The job posting each tab is showing, by tab id, written by the job content script (local storage,
 * as Smart Compare's product is, because content scripts cannot write session storage). And the batch
 * the person approved on the Job Apply page, which the side panel works through.
 */

import type { JobPosting } from '@browseros/jobs/posting'
import type { ApplyMode } from '@browseros/jobs/profile'
import { storage } from '@wxt-dev/storage'

export const postingByTabStorage = storage.defineItem<
  Record<string, JobPosting>
>('local:jobs.postingByTab', { fallback: {} })

export interface ApprovedBatch {
  ids: string[]
  mode: Exclude<ApplyMode, 'review'>
  /** How many of `ids` have been started. */
  next: number
  sent: number
}

export const approvedBatchStorage = storage.defineItem<ApprovedBatch | null>(
  'local:jobs.batch',
  { fallback: null },
)
