/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The starter questions and statuses in the person's language. The answer bank keeps the English
 * question (it is model input and matched against forms with its aliases); the screen shows these.
 */

import { type MessageKey, t } from '@browseros/i18n'
import type {
  Application,
  ApplicationStatus,
} from '@browseros/jobs/applications'
import type { Answer } from '@browseros/jobs/profile'

const QUESTION: Record<string, MessageKey> = {
  phone: 'jobsQPhone',
  email: 'jobsQEmail',
  linkedin: 'jobsQLinkedin',
  authorised: 'jobsQAuthorised',
  sponsorship: 'jobsQSponsorship',
  notice: 'jobsQNotice',
  salary: 'jobsQSalary',
  current_salary: 'jobsQCurrentSalary',
  years: 'jobsQYears',
  relocate: 'jobsQRelocate',
  gender: 'jobsQGender',
  veteran: 'jobsQVeteran',
  disability: 'jobsQDisability',
  ethnicity: 'jobsQEthnicity',
}

export function questionLabel(answer: Pick<Answer, 'id' | 'question'>): string {
  const key = QUESTION[answer.id]
  return key ? t(key) : answer.question
}

export const STATUS_LABEL: Record<ApplicationStatus, MessageKey> = {
  queued: 'jobsStatusQueued',
  filling: 'jobsStatusFilling',
  'needs-you': 'jobsStatusNeedsYou',
  ready: 'jobsStatusReady',
  sent: 'jobsStatusSent',
  failed: 'jobsStatusFailed',
  skipped: 'jobsStatusSkipped',
}

/** Badge tone per status: the design system's .rr-badge modifiers. */
export const STATUS_TONE: Record<ApplicationStatus, string> = {
  queued: 'rr-badge--subtle rr-badge--neutral',
  filling: 'rr-badge--subtle rr-badge--brand',
  'needs-you': 'rr-badge--subtle rr-badge--warning',
  ready: 'rr-badge--subtle rr-badge--brand',
  sent: 'rr-badge--subtle rr-badge--success',
  failed: 'rr-badge--subtle rr-badge--danger',
  skipped: 'rr-badge--subtle rr-badge--neutral',
}

/** What needs the person first, then what is in progress, then the record. */
const ORDER: Record<ApplicationStatus, number> = {
  'needs-you': 0,
  ready: 1,
  filling: 2,
  queued: 3,
  failed: 4,
  sent: 5,
  skipped: 6,
}

export function sortApplications(list: readonly Application[]): Application[] {
  return [...list].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || b.updatedAt - a.updatedAt,
  )
}
