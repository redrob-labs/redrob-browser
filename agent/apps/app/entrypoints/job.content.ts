/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Notices when a page is one job posting, so the side panel can offer Apply with Redrob. Reads the
 * page's own JobPosting data (or its heading and text on known application systems) only; nothing is
 * sent anywhere until the person asks to apply.
 */

import { detectJobPosting } from '@browseros/jobs/posting'
import { postingByTabStorage } from '@/lib/jobs/jobStorage'
import {
  RuntimeMessageType,
  sendRuntimeMessage,
} from '@/lib/messaging/runtime/runtimeMessages'

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
      const posting = detectJobPosting(document, location.href)
      const signature = posting ? `${posting.url}|${posting.title}` : ''
      if (signature === last) return
      last = signature
      const map = await postingByTabStorage.getValue()
      if (posting) map[key] = posting
      else delete map[key]
      await postingByTabStorage.setValue(map)
    }

    await check()
    // Job boards render the posting after load and switch postings in place.
    ctx.setTimeout(check, 2_500)
    ctx.setInterval(check, 5_000)
  },
})
