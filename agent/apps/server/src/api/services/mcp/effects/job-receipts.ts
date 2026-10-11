/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The receipt of an application: every field Redrob filled, by its label, and a screenshot of the page
 * the moment after it was sent. Kept on this computer with the application.
 */

import { isConsequential } from '@browseros/playbooks/playbook'
import type { JobStore } from '../../../../lib/jobs/store'
import type { BrowserToolEffect } from '../browser-tool-dispatch'
import { currentApplicationRun } from '../guards/job-apply'

let store: Pick<JobStore, 'recordField' | 'markSent'> | null = null

/** Called once by the server with the job store. */
export function setJobReceiptStore(
  next: Pick<JobStore, 'recordField' | 'markSent'> | null,
): void {
  store = next
}

export const applyJobReceipts: BrowserToolEffect = async ({ call, result }) => {
  const conversationId = call.lease?.conversationId
  if (result.isError || !store || !conversationId) return
  const run = currentApplicationRun(conversationId)
  if (!run) return
  for (const { field, value } of call.jobFields ?? []) {
    store.recordField(conversationId, field, value)
  }
  const target = call.jobPressed
  if (run.mode === 'review' || !target || !isConsequential(target)) return
  let screenshot: { data: string } | undefined
  try {
    screenshot = await call.context.session.screenshot(call.args.page as number)
  } catch {
    // A receipt without a picture still has every field; it is not a reason to fail the run.
  }
  await store.markSent(conversationId, screenshot)
}
