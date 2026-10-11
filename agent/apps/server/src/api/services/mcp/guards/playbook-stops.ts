/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * While a conversation runs a playbook: it acts only on the playbook's sites, and it never presses a
 * control that pays, orders, submits, sends or deletes. The person presses that one themselves, after
 * reading what Redrob has prepared. A page's or a shared playbook's instructions cannot lift this,
 * because it is decided here, not by the model.
 */

import {
  errorResult,
  type ToolResult,
} from '@browseros/browser-mcp/tools/framework'
import { isConsequential } from '@browseros/playbooks/playbook'
import type { ActivePlaybookRun } from '../../../../lib/playbooks/store'
import type {
  BrowserToolCall,
  BrowserToolGuard,
} from '../browser-tool-dispatch'

let lookup: (conversationId: string | undefined) => ActivePlaybookRun | null =
  () => null

/** Called once by the server with the playbook store. */
export function setPlaybookRunSource(
  source: (conversationId: string | undefined) => ActivePlaybookRun | null,
): void {
  lookup = source
}

const ACTING = new Set(['act', 'upload', 'run', 'evaluate'])

function onSites(url: string | undefined, sites: readonly string[]): boolean {
  if (!url) return true
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    return sites.some((site) => host === site || host.endsWith(`.${site}`))
  } catch {
    return true
  }
}

export const guardPlaybookStops: BrowserToolGuard = (call) =>
  guardPlaybookStopsCall(call, lookup(call.lease?.conversationId))

export function guardPlaybookStopsCall(
  call: BrowserToolCall,
  run: ActivePlaybookRun | null,
): ToolResult | null {
  if (!run) return null
  const name = call.tool.name
  if (
    name === 'navigate' &&
    typeof call.args.url === 'string' &&
    !onSites(call.args.url, run.sites)
  ) {
    return errorResult(
      `navigate: the playbook "${run.name}" works only on ${run.sites.join(', ')}. Ask the person before going elsewhere.`,
    )
  }
  if (!ACTING.has(name)) return null
  const page = typeof call.args.page === 'number' ? call.args.page : undefined
  if (page !== undefined) {
    const url = call.context.session.pages.getInfo(page)?.url
    if (!onSites(url, run.sites)) {
      return errorResult(
        `${name}: this page is not one the playbook "${run.name}" works on (${run.sites.join(', ')}). Stop and ask the person.`,
      )
    }
  }
  if (name !== 'act' || page === undefined) return null
  const kind = call.args.kind
  const ref = typeof call.args.ref === 'string' ? call.args.ref : undefined
  const pressing =
    kind === 'click' ||
    (kind === 'press' && /enter/i.test(String(call.args.key ?? '')))
  if (!pressing) return null
  const target = ref
    ? call.context.session.observe(page).lastRefs.get(ref)?.name
    : undefined
  if (target && isConsequential(target)) {
    return errorResult(
      `act: "${target}" is final, so this playbook stops here. Tell the person exactly what is ready (items, amounts, recipient) and that they can press "${target}" themselves.`,
    )
  }
  return null
}
