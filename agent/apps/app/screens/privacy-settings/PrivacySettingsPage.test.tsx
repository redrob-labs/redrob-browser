/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it, mock } from 'bun:test'
import { createElement, type FC } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PrivacyStatus } from '@/modules/privacy/privacy.types'

mock.module('@/modules/privacy/privacy.hooks', () => ({
  usePrivacyStatus: () => ({}),
  useUpdatePrivacy: () => ({ mutate: () => {}, isPending: false }),
  useRetryPrivacyModel: () => ({ mutate: () => {} }),
}))

const { PrivacySettingsView, parseNames, formatNames } = (await import(
  './PrivacySettingsPage'
)) as {
  PrivacySettingsView: FC<{ status: PrivacyStatus }>
  parseNames: (text: string) => string[][]
  formatNames: (names: string[][]) => string
}

const status: PrivacyStatus = {
  level: 'standard',
  names: [['김지원', 'Jiwon Kim']],
  neverReadSites: ['mybank.com'],
  keptThisWeek: 7,
  detector: { state: 'not-loaded' },
  coverage: { redrobAgent: true, externalAgents: false },
}

describe('Settings, Privacy', () => {
  it('shows the level, the sites, the names and what it cannot cover', () => {
    const html = renderToStaticMarkup(
      createElement(PrivacySettingsView, { status }),
    )
    expect(html).toContain('Privacy Protection is on: Standard')
    expect(html).toContain('Private details kept from AI this week: 7')
    expect(html).toContain('Your level')
    expect(html).toContain('mybank.com')
    expect(html).toContain('Remove mybank.com')
    expect(html).toContain('김지원 | Jiwon Kim')
    expect(html).toContain('use their own AI and are not checked')
  })

  it('names stay grouped by line, every form on its line', () => {
    expect(parseNames('김지원 | Jiwon Kim\n\n  Acme  \n|')).toEqual([
      ['김지원', 'Jiwon Kim'],
      ['Acme'],
    ])
    expect(formatNames([['a', 'b'], ['c']])).toBe('a | b\nc')
  })

  it('says when the model failed and offers a retry, at High', () => {
    const html = renderToStaticMarkup(
      createElement(PrivacySettingsView, {
        status: {
          ...status,
          level: 'high',
          detector: { state: 'failed', reason: 'x' },
        },
      }),
    )
    expect(html).toContain('could not be set up')
    expect(html).toContain('Try again')
  })
})
