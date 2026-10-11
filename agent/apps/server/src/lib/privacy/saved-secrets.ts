/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The browser's saved passwords and autofill details, as Privacy Protection sees them: positions in
 * a text, from `chrome.redrobPrivate.scanForSavedSecrets`, never the values. The browser holds the
 * values and keeps only keyed digests of them in memory (sources/chrome/browser/redrob/secret_matcher.h);
 * this asks it where they occur, through the agent extension's service worker over the CDP
 * connection the server already has. Nothing leaves this computer.
 *
 * When the browser cannot answer (a build without the API, or the worker asleep), the scan is
 * "unavailable" and the gate goes on with its patterns and model: this is a layer on top of them.
 */

import {
  type DetectedValue,
  SAVED_SECRET_CATEGORY,
  type SavedSecretKind,
} from '@browseros/privacy/labels'
import { logger } from '../logger'

/** The agent extension: the one that holds the redrobPrivate.privacy permission. */
export const AGENT_EXTENSION_ID = 'oikpnmkappjhkifbcieakjoeiknojbgg'

/** The browser refuses longer texts; a value across a cut is caught by the overlap. */
export const CHUNK = 60_000
const OVERLAP = 256
const TIMEOUT_MS = 2_000
/**
 * Every model step re-sends the whole conversation, so the same texts are scanned again and again.
 * A result is reused for a minute: a password saved in that minute is caught from the next one.
 */
const CACHE_MS = 60_000
const CACHE_SIZE = 500

export interface SavedSecretSpan {
  start: number
  end: number
  kind: SavedSecretKind
}

export type SavedSecretScan =
  | { state: 'ready'; spans: SavedSecretSpan[] }
  | { state: 'unavailable' }

export interface SavedSecretScanner {
  scan(text: string): Promise<SavedSecretScan>
}

/** No browser to ask: what tests and a server without a CDP connection use. */
export const NO_SAVED_SECRETS: SavedSecretScanner = {
  scan: async () => ({ state: 'unavailable' }),
}

type Cdp = (
  method: string,
  params?: Record<string, unknown>,
  sessionId?: string,
) => Promise<unknown>

interface TargetInfo {
  targetId: string
  type: string
  url: string
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('saved-secret scan timed out')), ms),
    ),
  ])
}

/** Cuts a long text into overlapping pieces the browser accepts, with each piece's offset. */
export function chunks(
  text: string,
  size = CHUNK,
  overlap = OVERLAP,
): Array<{ offset: number; text: string }> {
  if (text.length <= size) return [{ offset: 0, text }]
  const out: Array<{ offset: number; text: string }> = []
  for (let offset = 0; offset < text.length; offset += size - overlap) {
    out.push({ offset, text: text.slice(offset, offset + size) })
    if (offset + size >= text.length) break
  }
  return out
}

/** Spans from overlapping pieces, in text order, each once. */
export function mergeSpans(spans: SavedSecretSpan[]): SavedSecretSpan[] {
  const sorted = [...spans].sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
  )
  const out: SavedSecretSpan[] = []
  for (const span of sorted) {
    const last = out[out.length - 1]
    if (last && span.start < last.end) continue
    out.push(span)
  }
  return out
}

/** The spans as values the labeller matches wherever they appear in this text. */
export function detectedFrom(
  text: string,
  spans: readonly SavedSecretSpan[],
): DetectedValue[] {
  const seen = new Set<string>()
  const out: DetectedValue[] = []
  for (const span of spans) {
    const category = SAVED_SECRET_CATEGORY[span.kind]
    const value = text.slice(span.start, span.end)
    if (!category || !value || seen.has(`${category}:${value}`)) continue
    seen.add(`${category}:${value}`)
    out.push({ category, value })
  }
  return out
}

export class ExtensionSavedSecrets implements SavedSecretScanner {
  private sessionId: string | null = null
  private readonly cache = new Map<
    string,
    { at: number; spans: SavedSecretSpan[] }
  >()

  constructor(
    private readonly cdp: Cdp,
    private readonly extensionId = AGENT_EXTENSION_ID,
    private readonly now: () => number = Date.now,
  ) {}

  private async attach(): Promise<string | null> {
    if (this.sessionId) return this.sessionId
    const { targetInfos } = (await this.cdp('Target.getTargets')) as {
      targetInfos: TargetInfo[]
    }
    const origin = `chrome-extension://${this.extensionId}/`
    // The worker first; an open extension page (the side panel) has the same API.
    const target =
      targetInfos.find(
        (t) => t.type === 'service_worker' && t.url.startsWith(origin),
      ) ??
      targetInfos.find((t) => t.type === 'page' && t.url.startsWith(origin))
    if (!target) return null
    const { sessionId } = (await this.cdp('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    })) as { sessionId: string }
    this.sessionId = sessionId
    return sessionId
  }

  private async scanPiece(
    sessionId: string,
    text: string,
  ): Promise<{ ready: boolean; spans: SavedSecretSpan[] } | null> {
    const response = (await this.cdp(
      'Runtime.evaluate',
      {
        // The text goes in as a JSON literal, so nothing in it can be read as code.
        expression: `(() => { const api = globalThis.chrome?.redrobPrivate; return api?.scanForSavedSecrets ? api.scanForSavedSecrets(${JSON.stringify(text)}) : null })()`,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    )) as {
      result?: { value?: { ready: boolean; spans: SavedSecretSpan[] } | null }
      exceptionDetails?: unknown
    }
    if (response.exceptionDetails) return null
    return response.result?.value ?? null
  }

  async scan(text: string): Promise<SavedSecretScan> {
    if (!text.trim()) return { state: 'ready', spans: [] }
    const cached = this.cache.get(text)
    if (cached && this.now() - cached.at < CACHE_MS) {
      return { state: 'ready', spans: cached.spans }
    }
    try {
      const scan = await withTimeout(this.scanAll(text), TIMEOUT_MS)
      if (scan.state === 'ready') {
        this.cache.delete(text)
        this.cache.set(text, { at: this.now(), spans: scan.spans })
        while (this.cache.size > CACHE_SIZE) {
          const oldest = this.cache.keys().next().value
          if (oldest === undefined) break
          this.cache.delete(oldest)
        }
      }
      return scan
    } catch (error) {
      // A detached worker (it sleeps after 30 s idle) answers with an error: attach again next time.
      this.sessionId = null
      logger.debug('saved-secret scan unavailable', {
        error: error instanceof Error ? error.message : String(error),
      })
      return { state: 'unavailable' }
    }
  }

  private async scanAll(text: string): Promise<SavedSecretScan> {
    const sessionId = await this.attach()
    if (!sessionId) return { state: 'unavailable' }
    const spans: SavedSecretSpan[] = []
    for (const piece of chunks(text)) {
      const result = await this.scanPiece(sessionId, piece.text)
      if (!result?.ready) return { state: 'unavailable' }
      for (const span of result.spans) {
        spans.push({
          ...span,
          start: span.start + piece.offset,
          end: span.end + piece.offset,
        })
      }
    }
    return { state: 'ready', spans: mergeSpans(spans) }
  }
}
