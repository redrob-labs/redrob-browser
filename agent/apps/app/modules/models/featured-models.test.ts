/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { modelRows, REDROB_AUTO } from './featured-models'

describe('the Redrob model menu', () => {
  it('puts Auto first, then one model per lab', () => {
    const rows = modelRows(REDROB_AUTO, 'Redrob Auto')
    expect(rows[0]).toMatchObject({
      modelId: 'auto',
      name: 'Redrob Auto',
      kind: 'auto',
    })
    expect(rows.slice(1).map((r) => r.lab)).toEqual([
      'Anthropic',
      'OpenAI',
      'Google',
      'Meta',
      'SpaceXAI',
    ])
  })

  it('always shows the model in use, even when it is not recommended', () => {
    const rows = modelRows('deepseek/v4', 'Redrob Auto')
    expect(rows.at(-1)).toEqual({
      modelId: 'deepseek/v4',
      name: 'deepseek/v4',
      kind: 'current',
    })
    expect(modelRows('gpt-6-astra', 'Redrob Auto')).toHaveLength(6)
    expect(modelRows('redrob/auto', 'Redrob Auto')).toHaveLength(6)
  })
})
