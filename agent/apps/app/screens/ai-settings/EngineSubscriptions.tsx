/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import { type FC, useCallback, useEffect, useMemo, useState } from 'react'
import {
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/SettingsLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

/**
 * Subscriptions and providers, as the ENGINE reports them (SUB-1..4), and the agent-task setting that
 * keeps work running after the last window closes (CAP-4).
 *
 * Nothing here is a list of its own. The browser asks the engine (redrobPrivate.getEngineAccount) which
 * providers it knows, which are connected and how each can be connected, and renders that -- a second
 * list in the page would be a second truth. A subscription is connected with the ENGINE's own OAuth: the
 * browser opens the provider's page in a tab, the engine keeps the result. An API key sits behind the
 * subscription options and goes one way, into the engine's store; nothing reads it back.
 *
 * Usage: the engine has no usage endpoint, so no number is shown. For Redrob the page links to Redrob
 * Console, which is where spend is reported, and says so; for any other provider it says the engine does
 * not report it. A figure with no stated source would be worse than none.
 */

type AuthMethod = { index: number; type: string; methodLabel: string }
type EngineProvider = {
  id: string
  name: string
  source: string
  connected: boolean
  consoleManaged: boolean
  modelCount: number
  methods: AuthMethod[]
}
type EngineAccount = {
  engineReady: boolean
  providers: EngineProvider[]
  consoleOrg: string
}
type SignInStart = { error?: string; instructions: string; needsCode: boolean }

type EngineApi = {
  getEngineAccount(cb: (account: EngineAccount) => void): void
  beginEngineSignIn(
    providerId: string,
    method: number,
    cb: (start: SignInStart) => void,
  ): void
  finishEngineSignIn(
    providerId: string,
    method: number,
    code: string,
    cb: (error?: string) => void,
  ): void
  setEngineProviderKey(
    providerId: string,
    key: string,
    cb: (error?: string) => void,
  ): void
  disconnectEngineProvider(providerId: string, cb: (ok: boolean) => void): void
  getKeepTasksRunning(cb: (value: boolean) => void): void
  setKeepTasksRunning(enabled: boolean): void
}

function api(): EngineApi | null {
  const candidate = (
    globalThis as { chrome?: { redrobPrivate?: Partial<EngineApi> } }
  ).chrome?.redrobPrivate
  return typeof candidate?.getEngineAccount === 'function'
    ? (candidate as EngineApi)
    : null
}

/** Where Redrob Console reports spend. The engine's own retry messages point at the same page. */
const CONSOLE_USAGE_URL = 'https://console.redrob.ai/billing'
const REDROB_PROVIDER_ID = 'redrob'
const SEARCH_LIMIT = 20

function sourceLabel(source: string): string {
  switch (source) {
    case 'env':
      return t('engSourceEnv')
    case 'config':
      return t('engSourceConfig')
    case 'api':
      return t('engSourceStore')
    case 'launcher':
      return t('engSourceLauncher')
    case 'custom':
      return t('engSourceBuiltIn')
    default:
      return t('engSourceUnknown')
  }
}

type Flow =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'waiting'; method: number; instructions: string }
  | { kind: 'code'; method: number; instructions: string; code: string }
  | { kind: 'error'; message: string }

