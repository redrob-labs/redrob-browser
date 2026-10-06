/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

const CHANGELOG_BASE_URL = 'https://docs.browseros.com/changelog'

type ChangelogVersionConfig = {
  showChangelog: true
  anchor?: string
}

/**
 * Whitelist of extension versions that should show changelog.
 * Only versions in this list will trigger changelog notification.
 * Unlisted versions = no changelog shown.
 *
 * @example
 * '0.0.21': { showChangelog: true }  // opens base changelog URL
 * '0.0.25': { showChangelog: true, anchor: 'v0-0-25' }  // opens changelog#v0-0-25
 */
const CHANGELOG_VERSIONS: Record<string, ChangelogVersionConfig> = {}

export function getChangelogUrl(version: string): string {
  const config = CHANGELOG_VERSIONS[version]
  if (!config?.anchor) return CHANGELOG_BASE_URL
  return `${CHANGELOG_BASE_URL}#${config.anchor}`
}

export function shouldShowChangelog(version: string): boolean {
  return CHANGELOG_VERSIONS[version]?.showChangelog === true
}
