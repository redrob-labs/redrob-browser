/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/modules/api/audit.hooks'

interface StatusBadgeProps {
  status: TaskStatus
  className?: string
}

const STYLES: Record<TaskStatus, string> = {
  // The system's badge tones: Live keeps the solid green plate, the rest are subtle.
  live: 'rr-badge--solid rr-badge--success',
  done: 'rr-badge--subtle rr-badge--success',
  failed: 'rr-badge--subtle rr-badge--danger',
  cancelled: 'rr-badge--subtle rr-badge--neutral',
}

const LABELS: Record<TaskStatus, () => string> = {
  live: () => t('clLive'),
  done: () => t('clDone'),
  failed: () => t('clFailed'),
  cancelled: () => t('clStopped'),
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn('rr-badge rr-badge--sm', STYLES[status], className)}>
      {LABELS[status]()}
    </span>
  )
}
