/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRedrobConsoleRoutes } from '../../src/api/routes/redrob-console'
import { providerRowToLlmConfig } from '../../src/api/services/chat-provider-config'
import { closeDb, initializeDb } from '../../src/lib/db'
import type { ProviderRow } from '../../src/lib/db/schema'
import { dbProviderStore } from '../../src/lib/providers/provider-store'
import {
  launcherSignIn,
  readSharedAccount,
  sharedAccountPath,
  withLauncherFallback,
} from '../../src/lib/redrob-shared-account'

const OWN_KEY = 'rk_own_000000000000'
const SHARED_KEY = 'rk_launcher_000000000000'
const CONSOLE = 'https://console.redrob.ai/api/backend/v1'

function row(overrides: Partial<ProviderRow> = {}): ProviderRow {
  return {
    id: 'redrob-1',
    kind: 'llm',
    type: 'redrob-console',
    name: 'Redrob Console',
    modelId: 'auto',
    reasoningEffort: null,
    isDefault: true,
    createdAt: 1,
    updatedAt: 2,
    baseUrl: CONSOLE,
    headers: null,
    supportsImages: true,
    contextWindow: 128000,
    temperature: 0.2,
    apiKey: null,
    accessKeyId: null,
    secretAccessKey: null,
    sessionToken: null,
    resourceName: null,
    region: null,
    reasoningSummary: null,
    workingDirectory: null,
    customConfig: null,
    ...overrides,
  }
}

describe('sharedAccountPath', () => {
  const home = '/home/someone'

  test('REDROB_SHARED_DIR replaces the directory and keeps the file name', () => {
    expect(
      sharedAccountPath('linux', { REDROB_SHARED_DIR: '/x/shared' }, home),
    ).toBe('/x/shared/account.json')
  })

  test('linux follows XDG_CONFIG_HOME, defaulting to ~/.config', () => {
    expect(sharedAccountPath('linux', {}, home)).toBe(
      '/home/someone/.config/redrob-shared/account.json',
    )
    expect(sharedAccountPath('linux', { XDG_CONFIG_HOME: '/cfg' }, home)).toBe(
      '/cfg/redrob-shared/account.json',
    )
  })

  test('macOS uses Application Support/ai.redrob.shared', () => {
    expect(sharedAccountPath('darwin', {}, '/Users/someone')).toBe(
      '/Users/someone/Library/Application Support/ai.redrob.shared/account.json',
    )
  })

  test('windows uses %APPDATA%\\Redrob\\Shared', () => {
    expect(
      sharedAccountPath(
        'win32',
        { APPDATA: 'C:\\Users\\s\\AppData\\Roaming' },
        'C:\\Users\\s',
      ),
    ).toBe('C:\\Users\\s\\AppData\\Roaming\\Redrob\\Shared\\account.json')
  })
})

