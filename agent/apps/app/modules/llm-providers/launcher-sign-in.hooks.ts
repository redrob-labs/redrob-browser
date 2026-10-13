/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react'

/**
 * Redrob Launcher's shared sign-in as the agent server sees it: whether there is one, and for which
 * account. Never the key -- the server keeps that to itself and fills it into a Redrob Console provider
 * that has no key of its own at request time.
 */
export interface LauncherSignIn {
  signedIn: boolean
  apiKeyName: string
  accountName: string
  apiBaseUrl: string
}

export const NOT_SIGNED_IN: LauncherSignIn = {
  signedIn: false,
  apiKeyName: '',
  accountName: '',
  apiBaseUrl: '',
}

export async function fetchLauncherSignIn(
  agentServerUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LauncherSignIn> {
  try {
    const res = await fetchImpl(`${agentServerUrl}/redrob-console/launcher`)
    if (!res.ok) return NOT_SIGNED_IN
    const body = (await res.json()) as Partial<LauncherSignIn>
    if (body.signedIn !== true) return NOT_SIGNED_IN
    return {
      signedIn: true,
      apiKeyName: typeof body.apiKeyName === 'string' ? body.apiKeyName : '',
      accountName: typeof body.accountName === 'string' ? body.accountName : '',
      apiBaseUrl: typeof body.apiBaseUrl === 'string' ? body.apiBaseUrl : '',
    }
  } catch {
    return NOT_SIGNED_IN
  }
}

/**
 * Read once each time `enabled` turns on (the Redrob Console form being shown), so a sign-in or sign-out in
 * the launcher is seen the next time the form opens. `null` until the answer arrives.
 */
export function useLauncherSignIn(
  agentServerUrl: string | undefined,
  enabled: boolean,
): LauncherSignIn | null {
  const [state, setState] = useState<LauncherSignIn | null>(null)

  useEffect(() => {
    if (!enabled || !agentServerUrl) {
      setState(null)
      return
    }
    let cancelled = false
    void fetchLauncherSignIn(agentServerUrl).then((result) => {
      if (!cancelled) setState(result)
    })
    return () => {
      cancelled = true
    }
  }, [agentServerUrl, enabled])

  return state
}
