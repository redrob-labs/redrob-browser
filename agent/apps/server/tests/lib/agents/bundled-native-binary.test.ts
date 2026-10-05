/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withBundledNativeBinaryPath } from '../../../src/lib/agents/host-acp/bundled-native-binary'

describe('withBundledNativeBinaryPath', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    )
    tempDirs.length = 0
  })

  it('prepends the bundled CLI directory once', async () => {
    const resourcesDir = await mkdtemp(join(tmpdir(), 'browseros-native-cli-'))
    tempDirs.push(resourcesDir)
    const bundledDir = join(resourcesDir, 'bin', 'third_party')
    await mkdir(bundledDir, { recursive: true })

    expect(
      withBundledNativeBinaryPath({
        resourcesDir,
        env: { PATH: `/opt/bin:${bundledDir}` },
        platform: 'linux',
      }),
    ).toEqual({
      PATH: `${bundledDir}:/opt/bin`,
    })
  })
})
