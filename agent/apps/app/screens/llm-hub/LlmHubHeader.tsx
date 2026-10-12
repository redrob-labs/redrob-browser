/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { MessageSquare } from '@browseros/icons'
import type { FC } from 'react'

export const LlmHubHeader: FC = () => {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-brand)]/10">
          <MessageSquare className="h-6 w-6 text-[var(--accent-brand-ink)]" />
        </div>
        <div>
          <h2 className="mb-1 font-semibold text-xl">{t('stLlmChatHub')}</h2>
          <p className="text-muted-foreground text-sm">
            {t('stCurateAndConfigureYourFavourite')}
          </p>
        </div>
      </div>
    </div>
  )
}