describe('the shared launcher key is the fallback for a keyless Redrob Console provider', () => {
  let dir: string
  let file: string
  const savedEnv = process.env.REDROB_SHARED_DIR

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'redrob-shared-'))
    process.env.REDROB_SHARED_DIR = dir
    file = sharedAccountPath()
    expect(file).toBe(join(dir, 'account.json'))
  })

  afterEach(() => {
    closeDb()
    if (savedEnv === undefined) delete process.env.REDROB_SHARED_DIR
    else process.env.REDROB_SHARED_DIR = savedEnv
    rmSync(dir, { recursive: true, force: true })
  })

  function signInLauncher(apiKey = SHARED_KEY) {
    writeFileSync(
      file,
      JSON.stringify({
        apiKey,
        apiKeyName: 'laptop',
        accountName: 'Acme',
        apiBaseUrl: CONSOLE,
      }),
    )
  }

  test('no key anywhere: not signed in', () => {
    expect(readSharedAccount()).toBeNull()
    expect(launcherSignIn().signedIn).toBe(false)
    const { config, viaLauncher } = withLauncherFallback(
      'redrob-console',
      row(),
    )
    expect(viaLauncher).toBe(false)
    expect(config.apiKey).toBeNull()
    expect(providerRowToLlmConfig(row()).apiKey).toBeUndefined()
  })

  test('a file without a usable apiKey is not a sign-in', () => {
    writeFileSync(file, JSON.stringify({ apiKey: '  ', accountName: 'Acme' }))
    expect(readSharedAccount()).toBeNull()
    writeFileSync(file, 'not json')
    expect(readSharedAccount()).toBeNull()
    writeFileSync(file, '[]')
    expect(readSharedAccount()).toBeNull()
  })

  test('shared file only: its key is used and flagged as the launcher', () => {
    signInLauncher()
    const { config, viaLauncher } = withLauncherFallback(
      'redrob-console',
      row({ baseUrl: null }),
    )
    expect(viaLauncher).toBe(true)
    expect(config.apiKey).toBe(SHARED_KEY)
    // A blank base URL is taken from the shared file, never left dangling.
    expect(config.baseUrl).toBe(CONSOLE)
    expect(providerRowToLlmConfig(row()).apiKey).toBe(SHARED_KEY)
  })

  test('own key and shared file: the own key wins', () => {
    signInLauncher()
    const { config, viaLauncher } = withLauncherFallback(
      'redrob-console',
      row({ apiKey: OWN_KEY }),
    )
    expect(viaLauncher).toBe(false)
    expect(config.apiKey).toBe(OWN_KEY)
    expect(providerRowToLlmConfig(row({ apiKey: OWN_KEY })).apiKey).toBe(
      OWN_KEY,
    )
  })

  test('only a Redrob Console provider is eligible', () => {
    signInLauncher()
    const { config, viaLauncher } = withLauncherFallback(
      'openai',
      row({ type: 'openai' }),
    )
    expect(viaLauncher).toBe(false)
    expect(config.apiKey).toBeNull()
  })

  test('the key is read at use time: a sign-out or a new key applies to the next read', () => {
    signInLauncher()
    expect(providerRowToLlmConfig(row()).apiKey).toBe(SHARED_KEY)
    signInLauncher('rk_launcher_rotated')
    expect(providerRowToLlmConfig(row()).apiKey).toBe('rk_launcher_rotated')
    rmSync(file)
    expect(providerRowToLlmConfig(row()).apiKey).toBeUndefined()
    expect(launcherSignIn().signedIn).toBe(false)
  })

  test('GET /launcher reports the account, never the key', async () => {
    signInLauncher()
    const res = await createRedrobConsoleRoutes().request('/launcher')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      signedIn: true,
      apiKeyName: 'laptop',
      accountName: 'Acme',
      apiBaseUrl: CONSOLE,
    })
    expect(JSON.stringify(body)).not.toContain(SHARED_KEY)
  })

  test('the store flags a keyless row as viaLauncher and disconnecting leaves the shared file alone', async () => {
    initializeDb({ dbPath: join(dir, 'db', 'browseros.sqlite') })
    signInLauncher()
    await dbProviderStore.upsert({
      id: 'redrob-1',
      type: 'redrob-console',
      name: 'Redrob Console',
      modelId: 'auto',
      contextWindow: 128000,
      baseUrl: CONSOLE,
    })
    await dbProviderStore.upsert({
      id: 'redrob-own',
      type: 'redrob-console',
      name: 'Redrob Console (own key)',
      modelId: 'auto',
      contextWindow: 128000,
      baseUrl: CONSOLE,
      apiKey: OWN_KEY,
    })
    await dbProviderStore.upsert({
      id: 'openai-1',
      type: 'openai',
      name: 'OpenAI',
      modelId: 'gpt-5.5',
      contextWindow: 200000,
    })

    const listed = await dbProviderStore.list()
    const flags = Object.fromEntries(
      listed.map((p) => [p.id, [p.hasApiKey, p.viaLauncher]]),
    )
    expect(flags).toEqual({
      'redrob-1': [false, true],
      'redrob-own': [true, false],
      'openai-1': [false, false],
    })
    expect((await dbProviderStore.get('redrob-1'))?.viaLauncher).toBe(true)
    // The public reads still never carry a key, the launcher's included.
    expect(JSON.stringify(listed)).not.toContain(SHARED_KEY)

    // "Disconnect" is removing the app's own provider; the shared file is not ours to touch.
    expect(await dbProviderStore.remove('redrob-own')).toBe(true)
    expect(await dbProviderStore.remove('redrob-1')).toBe(true)
    expect(existsSync(file)).toBe(true)
    expect(readSharedAccount()?.apiKey).toBe(SHARED_KEY)

    // Signing out in the launcher drops the flag on the next read.
    await dbProviderStore.upsert({
      id: 'redrob-1',
      type: 'redrob-console',
      name: 'Redrob Console',
      modelId: 'auto',
      contextWindow: 128000,
      baseUrl: CONSOLE,
    })
    rmSync(file)
    expect((await dbProviderStore.get('redrob-1'))?.viaLauncher).toBe(false)
  })
})
