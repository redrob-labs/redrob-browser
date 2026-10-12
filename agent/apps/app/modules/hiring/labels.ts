/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { type MessageKey, t } from '@browseros/i18n'
import type {
  HiringEvent,
  HiringStage,
  SetAsideReason,
  SourceStatus,
} from './hiring.hooks'

export const STAGE_LABEL: Record<HiringStage, MessageKey> = {
  found: 'hiringStageFound',
  shortlisted: 'hiringStageShortlisted',
  contacted: 'hiringStageContacted',
  replied: 'hiringStageReplied',
  interview: 'hiringStageInterview',
  saved: 'hiringStageSaved',
  'set-aside': 'hiringStageSetAside',
}

/** Pipeline order, left to right; set aside last and apart. */
export const STAGES: readonly HiringStage[] = [
  'found',
  'shortlisted',
  'contacted',
  'replied',
  'interview',
  'saved',
  'set-aside',
]

export const SET_ASIDE_REASONS: ReadonlyArray<{
  id: SetAsideReason
  label: MessageKey
}> = [
  { id: 'doesnt-meet-must-have', label: 'hiringReasonMust' },
  { id: 'not-looking', label: 'hiringReasonNotLooking' },
  { id: 'contacted-elsewhere', label: 'hiringReasonElsewhere' },
  { id: 'other', label: 'hiringReasonOther' },
]

const REFUSAL: Record<string, MessageKey> = {
  'protected-trait': 'hiringRefusedTrait',
  'age-proxy': 'hiringRefusedAge',
  'origin-proxy': 'hiringRefusedOrigin',
  'family-proxy': 'hiringRefusedFamily',
  'distance-proxy': 'hiringRefusedDistance',
  'school-name': 'hiringRefusedSchool',
}

export function refusalText(text: string, reason: string): string {
  return t('hiringRefused', text, t(REFUSAL[reason] ?? 'hiringRefusedTrait'))
}

export function sourceProblem(status: SourceStatus): string {
  switch (status) {
    case 'sign-in':
      return t('hiringStatusSignIn')
    case 'blocked':
      return t('hiringStatusBlocked')
    case 'none':
    case 'unknown-site':
      return t('hiringStatusNone')
    case 'never-read':
      return t('hiringStatusNeverRead')
    default:
      return t('hiringStatusFailed')
  }
}

export function screenProblem(
  reason: 'privacy' | 'no-model' | 'model-failed',
): string {
  return reason === 'privacy'
    ? t('hiringScreenPrivacy')
    : reason === 'no-model'
      ? t('hiringScreenNoModel')
      : t('hiringScreenFailed')
}

const REASON_LABEL = Object.fromEntries(
  SET_ASIDE_REASONS.map((r) => [r.id, r.label]),
)

/** One line of the hiring record, in the person's language. Never names a candidate. */
export function eventText(event: HiringEvent): string {
  const d = event.detail ?? {}
  switch (event.kind) {
    case 'role-created':
      return t('hiringEventRoleCreated')
    case 'criteria-changed':
      return t('hiringEventCriteria', Number(d.version ?? 0))
    case 'found':
      return t('hiringEventFound', String(d.site ?? ''))
    case 'evaluated':
      return t(
        'hiringEventEvaluated',
        Number(d.met ?? 0),
        Number(d.judged ?? 0),
      )
    case 'stage':
      return t(
        'hiringEventStage',
        t(STAGE_LABEL[d.to as HiringStage] ?? 'hiringStageFound'),
      )
    case 'set-aside':
      return t(
        'hiringEventSetAside',
        t(REASON_LABEL[String(d.reason)] ?? 'hiringReasonOther'),
      )
    case 'opted-out':
      return t('hiringEventOptedOut')
    case 'person-deleted':
      return t('hiringEventDeleted')
    case 'retention':
      return t('hiringEventRetention', Number(d.deleted ?? 0))
    case 'mode-changed':
      return t('hiringEventMode')
    default:
      return t('hiringEventOther')
  }
}
