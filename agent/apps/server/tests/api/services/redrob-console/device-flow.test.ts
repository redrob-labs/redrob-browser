/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { RedrobConsoleDeviceFlow } from '../../../../src/api/services/redrob-console/device-flow'

const BASE = 'https://console.redrob.ai/api/backend/v1'

function fakeConsole(tokenReplies: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; body: unknown }> = []
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? '{}')) })
    if (url.endsWith('/device/authorize')) {
      return Response.json({
        deviceCode: 'secret-device-code',
        userCode: 'ABCD-EFGH',
        verificationUri: 'https://console.redrob.ai/device',
        verificationUriComplete:
          'https://console.redrob.ai/device?code=ABCD-EFGH',
        expiresIn: 600,
        interval: 5,
      })
    }
    const reply = tokenReplies.shift() ?? {
      status: 400,
      body: { error: 'authorization_pending' },
    }
    return Response.json(reply.body, { status: reply.status })
  }
  return { calls, fetchImpl }
}

describe('RedrobConsoleDeviceFlow', () => {
  it('starts with the browser product, and never hands the device code to the app', async () => {
    const { calls, fetchImpl } = fakeConsole([])
    const flow = new RedrobConsoleDeviceFlow({ baseUrl: BASE, fetchImpl })
    const start = await flow.start()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.body).toEqual({ product: 'redrob-browser' })
    expect(start.userCode).toBe('ABCD-EFGH')
    expect(start.verificationUri).toBe(
      'https://console.redrob.ai/device?code=ABCD-EFGH',
    )
    expect(start.intervalMs).toBe(5000)
    expect(JSON.stringify(start)).not.toContain('secret-device-code')
  })

  it('falls back to the legacy id only when an older console refuses the browser id', async () => {
    const calls: unknown[] = []
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      calls.push(body)
      // The shape a console without `redrob-browser` answers: ValidationPipe's 400.
      if (body.product === 'redrob-browser') {
        return Response.json(
          {
            statusCode: 400,
            message: ['product must be one of the following values: ...'],
          },
          { status: 400 },
        )
      }
      return Response.json({
        deviceCode: 'secret-device-code',
        userCode: 'ABCD-EFGH',
        verificationUri: 'https://console.redrob.ai/device',
        expiresIn: 600,
        interval: 5,
      })
    }
    const flow = new RedrobConsoleDeviceFlow({ baseUrl: BASE, fetchImpl })
    const start = await flow.start()
    expect(calls).toEqual([
      { product: 'redrob-browser' },
      { product: 'browser' },
    ])
    expect(start.userCode).toBe('ABCD-EFGH')
  })

  it('does not retry under the legacy id when the console fails for another reason', async () => {
    const calls: unknown[] = []
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body ?? '{}')))
      return Response.json({ message: 'busy' }, { status: 503 })
    }
    const flow = new RedrobConsoleDeviceFlow({ baseUrl: BASE, fetchImpl })
    await expect(flow.start()).rejects.toThrow('would not start')
    expect(calls).toHaveLength(1)
  })

  it('polls pending, then returns the key once and forgets the handle', async () => {
    const { calls, fetchImpl } = fakeConsole([
      { status: 400, body: { error: 'authorization_pending' } },
      { status: 200, body: { apiKey: 'rk_live_123' } },
    ])
    const flow = new RedrobConsoleDeviceFlow({ baseUrl: BASE, fetchImpl })
    const { handle } = await flow.start()
    expect(await flow.poll(handle)).toEqual({
      status: 'pending',
      intervalMs: 5000,
    })
    expect(await flow.poll(handle)).toEqual({
      status: 'connected',
      apiKey: 'rk_live_123',
    })
    expect(calls[1]?.body).toEqual({ deviceCode: 'secret-device-code' })
    expect(await flow.poll(handle)).toEqual({ status: 'unknown' })
  })

  it('backs off on slow_down and stops on a denial', async () => {
    const { fetchImpl } = fakeConsole([
      { status: 400, body: { error: 'slow_down' } },
      { status: 400, body: { error: 'access_denied' } },
    ])
    const flow = new RedrobConsoleDeviceFlow({ baseUrl: BASE, fetchImpl })
    const { handle } = await flow.start()
    expect(await flow.poll(handle)).toEqual({
      status: 'pending',
      intervalMs: 10000,
    })
    expect(await flow.poll(handle)).toEqual({ status: 'denied' })
  })

  it('expires a connection past the console deadline without asking it again', async () => {
    let now = 0
    const { calls, fetchImpl } = fakeConsole([])
    const flow = new RedrobConsoleDeviceFlow({
      baseUrl: BASE,
      fetchImpl,
      now: () => now,
    })
    const { handle } = await flow.start()
    now = 601_000
    expect(await flow.poll(handle)).toEqual({ status: 'expired' })
    expect(calls).toHaveLength(1)
  })

  it('refuses a verification page off the console origin', async () => {
    const fetchImpl = async () =>
      Response.json({
        deviceCode: 'd',
        userCode: 'U',
        verificationUri: 'https://evil.example/device',
      })
    const flow = new RedrobConsoleDeviceFlow({ baseUrl: BASE, fetchImpl })
    await expect(flow.start()).rejects.toThrow('usable connection code')
  })
})
