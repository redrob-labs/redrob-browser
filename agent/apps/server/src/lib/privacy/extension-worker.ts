/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Asks the agent extension for something only the browser knows (saved secrets, its managed policy),
 * by evaluating an expression in its service worker over the CDP connection the server already has.
 * The answer comes from the browser itself, which is the point: no local process can stand in for it
 * the way one could for an HTTP caller.
 */

/** The agent extension: the one that holds the redrobPrivate.privacy permission. */
export const AGENT_EXTENSION_ID = 'oikpnmkappjhkifbcieakjoeiknojbgg'

export type Cdp = (
  method: string,
  params?: Record<string, unknown>,
  sessionId?: string,
) => Promise<unknown>

interface TargetInfo {
  targetId: string
  type: string
  url: string
}

export class ExtensionUnavailableError extends Error {}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new ExtensionUnavailableError('timed out')),
        ms,
      )
    }),
  ]).finally(() => clearTimeout(timer))
}

export class ExtensionWorker {
  private sessionId: string | null = null

  constructor(
    private readonly cdp: Cdp,
    private readonly extensionId = AGENT_EXTENSION_ID,
  ) {}

  private async attach(): Promise<string> {
    if (this.sessionId) return this.sessionId
    const { targetInfos } = (await this.cdp('Target.getTargets')) as {
      targetInfos: TargetInfo[]
    }
    const origin = `chrome-extension://${this.extensionId}/`
    // The worker first; an open extension page (the side panel) has the same APIs.
    const target =
      targetInfos.find(
        (t) => t.type === 'service_worker' && t.url.startsWith(origin),
      ) ??
      targetInfos.find((t) => t.type === 'page' && t.url.startsWith(origin))
    if (!target) throw new ExtensionUnavailableError('no extension target')
    const { sessionId } = (await this.cdp('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    })) as { sessionId: string }
    this.sessionId = sessionId
    return sessionId
  }

  /**
   * The value of `expression` (awaited) in the extension. Anything the caller interpolates must be a
   * JSON literal. Throws ExtensionUnavailableError when there is no extension to ask, or it threw.
   */
  async evaluate<T>(expression: string): Promise<T | null> {
    try {
      const sessionId = await this.attach()
      const response = (await this.cdp(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        sessionId,
      )) as { result?: { value?: T | null }; exceptionDetails?: unknown }
      if (response.exceptionDetails) {
        throw new ExtensionUnavailableError('the expression threw')
      }
      return response.result?.value ?? null
    } catch (error) {
      // A worker that went to sleep detaches its session: attach again next time.
      this.sessionId = null
      throw error instanceof ExtensionUnavailableError
        ? error
        : new ExtensionUnavailableError(
            error instanceof Error ? error.message : String(error),
          )
    }
  }
}
