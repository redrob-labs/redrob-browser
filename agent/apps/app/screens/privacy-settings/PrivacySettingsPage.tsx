/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Settings, Privacy. Top to bottom: whether protection is on and running here, what happens at
 * Send, the level, the sites AI never reads, the names to keep private, and what it can miss.
 *
 * Every row is a title, one line under it, and exactly one control on the right: the settings row
 * pattern redesign 4.4 adopts for all of Settings, so this page needs no rework when it lands.
 */

import { t, tCount, tNodes } from '@browseros/i18n'
import { Lock, ShieldCheck, ShieldX, Trash2 } from '@browseros/icons'
import { ProtectionStatus } from '@redrob-labs/ui'
import { type FC, type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  usePrivacyStatus,
  useRetryPrivacyModel,
  useUpdatePrivacy,
} from '@/modules/privacy/privacy.hooks'
import {
  levelLocked,
  PRIVACY_LEVELS,
  type PrivacyLevel,
  type PrivacyStatus,
} from '@/modules/privacy/privacy.types'
import {
  LEVEL_DETAIL,
  LEVEL_NAME,
  modelNote,
  teamRefusal,
} from '@/modules/privacy/privacy-copy'

/** `김지원 | Jiwon Kim` per line, to the server's groups of forms. */
export function parseNames(text: string): string[][] {
  return text
    .split('\n')
    .map((line) =>
      line
        .split('|')
        .map((form) => form.trim())
        .filter(Boolean),
    )
    .filter((forms) => forms.length > 0)
}

export function formatNames(names: string[][]): string {
  return names.map((forms) => forms.join(' | ')).join('\n')
}

const Section: FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="rr-card space-y-3 p-5">
    <h3 className="font-semibold text-[15px]">{title}</h3>
    {children}
  </section>
)

/** A placeholder or an example, shown as data rather than copy. */
const Code: FC<{ children: string }> = ({ children }) => (
  <code
    translate="no"
    className="rounded bg-[var(--surface-sunken)] px-1 text-[12px]"
  >
    {children}
  </code>
)

const Row: FC<{
  title: string
  text: React.ReactNode
  control?: React.ReactNode
}> = ({ title, text, control }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0 space-y-0.5">
      <div className="font-medium text-sm">{title}</div>
      <p className="text-[13px] text-[var(--text-secondary)]">{text}</p>
    </div>
    {control ? <div className="shrink-0">{control}</div> : null}
  </div>
)

export const PrivacySettingsPage: FC = () => {
  const { data: status, isError, isLoading } = usePrivacyStatus()
  if (isLoading) return null
  if (isError || !status) {
    return (
      <ProtectionStatus
        tone="warn"
        title={t('privacyPageLoadFailed')}
        icon={<ShieldX />}
      />
    )
  }
  return <PrivacySettingsView status={status} />
}

