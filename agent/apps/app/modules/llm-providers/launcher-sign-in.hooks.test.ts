/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { fetchLauncherSignIn, NOT_SIGNED_IN } from './launcher-sign-in.hooks'

const SERVER = 'http://127.0.0.1:9999'

function reply(status: number, body: unknown): typeof fetch {
  return (async (input: string | URL | Request) => {
    expect(String(input)).toBe(`${SERVER}/redrob-console/launcher`)
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch
}

describe('fetchLauncherSignIn', () => {
  it('reports the account when the launcher is signed in, without a key', async () => {
    const result = await fetchLauncherSignIn(
      SERVER,
      reply(200, {
        signedIn: true,
        apiKeyName: 'laptop',
        accountName: 'Acme',
        apiBaseUrl: 'https://console.redrob.ai/api/backend/v1',
        // A server that ever leaked it must not have the app carry it on.
        apiKey: 'rk_should_not_pass',
      }),
    )
    expect(result).toEqual({
      signedIn: true,
      apiKeyName: 'laptop',
      accountName: 'Acme',
      apiBaseUrl: 'https://console.redrob.ai/api/backend/v1',
    })
    expect(JSON.stringify(result)).not.toContain('rk_should_not_pass')
  })

  it('reads not signed in from the server', async () => {
    expect(
      await fetchLauncherSignIn(SERVER, reply(200, { signedIn: false })),
    ).toEqual(NOT_SIGNED_IN)
  })

  it('treats a failing or unreachable server as not signed in', async () => {
    expect(await fetchLauncherSignIn(SERVER, reply(500, {}))).toEqual(
      NOT_SIGNED_IN,
    )
    const down = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    expect(await fetchLauncherSignIn(SERVER, down)).toEqual(NOT_SIGNED_IN)
  })
})
