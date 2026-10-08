/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

declare namespace chrome.browserOS {
  interface PrefObject {
    key: string
    type: string
    value: unknown
  }

  function getPref(name: string, callback: (pref: PrefObject) => void): void
}
