/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Notices when a tab shows a profile or an applicant Talent Scout can read, so the side panel can
 * offer "Check against <role>". Recognising is by URL only; the page is read only when the recruiter
 * presses the chip, and then it is this page as it already is: no extra view, no extra tab.
 */

import { recognisePage } from '@browseros/hiring/sites'
import { hiringPageByTabStorage } from '@/lib/hiring/hiringStorage'
import {
  RuntimeMessageType,
  sendRuntimeMessage,
} from '@/lib/messaging/runtime/runtimeMessages'

const HIRING_READ_MESSAGE = 'redrob:hiring:read-page'

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
      const page = recognisePage(location.href)
      // A single person only: lists are reviewed from the Hiring page.
      const one =
        page && (page.kind === 'profile' || page.kind === 'applicant')
          ? page
          : null
      const signature = one ? `${location.href}|${one.site.id}` : ''
      if (signature === last) return
      last = signature
      const map = await hiringPageByTabStorage.getValue()
      if (one)
        map[key] = {
          url: location.href,
          site: one.site.id,
          siteName: one.site.name,
        }
      else delete map[key]
      await hiringPageByTabStorage.setValue(map)
    }

    // The panel asks for the page when the recruiter presses the chip, and only then.
    chrome.runtime.onMessage.addListener((message, _sender, reply) => {
      if (message?.type !== HIRING_READ_MESSAGE) return false
      reply({ url: location.href, html: document.documentElement.outerHTML })
      return false
    })

    await check()
    // Profile pages are single-page apps: the URL changes without a load.
    ctx.setInterval(check, 2_000)
  },
})
