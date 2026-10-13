/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Redrob Launcher's shared sign-in, as the fallback for a Redrob Console provider that has no key of its own.
 *
 * The launcher signs a computer in once and writes the workspace key to one file every Redrob app may read
 * (redrob-launcher docs/shared-account.md). This module is a READER of that file and nothing more: it never
 * writes or deletes it, it reads it at the moment a key is needed rather than once at startup (the person may
 * sign in or out in the launcher while the browser runs), and it never logs or returns the key anywhere a
 * route could echo it. The provider's own stored key always wins; the shared file only fills a blank.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, win32 } from 'node:path'

export const SHARED_ACCOUNT_FILE = 'account.json'
/** The provider type whose blank key the launcher's sign-in may fill. */
export const LAUNCHER_PROVIDER_TYPE = 'redrob-console'

export interface SharedAccount {
  apiKey: string
  apiKeyName: string
  accountName: string
  apiBaseUrl: string
}

/** What a route may say about the shared sign-in: everything except the key. */
export interface LauncherSignIn {
  signedIn: boolean
  apiKeyName: string
  accountName: string
  apiBaseUrl: string
}

/**
 * Where the launcher writes the shared account. `REDROB_SHARED_DIR` replaces the directory (the file name
 * stays `account.json`), which is also how tests keep clear of the real config directory.
 */
export function sharedAccountPath(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const override = env.REDROB_SHARED_DIR?.trim()
  if (override) {
    return platform === 'win32'
      ? win32.join(override, SHARED_ACCOUNT_FILE)
      : join(override, SHARED_ACCOUNT_FILE)
  }
  if (platform === 'win32') {
    const appData =
      env.APPDATA?.trim() ||
      win32.join(env.USERPROFILE?.trim() || home, 'AppData', 'Roaming')
    return win32.join(appData, 'Redrob', 'Shared', SHARED_ACCOUNT_FILE)
  }
  if (platform === 'darwin') {
    return join(
      home,
      'Library',
      'Application Support',
      'ai.redrob.shared',
      SHARED_ACCOUNT_FILE,
    )
  }
  const configHome = env.XDG_CONFIG_HOME?.trim() || join(home, '.config')
  return join(configHome, 'redrob-shared', SHARED_ACCOUNT_FILE)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * The shared account as it is on disk right now, or null when nobody is signed in: no file, unreadable,
 * not JSON, or an empty `apiKey` all read as "not signed in", never as an error.
 */
export function readSharedAccount(
  path: string = sharedAccountPath(),
): SharedAccount | null {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return null
  const body = parsed as Record<string, unknown>
  const apiKey = text(body.apiKey)
  if (!apiKey) return null
  return {
    apiKey,
    apiKeyName: text(body.apiKeyName),
    accountName: text(body.accountName),
    apiBaseUrl: text(body.apiBaseUrl),
  }
}

/** The shared sign-in without its key, for the app's settings UI. */
export function launcherSignIn(path?: string): LauncherSignIn {
  const account = readSharedAccount(path)
  if (!account) {
    return { signedIn: false, apiKeyName: '', accountName: '', apiBaseUrl: '' }
  }
  const { apiKey: _key, ...rest } = account
  return { signedIn: true, ...rest }
}

/** Whether a Redrob Console provider with this stored key would take the launcher's instead. */
export function wantsLauncherKey(
  type: string | undefined,
  apiKey: string | null | undefined,
): boolean {
  return type === LAUNCHER_PROVIDER_TYPE && !text(apiKey)
}

/**
 * A provider configuration with the launcher's key filled in where its own is blank.
 *
 * Only a Redrob Console provider is eligible, and only when it holds no key of its own: anything else comes
 * back untouched with `viaLauncher: false`. When the shared key is used, a blank base URL is taken from the
 * shared file too, so the key is only ever sent to the console it was issued for.
 */
export function withLauncherFallback<
  T extends { apiKey?: string | null; baseUrl?: string | null },
>(
  type: string | undefined,
  config: T,
  path?: string,
): { config: T; viaLauncher: boolean } {
  if (!wantsLauncherKey(type, config.apiKey))
    return { config, viaLauncher: false }
  const shared = readSharedAccount(path)
  if (!shared) return { config, viaLauncher: false }
  return {
    viaLauncher: true,
    config: {
      ...config,
      apiKey: shared.apiKey,
      baseUrl: text(config.baseUrl) || shared.apiBaseUrl || config.baseUrl,
    },
  }
}
