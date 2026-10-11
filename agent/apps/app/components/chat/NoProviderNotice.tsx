/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { ArrowRight, PlugZap } from '@browseros/icons'
import type { FC } from 'react'
import { cn } from '@/lib/utils'

const SETUP_URL = '/app.html#/onboarding/ai'

export interface NoProviderNoticeProps {
  /**
   * Raised treatment shown after a send was refused, rather than the resting
   * notice. One element either way: stacking a second message would say the
   * same thing twice.
   */
  blocked?: boolean
  /** `inline` drops the outer margin for composers that own their gutter. */
  variant?: 'panel' | 'inline'
  className?: string
}

function headline(blocked: boolean): string {
  return blocked ? t('shNothingToSendThisTo') : t('shConnectAProviderToStart')
}

function body(blocked: boolean): string {
  return blocked ? t('shConnectThenSendAgain') : t('shConnectAnLlmProviderOr')
}

/**
 * Shown on every chat surface while nothing is connected.
 *
 * The composer stays usable behind it on purpose. Replacing the whole surface
 * would leave nowhere to write the thing you came to write, and no send to
 * answer, so someone who pressed send would get silence.
 */
export const NoProviderNotice: FC<NoProviderNoticeProps> = ({
  blocked = false,
  variant = 'panel',
  className,
}) => (
  <div
    role={blocked ? 'alert' : 'status'}
    className={cn(
      'flex items-start gap-3 rounded-lg border p-3',
      blocked
        ? 'border-[var(--accent-brand)]/50 bg-[var(--accent-brand)]/10'
        : 'border-border bg-card',
      variant === 'panel' && 'mx-4',
      className,
    )}
  >
    <PlugZap
      aria-hidden
      className={cn(
        'mt-0.5 size-4 shrink-0',
        blocked ? 'text-[var(--accent-brand-ink)]' : 'text-muted-foreground',
      )}
    />
    <div className="min-w-0 flex-1 space-y-1">
      <p className="font-medium text-foreground text-sm">{headline(blocked)}</p>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {body(blocked)}
      </p>
      <a
        href={SETUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 pt-0.5 font-medium text-[var(--accent-brand-ink)] text-xs underline-offset-4 hover:underline"
      >
        {t('shConnectAProvider')}
        <ArrowRight aria-hidden className="size-3" />
      </a>
    </div>
  </div>
)
