/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import type { Comparison } from '@browseros/shopping/compare'
import type { ProductIdentity } from '@browseros/shopping/product'
import { type Region, regionForLocale } from '@browseros/shopping/stores'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  productByTabStorage,
  regionOverrideStorage,
} from '@/lib/smart-compare/productStorage'
import { useAgentServerUrl } from '@/modules/browseros/agent-server-url.hooks'

/** The product the active tab is showing, as the content script last saw it. */
export function useActiveProduct(): {
  product: ProductIdentity | null
  tabId?: number
} {
  const [tabId, setTabId] = useState<number | undefined>()
  const [map, setMap] = useState<Record<string, ProductIdentity>>({})
  useEffect(() => {
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => setTabId(tabs[0]?.id))
    const onActivated = (info: { tabId: number }) => setTabId(info.tabId)
    chrome.tabs.onActivated.addListener(onActivated)
    void productByTabStorage.getValue().then(setMap)
    const unwatch = productByTabStorage.watch((next) => setMap(next ?? {}))
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated)
      unwatch()
    }
  }, [])
  return {
    product: tabId === undefined ? null : (map[String(tabId)] ?? null),
    tabId,
  }
}

/** The region Smart Compare searches: the person's choice, else the browser's language. */
export function useCompareRegion(): [Region, (region: Region | null) => void] {
  const automatic = regionForLocale(chrome.i18n.getUILanguage())
  const [override, setOverride] = useState<Region | null>(null)
  useEffect(() => {
    void regionOverrideStorage.getValue().then(setOverride)
    return regionOverrideStorage.watch((next) => setOverride(next ?? null))
  }, [])
  return [
    override ?? automatic,
    (region) =>
      void regionOverrideStorage.setValue(region === automatic ? null : region),
  ]
}

export function useCompare() {
  const { baseUrl } = useAgentServerUrl()
  return useMutation<
    Comparison,
    Error,
    { product: ProductIdentity; region: Region; fresh?: boolean }
  >({
    mutationFn: async (input) => {
      if (!baseUrl) throw new Error('Redrob is still starting')
      const response = await fetch(`${baseUrl}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, groupTitle: t('compareTitle') }),
      })
      if (!response.ok) throw new Error(`compare failed: ${response.status}`)
      return (await response.json()) as Comparison
    },
  })
}
