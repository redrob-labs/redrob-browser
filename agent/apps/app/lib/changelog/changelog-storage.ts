/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { storage } from '@wxt-dev/storage'

const changelogShownStorage = storage.defineItem<string[]>(
  'local:changelogShownVersions',
  { fallback: [] },
)

export async function hasShownChangelog(version: string): Promise<boolean> {
  const shown = await changelogShownStorage.getValue()
  return shown.includes(version)
}

export async function markChangelogShown(version: string): Promise<void> {
  const shown = await changelogShownStorage.getValue()
  if (!shown.includes(version)) {
    await changelogShownStorage.setValue([...shown, version])
  }
}
