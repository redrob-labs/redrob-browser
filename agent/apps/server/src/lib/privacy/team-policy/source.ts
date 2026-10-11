/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Where the browser's team policy comes from: a Chromium managed policy. An admin deploys the signed
 * policy the Redrob console issued (Cowork's format, one compact JWS) to the agent extension's managed
 * storage, the standard `3rdparty.extensions.<id>` policy every Chromium management tool can set:
 *
 *   { "3rdparty": { "extensions": { "oikpnmkappjhkifbcieakjoeiknojbgg": { "teamPolicy": "<jws>" } } } }
 *
 * That is the business signal until the browser has an account client: only a managed device gets a
 * managed policy, and only a business workspace gets a policy the console signed. Everyone else has
 * none, and never sees a lock.
 *
 * Read from the browser itself (chrome.storage.managed in the extension's worker), never from an HTTP
 * caller, and trusted only after the signature checks against a key pinned in this build. The last
 * applied policy is kept in `<browseros dir>/team-policy.json` so it holds from the first message after
 * a restart, before the extension has woken; a policy the device no longer has is dropped.
 */

import { readFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getBrowserosDir } from '../../browseros-dir'
import { logger } from '../../logger'
import {
  ExtensionUnavailableError,
  type ExtensionWorker,
  withTimeout,
} from '../extension-worker'
import {
  TeamPolicyError,
  type VerifiedTeamPolicy,
  verifyTeamPolicyJws,
} from './jws'
import { type PinnedKey, trustedKeys } from './keys'

/** The managed-storage key, declared in the extension's managed_schema.json. */
const MANAGED_POLICY_KEY = 'teamPolicy'
const POLL_MS = 5 * 60_000
const READ_TIMEOUT_MS = 3_000

export type TeamPolicyState =
  | { state: 'none' }
  | { state: 'active'; verified: VerifiedTeamPolicy }
  /** The device has a policy this build would not apply. The previous one, if any, stays. */
  | { state: 'refused'; code: string; verified?: VerifiedTeamPolicy }

interface Stored {
  jws: string
}

export interface ManagedPolicyReader {
  /** The JWS the device's managed policy holds, null when it holds none. Throws when it cannot ask. */
  read(): Promise<string | null>
}

/** Reads `teamPolicy` from the agent extension's managed storage. */
export function managedStorageReader(
  worker: ExtensionWorker,
): ManagedPolicyReader {
  return {
    read: async () => {
      const value = await withTimeout(
        worker.evaluate<string | null>(
          `(async () => { const area = globalThis.chrome?.storage?.managed; if (!area) return null; const got = await area.get(${JSON.stringify(MANAGED_POLICY_KEY)}); const v = got?.[${JSON.stringify(MANAGED_POLICY_KEY)}]; return typeof v === 'string' ? v : null })()`,
        ),
        READ_TIMEOUT_MS,
      )
      return value ?? null
    },
  }
}

export class TeamPolicySource {
  private current: TeamPolicyState = { state: 'none' }
  private readonly listeners = new Set<(state: TeamPolicyState) => void>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly reader: ManagedPolicyReader | null,
    private readonly path = join(getBrowserosDir(), 'team-policy.json'),
    private readonly keys: () => readonly PinnedKey[] = () => trustedKeys(),
  ) {}

  state(): TeamPolicyState {
    return this.current
  }

  /** The policy in force: the active one, or the previous one a refused update left standing. */
  policy(): VerifiedTeamPolicy | null {
    if (this.current.state === 'active') return this.current.verified
    if (this.current.state === 'refused') return this.current.verified ?? null
    return null
  }

  onChange(listener: (state: TeamPolicyState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Applies the stored policy, then reads the device's and keeps reading it. */
  async start(): Promise<void> {
    await this.loadStored()
    await this.refresh()
    this.timer = setInterval(() => void this.refresh(), POLL_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private set(next: TeamPolicyState): void {
    this.current = next
    for (const listener of this.listeners) listener(next)
  }

  private async loadStored(): Promise<void> {
    let stored: Stored | null = null
    try {
      stored = JSON.parse(readFileSync(this.path, 'utf8')) as Stored
    } catch {
      return
    }
    try {
      this.set({
        state: 'active',
        verified: await verifyTeamPolicyJws(stored.jws, this.keys()),
      })
    } catch {
      // A stored policy this build no longer trusts (a rotated key) is not applied; the device's
      // current one replaces it on the next read.
    }
  }

  /** Reads the device's policy now. A failed read keeps what is in force: it is not a removal. */
  async refresh(): Promise<TeamPolicyState> {
    if (!this.reader) return this.current
    let jws: string | null
    try {
      jws = await this.reader.read()
    } catch (error) {
      if (!(error instanceof ExtensionUnavailableError)) {
        logger.warn('team policy read failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return this.current
    }
    if (jws === null) {
      if (this.current.state !== 'none') {
        await rm(this.path, { force: true })
        this.set({ state: 'none' })
      }
      return this.current
    }
    return this.accept(jws)
  }

  /** Verifies and applies one JWS. Exposed for tests and the refresh path. */
  async accept(jws: string): Promise<TeamPolicyState> {
    const previous = this.policy()
    let verified: VerifiedTeamPolicy
    try {
      verified = await verifyTeamPolicyJws(jws, this.keys())
    } catch (error) {
      const code =
        error instanceof TeamPolicyError ? error.code : 'team_policy_invalid'
      this.set({ state: 'refused', code, verified: previous ?? undefined })
      return this.current
    }
    if (previous?.payloadSha256 === verified.payloadSha256) {
      if (this.current.state !== 'active')
        this.set({ state: 'active', verified })
      return this.current
    }
    // Versions only go up within a workspace: an older signed policy is a replay, not an update.
    if (
      previous &&
      previous.policy.accountId === verified.policy.accountId &&
      verified.policy.version <= previous.policy.version
    ) {
      this.set({
        state: 'refused',
        code: 'team_policy_stale',
        verified: previous,
      })
      return this.current
    }
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify({ jws } satisfies Stored), {
      encoding: 'utf8',
      mode: 0o600,
    })
    await rename(temporary, this.path)
    this.set({ state: 'active', verified })
    return this.current
  }
}
