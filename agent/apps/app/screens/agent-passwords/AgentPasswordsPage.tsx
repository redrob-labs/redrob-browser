/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Settings > Passwords and the agent (CAP-9). See docs/CREDENTIALS.md.
 *
 * Four things, in the order a user needs them: WHEN the agent may sign in (the policy and the unlock
 * window), what is WAITING on them right now, the per-site list, and what the agent DID (the AI sign-in
 * history). The passwords themselves are not on this page and cannot be: the browser answers this page
 * with origins, usernames and outcomes only, and the store lives in the password manager this page opens.
 */

import { t } from '@browseros/i18n'
import { Trash2 } from '@browseros/icons'
import {
  type FC,
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useState,
} from 'react'
import {
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
} from '@/components/settings/SettingsLayout'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import {
  type AgentCredentialPolicy,
  type AgentCredentialSettings,
  available,
  clearHistory,
  getSettings,
  lock,
  openPasswordManager,
  removeSite,
  resumeTask,
  setPolicy,
  setSite,
  setUnlockMinutes,
  toOrigin,
  unlock,
} from '@/lib/agent-passwords/agent-passwords'

const POLICIES = [
  { value: 'always', label: 'apwPolicyAlways', hint: 'apwPolicyAlwaysHint' },
  {
    value: 'whileUnlocked',
    label: 'apwPolicyWhileUnlocked',
    hint: 'apwPolicyWhileUnlockedHint',
  },
  { value: 'never', label: 'apwPolicyNever', hint: 'apwPolicyNeverHint' },
] as const satisfies readonly {
  value: AgentCredentialPolicy
  label: Parameters<typeof t>[0]
  hint: Parameters<typeof t>[0]
}[]

const UNLOCK_CHOICES = [5, 15, 30, 60, 240]

const OUTCOME_LABELS: Record<string, Parameters<typeof t>[0]> = {
  filled: 'apwOutcomeFilled',
  noSavedLogin: 'apwOutcomeNoSavedLogin',
  refused: 'apwOutcomeRefused',
  locked: 'apwOutcomeLocked',
  severalLogins: 'apwOutcomeSeveralLogins',
  noSigninForm: 'apwOutcomeNoSigninForm',
  needsVerification: 'apwOutcomeNeedsVerification',
  failed: 'apwOutcomeFailed',
}

/** The unlock state changes by the clock, not by an event, so the page re-reads it while it is open. */
const REFRESH_MS = 15_000