export const PrivacySettingsView: FC<{ status: PrivacyStatus }> = ({
  status,
}) => {
  const update = useUpdatePrivacy()
  const retry = useRetryPrivacyModel()
  const [site, setSite] = useState('')
  const [names, setNames] = useState(formatNames(status.names))

  const save = (change: Parameters<typeof update.mutate>[0], done?: string) =>
    update.mutate(change, {
      onSuccess: () => done && toast.success(done),
      onError: () => toast.error(t('privacyPageSaveFailed')),
    })

  const addSite = (event: FormEvent) => {
    event.preventDefault()
    if (!site.trim()) return
    save({ neverReadSites: [...status.neverReadSites, site.trim()] })
    setSite('')
  }

  const on = status.level !== 'off'
  const note = modelNote(status.level, status.detector)
  const locked = levelLocked(status)
  const team = status.team?.state === 'active' ? status.team : null
  const refused = teamRefusal(status.team?.refused)

  return (
    <div className="fade-in slide-in-from-bottom-5 animate-in space-y-6 duration-500">
      <ProtectionStatus
        size="lg"
        tone={on ? 'safe' : 'warn'}
        icon={on ? <ShieldCheck /> : <ShieldX />}
        title={
          on
            ? `${t('privacyOnTitle')}: ${t(LEVEL_NAME[status.level])}`
            : t('privacyOffTitle')
        }
        live={on ? t('privacyRunning') : undefined}
      >
        {team?.setBy ? (
          <span className="mb-1 flex items-center gap-1.5 font-medium">
            <Lock className="size-[14px]" aria-hidden />
            {tNodes(
              'privacyTeamSetBy',
              <span key="n" translate="no">
                {team.setBy}
              </span>,
            )}
          </span>
        ) : null}
        {on
          ? t('privacyKeptWeek', status.keptThisWeek)
          : t('privacyLevelOffDetail')}
        {note ? (
          <span className="mt-2 flex items-center gap-3">
            <span>{note}</span>
            {status.detector.state === 'failed' ? (
              <button
                type="button"
                className="rr-btn rr-btn--secondary rr-btn--sm"
                onClick={() => retry.mutate()}
              >
                {t('privacyModelRetry')}
              </button>
            ) : null}
          </span>
        ) : null}
      </ProtectionStatus>

      {refused ? (
        <ProtectionStatus tone="warn" title={refused} icon={<ShieldX />} />
      ) : null}

      <Section title={t('privacyPageSendTitle')}>
        <Row
          title={t('privacyPageStep1Title')}
          text={t('privacyPageStep1Text')}
        />
        <Row
          title={t('privacyPageStep2Title')}
          text={tNodes(
            'privacyPageStep2Text',
            <Code key="e">[EMAIL_1]</Code>,
            <Code key="c">[CARD_1]</Code>,
            <Code key="s">[SECRET_1]</Code>,
          )}
        />
        <Row
          title={t('privacyPageStep3Title')}
          text={t('privacyPageStep3Text')}
        />
      </Section>

      <Section title={t('privacyPageLevelsTitle')}>
        {locked ? (
          <p className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
            <Lock className="size-[14px] shrink-0" aria-hidden />
            {t('privacyTeamLocked')}
          </p>
        ) : null}
        <div className="space-y-3">
          {PRIVACY_LEVELS.map((level: PrivacyLevel) => {
            const current = level === status.level
            return (
              <Row
                key={level}
                title={t(LEVEL_NAME[level])}
                text={t(LEVEL_DETAIL[level])}
                control={
                  current ? (
                    <span className="rr-badge rr-badge--subtle rr-badge--success rr-badge--sm">
                      {locked
                        ? t('privacyTeamLockedLevel')
                        : t('privacyPageYourLevel')}
                    </span>
                  ) : locked ? null : (
                    <button
                      type="button"
                      aria-label={`${t('privacyPageUseLevel')}: ${t(LEVEL_NAME[level])}`}
                      className="rr-btn rr-btn--ghost rr-btn--sm"
                      disabled={update.isPending}
                      onClick={() => save({ level })}
                    >
                      {t('privacyPageUseLevel')}
                    </button>
                  )
                }
              />
            )
          })}
        </div>
      </Section>

      <Section title={t('privacyPageSitesTitle')}>
        <p className="text-[13px] text-[var(--text-secondary)]">
          {t('privacyPageSitesText')}
        </p>
        {status.neverReadSites.length === 0 ? (
          <p className="text-[13px] text-[var(--text-tertiary)]">
            {t('privacyPageSitesEmpty')}
          </p>
        ) : (
          <ul className="space-y-1">
            {status.neverReadSites.map((listed) => (
              <li
                key={listed}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span translate="no">{listed}</span>
                <button
                  type="button"
                  className="rr-iconbtn rr-iconbtn--sm"
                  aria-label={t('privacyPageSitesRemove', listed)}
                  title={t('privacyPageSitesRemove', listed)}
                  onClick={() =>
                    save({
                      neverReadSites: status.neverReadSites.filter(
                        (s) => s !== listed,
                      ),
                    })
                  }
                >
                  <Trash2 className="size-[14px]" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addSite} className="flex gap-2">
          <Input
            value={site}
            onChange={(event) => setSite(event.target.value)}
            placeholder={t('privacyPageSitesPlaceholder')}
            aria-label={t('privacyPageSitesAdd')}
          />
          <button type="submit" className="rr-btn rr-btn--secondary">
            {t('privacyPageSitesAdd')}
          </button>
        </form>
      </Section>

      <Section title={t('privacyPageNamesTitle')}>
        <p className="text-[13px] text-[var(--text-secondary)]">
          {tNodes(
            'privacyPageNamesText',
            <Code key="n">김지원 | Jiwon Kim</Code>,
          )}
        </p>
        {team?.names ? (
          <p className="text-[13px] text-[var(--text-secondary)]">
            {tCount('privacyTeamNames', team.names)}
          </p>
        ) : null}
        <Textarea
          translate="no"
          value={names}
          rows={5}
          onChange={(event) => setNames(event.target.value)}
          aria-label={t('privacyPageNamesTitle')}
        />
        <button
          type="button"
          className="rr-btn rr-btn--secondary"
          disabled={update.isPending}
          onClick={() =>
            save({ names: parseNames(names) }, t('privacyPageNamesSaved'))
          }
        >
          {t('privacyPageNamesSave')}
        </button>
      </Section>

      <Section title={t('privacyPageWhereTitle')}>
        <Row
          title={t('privacyPageWhereAgentTitle')}
          text={t('privacyPageWhereAgentText')}
        />
        <Row
          title={t('privacyPageWhereSavedTitle')}
          text={
            status.savedSecrets === 'unavailable'
              ? `${t('privacyPageWhereSavedText')} ${t('privacyPageWhereSavedUnavailable')}`
              : t('privacyPageWhereSavedText')
          }
        />
        <Row
          title={t('privacyPageWhereMissTitle')}
          text={t('privacyPageWhereMissText')}
        />
      </Section>
    </div>
  )
}
