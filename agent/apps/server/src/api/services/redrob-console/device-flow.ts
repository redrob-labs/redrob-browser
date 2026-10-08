/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Connecting the Redrob Console provider without pasting a key: the console's RFC 8628 device grant.
 *
 * The app asks this server to start a connection, shows the user code and opens the console's approval
 * page, then polls here until the console hands back an ordinary workspace API key -- the same key a user
 * would otherwise copy from console.redrob.ai/api-keys and paste into the provider form. The extension
 * cannot call the console itself: it holds no host permission for it, and the console's CORS list does not
 * name extension origins.
 *
 * The device code is the bearer of the pending connection, so it never leaves this module: the app gets
 * an opaque handle instead. Nothing here logs a code or a key.
 */

import { randomUUID } from 'node:crypto'

export const REDROB_CONSOLE_API = 'https://console.redrob.ai/api/backend/v1'
/**
 * The console's product id for this client. `redrob-browser` is the browser's own id, shown as
 * "Redrob Browser" on the approval page. `browser` belongs to the extension (shown as "Redrob
 * Extension") and is used only when a console that predates `redrob-browser` refuses it with 400,
 * so connecting keeps working while the console rolls out.
 */
const DEVICE_PRODUCT = 'redrob-browser'
const LEGACY_DEVICE_PRODUCT = 'browser'

const FALLBACK_EXPIRES_MS = 10 * 60_000
const MAX_EXPIRES_MS = 30 * 60_000
const FALLBACK_INTERVAL_MS = 5_000
const MIN_INTERVAL_MS = 1_000

export interface DeviceStart {
  handle: string
  userCode: string
  verificationUri: string
  /** Milliseconds the app should wait between polls. */
  intervalMs: number
  expiresAt: number
}

export type DevicePoll =
  | { status: 'pending'; intervalMs: number }
  | { status: 'connected'; apiKey: string }
  | { status: 'denied' | 'expired' | 'unknown' }
  | { status: 'failed'; code: string }

interface Pending {
  deviceCode: string
  intervalMs: number
  expiresAt: number
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export class RedrobConsoleDeviceFlow {
  private readonly pending = new Map<string, Pending>()

  constructor(
    private readonly options: {
      baseUrl?: string
      fetchImpl?: Fetch
      now?: () => number
    } = {},
  ) {}

  private get base() {
    return (this.options.baseUrl ?? REDROB_CONSOLE_API).replace(/\/+$/, '')
  }

  private now() {
    return (this.options.now ?? Date.now)()
  }

  private post(path: string, body: Record<string, string>) {
    const fetchImpl = this.options.fetchImpl ?? fetch
    return fetchImpl(`${this.base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
  }

  /** A page on the console itself, or nothing: the URL is opened in a tab, so a foreign host is refused. */
  private consolePage(value: unknown): string {
    const raw = text(value)
    const page = URL.parse(raw)
    const api = URL.parse(this.base)
    if (!page || !api || page.origin !== api.origin) return ''
    return raw
  }

  async start(): Promise<DeviceStart> {
    this.sweep()
    const unreachable = () => {
      throw new Error(
        'Could not reach console.redrob.ai to start the connection.',
      )
    }
    let response = await this.post('/device/authorize', {
      product: DEVICE_PRODUCT,
    }).catch(unreachable)
    if (response.status === 400) {
      response = await this.post('/device/authorize', {
        product: LEGACY_DEVICE_PRODUCT,
      }).catch(unreachable)
    }
    if (!response.ok)
      throw new Error('console.redrob.ai would not start the connection.')
    const body = await readJson(response)
    const deviceCode = text(body.deviceCode)
    const userCode = text(body.userCode)
    const verificationUri =
      this.consolePage(body.verificationUriComplete) ||
      this.consolePage(body.verificationUri)
    if (!deviceCode || !userCode || !verificationUri) {
      throw new Error(
        'console.redrob.ai did not return a usable connection code.',
      )
    }
    const intervalMs = Math.max(
      secondsToMs(body.interval, FALLBACK_INTERVAL_MS),
      MIN_INTERVAL_MS,
    )
    const expiresAt =
      this.now() +
      Math.min(secondsToMs(body.expiresIn, FALLBACK_EXPIRES_MS), MAX_EXPIRES_MS)
    const handle = randomUUID()
    this.pending.set(handle, { deviceCode, intervalMs, expiresAt })
    return { handle, userCode, verificationUri, intervalMs, expiresAt }
  }

  async poll(handle: string): Promise<DevicePoll> {
    const entry = this.pending.get(handle)
    if (!entry) return { status: 'unknown' }
    if (this.now() >= entry.expiresAt) {
      this.pending.delete(handle)
      return { status: 'expired' }
    }
    const response = await this.post('/device/token', {
      deviceCode: entry.deviceCode,
    }).catch(() => undefined)
    // An unreachable console is worth another poll; the deadline above still ends the attempt.
    if (!response) return { status: 'pending', intervalMs: entry.intervalMs }
    const body = await readJson(response)
    if (response.ok) {
      this.pending.delete(handle)
      const apiKey = text(body.apiKey)
      return apiKey
        ? { status: 'connected', apiKey }
        : { status: 'failed', code: 'missing_key' }
    }
    const code = text(body.error)
    if (code === 'authorization_pending')
      return { status: 'pending', intervalMs: entry.intervalMs }
    if (code === 'slow_down') {
      // RFC 8628 section 3.5: raise the interval by at least five seconds.
      entry.intervalMs += 5_000
      return { status: 'pending', intervalMs: entry.intervalMs }
    }
    this.pending.delete(handle)
    if (code === 'access_denied') return { status: 'denied' }
    if (code === 'expired_token') return { status: 'expired' }
    return { status: 'failed', code: code || `http_${response.status}` }
  }

  cancel(handle: string) {
    this.pending.delete(handle)
  }

  private sweep() {
    const now = this.now()
    for (const [handle, entry] of this.pending) {
      if (now >= entry.expiresAt) this.pending.delete(handle)
    }
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => undefined)
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function secondsToMs(value: unknown, fallbackMs: number): number {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallbackMs
}
