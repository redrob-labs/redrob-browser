/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TaskStatus, TaskSummary } from '@/modules/api/audit.hooks'
import { formatDuration, statusOptions } from './audit.helpers'
import { paramsToFilters } from './audit.search-params'

function task(status: TaskStatus): TaskSummary {
  return {
    sessionId: `${status}-session`,
    slug: 'codex',
    label: 'Codex',
    name: 'Task',
    startedAt: 1,
    durationMs: 1,
    dispatchCount: 1,
    toolSequence: ['tabs'],
    status,
    errorCount: 0,
  }
}

describe('statusOptions', () => {
  it('counts cancelled sessions alongside the existing statuses', () => {
    expect(
      statusOptions([
        task('live'),
        task('done'),
        task('failed'),
        task('cancelled'),
        task('cancelled'),
      ]),
    ).toEqual([
      { status: 'live', count: 1 },
      { status: 'done', count: 1 },
      { status: 'failed', count: 1 },
      { status: 'cancelled', count: 2 },
    ])
  })
})

describe('paramsToFilters', () => {
  it('preserves the cancelled status filter', () => {
    expect(
      paramsToFilters(new URLSearchParams('status=cancelled')).status,
    ).toBe('cancelled')
  })
})

describe('formatDuration', () => {
  it('formats each magnitude through the message table, not a literal', () => {
    expect(formatDuration(-5)).toBe('0ms')
    expect(formatDuration(800)).toBe('800ms')
    expect(formatDuration(59_000)).toBe('59s')
    expect(formatDuration(240_000)).toBe('4m 0s')
    expect(formatDuration(3_660_000)).toBe('1h 1m')
  })

  it('has a Korean unit for every magnitude, so a duration never reads as English in a Korean UI', () => {
    const tsv = readFileSync(
      join(import.meta.dir, '../../../../../l10n/extension/80-claw-app.tsv'),
      'utf8',
    )
    const korean = (key: string) =>
      tsv
        .split('\n')
        .find((line) => line.startsWith(`${key}\t`))
        ?.split('\t')[2]
    expect(korean('clDurationSeconds')).toBe('$1초')
    expect(korean('clDurationMinutes')).toBe('$1분 $2초')
    expect(korean('clDurationHours')).toBe('$1시간 $2분')
  })
})
