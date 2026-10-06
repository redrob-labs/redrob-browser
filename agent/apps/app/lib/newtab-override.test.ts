/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The new tab is this extension's Ask / Search page.
 *
 * The browser only honours a new-tab override from this extension's id
 * (extension_url_overrides_registrar.cc), so without the manifest entry Ctrl+T
 * falls back to the stock Google page. That is the failure this guards: the
 * override was once removed on the belief that the browser shipped its own page.
 */

import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const config = readFileSync(
  join(import.meta.dir, '..', 'wxt.config.ts'),
  'utf8',
)

describe('new tab override', () => {
  it('points the new tab at the app page', () => {
    expect(config).toMatch(
      /chrome_url_overrides:\s*\{\s*newtab:\s*'app\.html',?\s*\}/,
    )
  })
})
