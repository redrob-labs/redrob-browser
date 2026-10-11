/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { regionForLocale } from '@browseros/shopping/stores'
import {
  BADGE_FOR_REGION,
  productByTabStorage,
  regionOverrideStorage,
} from './productStorage'

/** Keeps the toolbar badge on tabs showing a product, and forgets closed tabs. */
export function startSmartCompareBadge(): void {
  const paint = async (map: Record<string, unknown>) => {
    const region =
      (await regionOverrideStorage.getValue()) ??
      regionForLocale(chrome.i18n.getUILanguage())
    const tabs = await chrome.tabs.query({})
    for (const tab of tabs) {
      if (tab.id === undefined) continue
      const on = String(tab.id) in map
      await chrome.action
        .setBadgeText({
          tabId: tab.id,
          text: on ? BADGE_FOR_REGION[region] : '',
        })
        .catch(() => {})
    }
  }
  void chrome.action
    .setBadgeBackgroundColor({ color: '#2B52FF' })
    .catch(() => {})
  void productByTabStorage.getValue().then(paint)
  productByTabStorage.watch((map) => void paint(map ?? {}))
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const map = await productByTabStorage.getValue()
    if (!(String(tabId) in map)) return
    delete map[String(tabId)]
    await productByTabStorage.setValue(map)
  })
}
