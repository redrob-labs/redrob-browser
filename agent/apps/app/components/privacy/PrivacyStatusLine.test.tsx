/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PrivacyStatus } from '@/modules/privacy/privacy.types'
import { privacyItem } from './PrivacyStatusLine'
import { PrivateMessageText } from './PrivateMessageText'

const base: PrivacyStatus = {
  level: 'high',
  names: [],
  neverReadSites: [],
  keptThisWeek: 4,
  detector: { state: 'ready', model: 'm' },
  coverage: { redrobAgent: true, externalAgents: false },
}

const panel = (item: ReturnType<typeof privacyItem>) =>
  renderToStaticMarkup(createElement('div', null, item.panel))

describe('the privacy item in the status line', () => {
  it('is on, at the level, running here, with this week’s count', () => {
    const item = privacyItem(base, undefined, () => {})
    expect(item).toMatchObject({
      value: 'High',
      tone: 'safe',
      level: { n: 2, of: 3 },
    })
    const html = panel(item)
    expect(html).toContain('Privacy Protection is on: High')
    expect(html).toContain('Running on this computer')
    expect(html).toContain('Private details kept from AI this week: 4')
  })

  it('never looks on for an external agent', () => {
    const item = privacyItem(base, 'Claude Code', () => {})
    expect(item).toMatchObject({ value: 'Not checked', tone: 'warn' })
    expect(item.level).toBeUndefined()
    expect(panel(item)).toContain('Claude Code uses its own AI')
  })

  it('says Off plainly, and says when the model is not ready yet', () => {
    expect(
      privacyItem({ ...base, level: 'off' }, undefined, () => {}).value,
    ).toBe('Off')
    const downloading = privacyItem(
      {
        ...base,
        level: 'strict',
        detector: { state: 'downloading', receivedBytes: 50, totalBytes: 200 },
      },
      undefined,
      () => {},
    )
    expect(panel(downloading)).toContain(
      'Getting the on-device model ready: 25%',
    )
  })
})

describe('PrivateMessageText', () => {
  it('marks a detail and says what the AI saw, reachable by keyboard', () => {
    const html = renderToStaticMarkup(
      createElement(PrivateMessageText, {
        pieces: [
          { kind: 'text', text: 'Mail ' },
          {
            kind: 'private',
            text: 'a@b.co',
            as: '[EMAIL_1]',
            category: 'EMAIL',
          },
        ],
      }),
    )
    expect(html).toContain('class="rr-private" tabindex="0"')
    expect(html).toContain('a@b.co')
    expect(html).toContain('Kept private. The AI saw [EMAIL_1].')
  })
})
