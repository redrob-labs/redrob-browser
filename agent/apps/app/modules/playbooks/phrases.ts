/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import type { DraftPhrases } from '@browseros/playbooks/teach'

/** Teach Mode's step wording in the person's language. */
export function draftPhrases(): DraftPhrases {
  return {
    open: (place) => t('teachStepOpen', place),
    press: (name) => t('teachStepPress', name),
    enter: (input, field) => t('teachStepEnter', input, field),
    enterSecret: (field) => t('teachStepEnterSecret', field),
    submit: (name) =>
      name ? t('teachStepSubmit', name) : t('teachStepSubmitForm'),
    finalReason: t('teachReasonFinal'),
    secretReason: t('teachReasonSecret'),
    name: (site) =>
      site ? t('teachDraftName', site) : t('teachDraftNameNone'),
    purpose: (sites, inputs) =>
      inputs
        ? t('teachDraftPurposeInputs', sites, inputs)
        : t('teachDraftPurpose', sites),
  }
}