export const AgentPasswordsPage: FC = () => {
  const [settings, setSettings] = useState<AgentCredentialSettings | null>(
    null,
  )
  const [unlockError, setUnlockError] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const reload = useCallback(async () => {
    if (!available()) return
    setSettings(await getSettings())
  }, [])

  useEffect(() => {
    void reload()
    const timer = setInterval(() => void reload(), REFRESH_MS)
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [reload])

  const onUnlock = async () => {
    setUnlockError(false)
    const ok = await unlock()
    if (!ok) setUnlockError(true)
    await reload()
  }

  return (
    <div className="fade-in slide-in-from-bottom-5 animate-in space-y-8 duration-500">
      <SettingsHeader title={t('apwTitle')} lede={t('apwLede')} />
      {settings?.offTheRecord && (
        <p className="rr-panellede">{t('apwOffTheRecord')}</p>
      )}
      {settings && !settings.offTheRecord && (
        <>
          <PolicyGroup
            settings={settings}
            unlockError={unlockError}
            onUnlock={onUnlock}
            onChanged={reload}
          />
          {settings.waiting.length > 0 && (
            <SettingsGroup title={t('apwWaitingGroup')}>
              {settings.waiting.map((wait) => (
                <SettingsRow
                  key={wait.taskId}
                  label={wait.prompt}
                  description={t(
                    wait.needsUnlock ? 'apwWaitingUnlock' : 'apwWaitingVerify',
                    wait.origin,
                  )}
                >
                  <button
                    type="button"
                    className="rr-btn rr-btn--sm rr-btn--primary"
                    onClick={async () => {
                      if (wait.needsUnlock) await onUnlock()
                      else await resumeTask(wait.taskId)
                      await reload()
                    }}
                  >
                    {t(
                      wait.needsUnlock
                        ? 'apwUnlockAndContinue'
                        : 'apwFinishedContinue',
                    )}
                  </button>
                </SettingsRow>
              ))}
            </SettingsGroup>
          )}
          <SitesGroup settings={settings} onChanged={reload} />
          <SettingsGroup title={t('apwHistoryGroup')}>
            <HistoryTable settings={settings} />
            {settings.history.length > 0 && (
              <div className="ui-settings-row justify-end">
                <button
                  type="button"
                  className="rr-btn rr-btn--sm rr-btn--ghost"
                  onClick={() => setConfirmClear(true)}
                >
                  {t('apwHistoryClear')}
                </button>
              </div>
            )}
          </SettingsGroup>
        </>
      )}
      {settings && (
        <SettingsGroup title={t('apwStoreGroup')}>
          <SettingsRow
            label={t('apwStoreGroup')}
            description={t('apwStoreHint')}
          >
            <button
              type="button"
              className="rr-btn rr-btn--sm rr-btn--secondary"
              onClick={() => openPasswordManager()}
            >
              {t('apwOpenManager')}
            </button>
          </SettingsRow>
        </SettingsGroup>
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('apwHistoryClearConfirm')}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('spCancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                clearHistory()
                await reload()
              }}
            >
              {t('apwHistoryClear')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const PolicyGroup: FC<{
  settings: AgentCredentialSettings
  unlockError: boolean
  onUnlock: () => Promise<void>
  onChanged: () => Promise<void>
}> = ({ settings, unlockError, onUnlock, onChanged }) => {
  const policyId = useId()
  const minutesId = useId()
  const minuteChoices = UNLOCK_CHOICES.includes(settings.unlockMinutes)
    ? UNLOCK_CHOICES
    : [...UNLOCK_CHOICES, settings.unlockMinutes].sort((a, b) => a - b)
  return (
    <SettingsGroup title={t('apwPolicyGroup')}>
      <SettingsRow label={t('apwPolicyLabel')} labelId={policyId}>
        <div
          role="radiogroup"
          aria-labelledby={policyId}
          className="flex flex-col gap-2"
        >
          {POLICIES.map(({ value, label, hint }) => (
            <label key={value} className="flex items-start gap-2">
              <input
                type="radio"
                name="agent-credential-policy"
                value={value}
                checked={settings.policy === value}
                onChange={async () => {
                  setPolicy(value)
                  await onChanged()
                }}
              />
              <span className="flex flex-col">
                <span className="ui-settings-row__label">{t(label)}</span>
                <span className="ui-settings-row__desc">{t(hint)}</span>
              </span>
            </label>
          ))}
        </div>
      </SettingsRow>
      {settings.policy === 'whileUnlocked' && (
        <>
          <SettingsRow
            label={t('apwUnlockMinutes')}
            description={t('apwUnlockMinutesHint')}
            htmlFor={minutesId}
          >
            <select
              id={minutesId}
              className="rr-control rr-control--md"
              value={settings.unlockMinutes}
              onChange={async (event) => {
                setUnlockMinutes(Number(event.target.value))
                await onChanged()
              }}
            >
              {minuteChoices.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t('apwMinutes', minutes)}
                </option>
              ))}
            </select>
          </SettingsRow>
          <SettingsRow
            label={t('apwStatus')}
            description={
              unlockError
                ? t('apwUnlockFailed')
                : t(settings.unlocked ? 'apwUnlocked' : 'apwLocked')
            }
          >
            {settings.unlocked ? (
              <button
                type="button"
                className="rr-btn rr-btn--sm rr-btn--secondary"
                onClick={async () => {
                  lock()
                  await onChanged()
                }}
              >
                {t('apwLockNow')}
              </button>
            ) : (
              <button
                type="button"
                className="rr-btn rr-btn--sm rr-btn--primary"
                onClick={() => void onUnlock()}
              >
                {t('apwUnlockNow')}
              </button>
            )}
          </SettingsRow>
        </>
      )}
    </SettingsGroup>
  )
}

const SitesGroup: FC<{
  settings: AgentCredentialSettings
  onChanged: () => Promise<void>
}> = ({ settings, onChanged }) => {
  const inputId = useId()
  const [draft, setDraft] = useState('')
  const [allowDraft, setAllowDraft] = useState(false)
  const [invalid, setInvalid] = useState(false)

  const onAdd = async (event: FormEvent) => {
    event.preventDefault()
    const origin = toOrigin(draft)
    if (!origin || !(await setSite(origin, allowDraft))) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setDraft('')
    await onChanged()
  }

  return (
    <SettingsGroup title={t('apwSitesGroup')}>
      <p className="ui-settings-row ui-settings-row__desc">
        {t('apwSitesHint')}
      </p>
      {settings.sites.length === 0 && (
        <p className="ui-settings-row ui-settings-row__desc">
          {t('apwSitesEmpty')}
        </p>
      )}
      {settings.sites.map((site) => (
        <SettingsRow key={site.origin} label={site.origin}>
          <div className="flex items-center gap-2">
            <select
              className="rr-control rr-control--sm"
              aria-label={site.origin}
              value={site.allow ? 'allow' : 'block'}
              onChange={async (event) => {
                await setSite(site.origin, event.target.value === 'allow')
                await onChanged()
              }}
            >
              <option value="allow">{t('apwAllow')}</option>
              <option value="block">{t('apwBlock')}</option>
            </select>
            <button
              type="button"
              className="rr-iconbtn rr-iconbtn--sm"
              aria-label={t('apwRemoveSite', site.origin)}
              title={t('apwRemoveSite', site.origin)}
              onClick={async () => {
                await removeSite(site.origin)
                await onChanged()
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </SettingsRow>
      ))}
      <form className="ui-settings-row flex-wrap gap-2" onSubmit={onAdd}>
        <label htmlFor={inputId} className="ui-settings-row__label">
          {t('apwSiteOrigin')}
        </label>
        <Input
          id={inputId}
          type="url"
          className="min-w-64 flex-1"
          placeholder={t('apwSitePlaceholder')}
          value={draft}
          aria-invalid={invalid || undefined}
          onChange={(event) => setDraft(event.target.value)}
        />
        <select
          className="rr-control rr-control--md"
          aria-label={t('apwSiteOrigin')}
          value={allowDraft ? 'allow' : 'block'}
          onChange={(event) => setAllowDraft(event.target.value === 'allow')}
        >
          <option value="block">{t('apwBlock')}</option>
          <option value="allow">{t('apwAllow')}</option>
        </select>
        <button
          type="submit"
          className="rr-btn rr-btn--sm rr-btn--secondary"
          disabled={!draft.trim()}
        >
          {t('apwAddSite')}
        </button>
        {invalid && (
          <p role="alert" className="ui-settings-row__desc w-full">
            {t('apwSiteInvalid')}
          </p>
        )}
      </form>
    </SettingsGroup>
  )
}

const HistoryTable: FC<{ settings: AgentCredentialSettings }> = ({
  settings,
}) => {
  if (settings.history.length === 0) {
    return (
      <p className="ui-settings-row ui-settings-row__desc">
        {t('apwHistoryEmpty')}
      </p>
    )
  }
  return (
    <div className="ui-settings-row overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th scope="col">{t('apwHistoryTime')}</th>
            <th scope="col">{t('apwHistorySite')}</th>
            <th scope="col">{t('apwHistoryUser')}</th>
            <th scope="col">{t('apwHistoryTask')}</th>
            <th scope="col">{t('apwHistoryResult')}</th>
          </tr>
        </thead>
        <tbody>
          {settings.history.map((record, index) => (
            <tr key={`${record.timeMs}-${index}`}>
              <td>{new Date(record.timeMs).toLocaleString()}</td>
              <td>{record.origin}</td>
              <td>{record.username || t('apwNoUsername')}</td>
              <td className="font-mono text-xs">{record.taskId}</td>
              <td>
                {OUTCOME_LABELS[record.outcome]
                  ? t(OUTCOME_LABELS[record.outcome])
                  : record.outcome}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
