/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'

/** Shared status labels and colors for cockpit and audit surfaces. */

export type RunStatus =
  | 'running'
  | 'live'
  | 'needs-ok'
  | 'needs-human'
  | 'blocked'
  | 'stopped'
  | 'done'
  | 'asleep'
  | 'idle'
  | 'stuck'

export interface StatusMeta {
  label: string
  textClass: string
  bgClass: string
  pulse: boolean
}

export const STATUS_META: Record<RunStatus, StatusMeta> = {
  running: {
    label: t('clRunning'),
    textClass: 'text-green',
    bgClass: 'bg-green-tint',
    pulse: true,
  },
  live: {
    label: t('clLive'),
    textClass: 'text-green',
    bgClass: 'bg-green-tint',
    pulse: true,
  },
  'needs-ok': {
    label: t('clNeedsOk'),
    textClass: 'text-amber',
    bgClass: 'bg-amber-tint',
    pulse: false,
  },
  'needs-human': {
    label: t('clYourTurn'),
    textClass: 'text-amber',
    bgClass: 'bg-amber-tint',
    pulse: false,
  },
  blocked: {
    label: t('clBlocked'),
    textClass: 'text-red',
    bgClass: 'bg-red-tint',
    pulse: false,
  },
  stopped: {
    label: t('clStopped'),
    textClass: 'text-ink-3',
    bgClass: 'bg-bg-sunken',
    pulse: false,
  },
  done: {
    label: t('clCompleted'),
    textClass: 'text-green',
    bgClass: 'bg-green-tint',
    pulse: false,
  },
  asleep: {
    label: t('clAsleep'),
    textClass: 'text-ink-3',
    bgClass: 'bg-bg-sunken',
    pulse: false,
  },
  idle: {
    label: t('clIdle'),
    textClass: 'text-ink-3',
    bgClass: 'bg-bg-sunken',
    pulse: false,
  },
  stuck: {
    label: t('clStuck'),
    textClass: 'text-amber',
    bgClass: 'bg-amber-tint',
    pulse: false,
  },
}

export function isActiveStatus(status: RunStatus): boolean {
  return (
    status === 'running' ||
    status === 'live' ||
    status === 'needs-ok' ||
    status === 'needs-human'
  )
}

export function isEndedStatus(status: RunStatus): boolean {
  return status === 'done' || status === 'stopped'
}