const ProviderRow: FC<{
  provider: EngineProvider
  onChanged: () => void
}> = ({ provider, onChanged }) => {
  const [flow, setFlow] = useState<Flow>({ kind: 'idle' })
  const [showKey, setShowKey] = useState(false)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const browser = api()
  const oauth = provider.methods.filter((m) => m.type === 'oauth')
  const keyMethod = provider.methods.find((m) => m.type === 'api')

  const finish = (method: number, code: string) => {
    if (!browser) return
    browser.finishEngineSignIn(provider.id, method, code, (error) => {
      if (error) {
        setFlow({ kind: 'error', message: error })
        return
      }
      setFlow({ kind: 'idle' })
      onChanged()
    })
  }

  const begin = (method: number) => {
    if (!browser) return
    setFlow({ kind: 'starting' })
    browser.beginEngineSignIn(provider.id, method, (start) => {
      if (start.error) {
        setFlow({ kind: 'error', message: start.error })
        return
      }
      if (start.needsCode) {
        setFlow({
          kind: 'code',
          method,
          instructions: start.instructions,
          code: '',
        })
        return
      }
      setFlow({ kind: 'waiting', method, instructions: start.instructions })
      finish(method, '')
    })
  }

  const saveKey = () => {
    if (!browser || !key.trim()) return
    setBusy(true)
    browser.setEngineProviderKey(provider.id, key, (error) => {
      setBusy(false)
      // The field is cleared either way: the key is not kept in the page once it has been sent.
      setKey('')
      if (error) {
        setFlow({ kind: 'error', message: error })
        return
      }
      setShowKey(false)
      onChanged()
    })
  }

  const disconnect = () => {
    if (!browser) return
    setBusy(true)
    browser.disconnectEngineProvider(provider.id, (ok) => {
      setBusy(false)
      if (!ok) {
        setFlow({ kind: 'error', message: t('engDisconnectFailed') })
        return
      }
      onChanged()
    })
  }

  const status = provider.connected
    ? t('engConnectedFrom', sourceLabel(provider.source))
    : t('engNotConnected')

  return (
    <SettingsRow
      label={provider.name}
      description={
        <span className="flex flex-col gap-1">
          <span>
            {status}
            {provider.consoleManaged ? ` · ${t('engConsoleManaged')}` : ''}
            {provider.modelCount > 0
              ? ` · ${t('engModelCount', provider.modelCount)}`
              : ''}
          </span>
          {provider.connected &&
            (provider.id === REDROB_PROVIDER_ID ? (
              <span>
                {t('engUsageFromConsole')}{' '}
                <a
                  href={CONSOLE_USAGE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {t('engOpenConsoleUsage')}
                </a>
              </span>
            ) : (
              <span>{t('engUsageNotReported')}</span>
            ))}
          {flow.kind === 'waiting' && (
            <span role="status">
              {flow.instructions || t('engFinishInTab')}
            </span>
          )}
          {flow.kind === 'code' && (
            <span className="flex flex-col gap-2">
              <span>{flow.instructions || t('engPasteCode')}</span>
              <span className="flex gap-2">
                <Input
                  aria-label={t('engPasteCode')}
                  value={flow.code}
                  onChange={(e) => setFlow({ ...flow, code: e.target.value })}
                />
                <Button
                  disabled={!flow.code.trim()}
                  onClick={() => {
                    const { method, code } = flow
                    setFlow({ kind: 'waiting', method, instructions: '' })
                    finish(method, code.trim())
                  }}
                >
                  {t('engSubmitCode')}
                </Button>
              </span>
            </span>
          )}
          {flow.kind === 'error' && (
            <span role="alert" className="text-red-600 dark:text-red-400">
              {flow.message}
            </span>
          )}
          {showKey && keyMethod && (
            <span className="flex gap-2">
              <Input
                type="password"
                autoComplete="off"
                aria-label={t('engApiKey')}
                placeholder={t('engApiKey')}
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <Button disabled={busy || !key.trim()} onClick={saveKey}>
                {t('engSaveKey')}
              </Button>
            </span>
          )}
        </span>
      }
    >
      <div className="flex flex-wrap justify-end gap-2">
        {/* Subscriptions first; a key is the fallback behind them (SUB-3). */}
        {oauth.map((method) => (
          <Button
            key={method.index}
            disabled={flow.kind === 'starting' || flow.kind === 'waiting'}
            onClick={() => begin(method.index)}
          >
            {method.methodLabel || t('engSignIn')}
          </Button>
        ))}
        {keyMethod && !showKey && (
          <Button variant="outline" onClick={() => setShowKey(true)}>
            {t('engUseApiKey')}
          </Button>
        )}
        {provider.connected && provider.source === 'api' && (
          <Button variant="outline" disabled={busy} onClick={disconnect}>
            {t('engDisconnect')}
          </Button>
        )}
      </div>
    </SettingsRow>
  )
}

const KeepTasksRunning: FC = () => {
  const browser = api()
  const [value, setValue] = useState<boolean | null>(null)
  useEffect(() => {
    browser?.getKeepTasksRunning(setValue)
  }, [browser])
  if (!browser || value === null) return null
  return (
    <SettingsGroup title={t('engTasksGroup')}>
      <SettingsRow
        label={t('engKeepRunning')}
        description={t('engKeepRunningHint')}
        htmlFor="redrob-keep-running"
      >
        <Switch
          id="redrob-keep-running"
          checked={value}
          onCheckedChange={(next) => {
            setValue(next)
            browser.setKeepTasksRunning(next)
          }}
        />
      </SettingsRow>
    </SettingsGroup>
  )
}

export const EngineSubscriptions: FC = () => {
  const browser = api()
  const [account, setAccount] = useState<EngineAccount | null>(null)
  const [query, setQuery] = useState('')

  const load = useCallback(() => {
    browser?.getEngineAccount(setAccount)
  }, [browser])

  useEffect(load, [load])
  // An engine that is still starting answers "not ready"; ask once more shortly rather than leaving the
  // section empty until the user reloads.
  useEffect(() => {
    if (!account || account.engineReady) return
    const timer = setTimeout(load, 2000)
    return () => clearTimeout(timer)
  }, [account, load])

  const connected = useMemo(
    () => account?.providers.filter((p) => p.connected) ?? [],
    [account],
  )
  const available = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return (account?.providers ?? [])
      .filter(
        (p) =>
          !p.connected &&
          p.methods.length > 0 &&
          (p.name.toLowerCase().includes(q) || p.id.includes(q)),
      )
      .slice(0, SEARCH_LIMIT)
  }, [account, query])

  // Without the private API (a dev build in stock Chromium) there is no engine to ask.
  if (!browser) return null

  return (
    <div className="space-y-6">
      <SettingsGroup title={t('engGroup')}>
        {!account ? (
          <SettingsRow label={t('engLoading')}>{null}</SettingsRow>
        ) : !account.engineReady ? (
          <SettingsRow
            label={t('engNotReady')}
            description={t('engNotReadyHint')}
          >
            <Button variant="outline" onClick={load}>
              {t('engRetry')}
            </Button>
          </SettingsRow>
        ) : (
          <>
            <SettingsRow
              label={t('engPlan')}
              description={
                account.consoleOrg
                  ? t('engConsoleOrg', account.consoleOrg)
                  : t('engNoConsoleOrg')
              }
            >
              {null}
            </SettingsRow>
            {connected.length === 0 && (
              <SettingsRow label={t('engNoneConnected')}>{null}</SettingsRow>
            )}
            {connected.map((p) => (
              <ProviderRow key={p.id} provider={p} onChanged={load} />
            ))}
            <SettingsRow
              label={t('engAddProvider')}
              description={t('engAddProviderHint')}
              htmlFor="redrob-engine-provider-search"
            >
              <Input
                id="redrob-engine-provider-search"
                value={query}
                placeholder={t('engSearchProviders')}
                onChange={(e) => setQuery(e.target.value)}
              />
            </SettingsRow>
            {available.map((p) => (
              <ProviderRow key={p.id} provider={p} onChanged={load} />
            ))}
          </>
        )}
      </SettingsGroup>
      <KeepTasksRunning />
    </div>
  )
}
