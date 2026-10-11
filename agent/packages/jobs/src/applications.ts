/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The applications: one record per job, from queued to sent, with the receipt kept on this computer.
 */

import type { JobPosting } from './posting'

export type ApplicationStatus =
  | 'queued'
  | 'filling'
  | 'needs-you'
  | 'ready'
  | 'sent'
  | 'failed'
  | 'skipped'

export interface Receipt {
  /** Every field Redrob filled, by its label, with what it put there. */
  fields: Array<{ field: string; value: string }>
  /** File name of the screenshot taken when the application was sent. */
  screenshot?: string
  sentAt: number
}

export interface Application {
  id: string
  posting: JobPosting
  status: ApplicationStatus
  /** Why it needs the person, or why it failed, in words. */
  note?: string
  conversationId?: string
  receipt?: Receipt
  createdAt: number
  updatedAt: number
}

/** Company and title folded, so the same role reached from two sites is one application. */
export function dedupeKey(
  posting: Pick<JobPosting, 'company' | 'title'>,
): string {
  const fold = (s: string) =>
    s
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\b(inc|llc|ltd|corp|co|gmbh|plc)\b\.?|주식회사|\(주\)|㈜/g, '')
      .replace(
        /\b(senior|sr|junior|jr|lead|staff|principal)\b|시니어|주니어/g,
        (m) => m,
      )
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  return `${fold(posting.company)}|${fold(posting.title)}`
}

export function sentToday(
  applications: readonly Application[],
  now: number,
): number {
  const day = new Date(now).toDateString()
  return applications.filter(
    (a) =>
      a.status === 'sent' &&
      a.receipt &&
      new Date(a.receipt.sentAt).toDateString() === day,
  ).length
}

export type QueueRefusal = 'duplicate' | 'daily-cap'

export function canQueue(
  applications: readonly Application[],
  posting: JobPosting,
  options: { automatic: boolean; dailyCap: number; now: number },
): QueueRefusal | null {
  const key = dedupeKey(posting)
  if (
    applications.some(
      (a) =>
        a.status !== 'skipped' &&
        a.status !== 'failed' &&
        dedupeKey(a.posting) === key,
    )
  ) {
    return 'duplicate'
  }
  if (
    options.automatic &&
    sentToday(applications, options.now) >= options.dailyCap
  )
    return 'daily-cap'
  return null
}
