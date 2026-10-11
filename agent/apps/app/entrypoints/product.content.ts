/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Notices when a page is about one product, so the side panel can offer Smart Compare. Reads the
 * page's own structured data only; nothing is sent anywhere until the person asks to compare.
 */

import { detectProduct } from '@browseros/shopping/product'
import {
  RuntimeMessageType,
  sendRuntimeMessage,
} from '@/lib/messaging/runtime/runtimeMessages'
import { productByTabStorage } from '@/lib/smart-compare/productStorage'

export default defineContentScript({
  matches: ['https://*/*'],
  runAt: 'document_idle',
  async main(ctx) {
    const response = await sendRuntimeMessage(RuntimeMessageType.getTabId)
    const tabId = response?.tabId
    if (!tabId) return
    const key = String(tabId)
    let last = ''

    const check = async () => {
      const identity = detectProduct(document, location.href)
      const signature = identity ? `${identity.url}|${identity.title}` : ''
      if (signature === last) return
      last = signature
      const map = await productByTabStorage.getValue()
      if (identity) map[key] = identity
      else delete map[key]
      await productByTabStorage.setValue(map)
    }

    await check()
    // Store pages fill in their product after load, and move between products without reloading.
    ctx.setTimeout(check, 2_500)
    ctx.setInterval(check, 5_000)
  },
})
