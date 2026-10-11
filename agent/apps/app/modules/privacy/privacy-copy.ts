/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { type MessageKey, t } from '@browseros/i18n'
import type { LabelCategory } from '@browseros/privacy/labels'
import type { PrivacyDetectorStatus, PrivacyLevel } from './privacy.types'

export const LEVEL_NAME: Record<PrivacyLevel, MessageKey> = {
  off: 'privacyLevelOff',
  standard: 'privacyLevelStandard',
  high: 'privacyLevelHigh',
  strict: 'privacyLevelStrict',
}

export const LEVEL_DETAIL: Record<PrivacyLevel, MessageKey> = {
  off: 'privacyLevelOffDetail',
  standard: 'privacyLevelStandardDetail',
  high: 'privacyLevelHighDetail',
  strict: 'privacyLevelStrictDetail',
}

const KIND: Record<LabelCategory, MessageKey> = {
  EMAIL: 'privacyKindEmail',
  PHONE: 'privacyKindPhone',
  CARD: 'privacyKindCard',
  RRN: 'privacyKindRrn',
  BRN: 'privacyKindBrn',
  ACCOUNT: 'privacyKindAccount',
  ADDRESS: 'privacyKindAddress',
  PERSON: 'privacyKindPerson',
  ORG: 'privacyKindOrg',
  TITLE: 'privacyKindTitle',
  AMOUNT: 'privacyKindAmount',
  SECRET: 'privacyKindSecret',
}

/** "email addresses, phone numbers" in the reader's language. */
export function kindsList(
  kinds: readonly LabelCategory[],
  locale: string,
): string {
  const names = kinds.map((kind) => t(KIND[kind]))
  try {
    return new Intl.ListFormat(locale, { type: 'conjunction' }).format(names)
  } catch {
    return names.join(', ')
  }
}

/**
 * What the model's state means for this level, in a sentence, or null when there is nothing to say:
 * Standard never uses the model, and a ready model needs no note.
 */
export function modelNote(
  level: PrivacyLevel,
  detector: PrivacyDetectorStatus,
): string | null {
  if (level !== 'high' && level !== 'strict') return null
  switch (detector.state) {
    case 'downloading':
      return t(
        'privacyModelDownloading',
        Math.floor(
          (100 * detector.receivedBytes) / Math.max(1, detector.totalBytes),
        ),
      )
    case 'failed':
      return t('privacyModelFailed')
    case 'absent':
      return t('privacyModelPatternsOnly')
    default:
      return null
  }
}
