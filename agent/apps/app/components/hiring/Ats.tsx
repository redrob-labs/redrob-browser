/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Saving to the team's ATS (Recruit plan §4.4). Every system works through the recruiter's own tab,
 * from the side panel; Greenhouse, Lever and Ashby can also be connected with a key the team's admin
 * gives, and then save directly. Nothing here rejects, archives or dispositions anyone.
 */

import { getLocale, t } from '@browseros/i18n'
import { type FC, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { atsSaveRequestStorage } from '@/lib/hiring/hiringStorage'
import {
  type AtsConnectInput,
  type AtsId,
  AtsRefused,
  type ConnectableAts,
  type PersonOnRole,
  type Role,
  useAtsActions,
  useAtsConnections,
} from '@/modules/hiring/hiring.hooks'
import { atsName, atsProblem } from '@/modules/hiring/labels'

const ALL: AtsId[] = ['greenhouse', 'lever', 'ashby', 'workday']

const ConnectForm: FC<{ ats: ConnectableAts; onDone: () => void }> = ({
  ats,
  onDone,
}) => {
  const actions = useAtsActions()
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const name = atsName(ats)
  const input: AtsConnectInput =
    ats === 'greenhouse'
      ? { ats, clientId: a, clientSecret: b }
      : ats === 'lever'
        ? { ats, key: a, email: b }
        : { ats, key: a }
  const ready = a.trim() && (ats === 'ashby' || b.trim())
  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    secret: boolean,
  ) => (
    <label htmlFor={id} className="block space-y-1 text-[12px]">
      <span>{label}</span>
      <Input
        id={id}
        type={secret ? 'password' : 'text'}
        autoComplete="off"
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  )
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        actions.connect.mutate(input, {
          onSuccess: () => {
            toast.success(t('hiringAtsDidConnect', name))
            onDone()
          },
          onError: (error) =>
            toast.error(
              t(
                'hiringAtsFailed',
                atsProblem(
                  error instanceof AtsRefused ? error.code : 'unreachable',
                ),
              ),
            ),
        })
      }}
    >
      <p className="text-[12px] text-[var(--text-secondary)]">
        {ats === 'greenhouse'
          ? t('hiringAtsGreenhouseHint')
          : t('hiringAtsKeyHint', name)}
      </p>
      {ats === 'greenhouse' ? (
        <>
          {field(`${ats}-a`, t('hiringAtsClientId'), a, setA, false)}
          {field(`${ats}-b`, t('hiringAtsClientSecret'), b, setB, true)}
        </>
      ) : (
        <>
          {field(`${ats}-a`, t('hiringAtsKey'), a, setA, true)}
          {ats === 'lever'
            ? field(`${ats}-b`, t('hiringAtsLeverEmail'), b, setB, false)
            : null}
        </>
      )}
      <span className="flex justify-end gap-2">
        <button
          type="button"
          className="rr-btn rr-btn--ghost rr-btn--sm"
          onClick={onDone}
        >
          {t('hiringAtsCancel')}
        </button>
        <button
          type="submit"
          className="rr-btn rr-btn--primary rr-btn--sm"
          disabled={!ready || actions.connect.isPending}
          aria-busy={actions.connect.isPending}
        >
          {t('hiringAtsConnectButton')}
        </button>
      </span>
    </form>
  )
}

/** "Your ATS (optional)": connect Greenhouse, Lever or Ashby, or leave it to the browser. */
export const AtsConnections: FC = () => {
  const { data: connections = [] } = useAtsConnections()
  const actions = useAtsActions()
  const [open, setOpen] = useState<ConnectableAts | null>(null)
  return (
    <section className="rr-card space-y-3 p-5">
      <header className="space-y-1">
        <h2 className="font-semibold text-[14px]">{t('hiringAtsTitle')}</h2>
        <p className="text-[12px] text-[var(--text-secondary)]">
          {t('hiringAtsLede')}
        </p>
      </header>
      <ul className="space-y-2">
        {connections.map(({ ats, connected }) => (
          <li key={ats} className="space-y-2">
            <span className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span translate="no">
                {connected
                  ? t('hiringAtsConnected', atsName(ats))
                  : atsName(ats)}
              </span>
              {connected ? (
                <button
                  type="button"
                  className="rr-btn rr-btn--ghost rr-btn--sm"
                  onClick={() => actions.disconnect.mutate(ats)}
                >
                  {t('hiringAtsDisconnect')}
                </button>
              ) : open !== ats ? (
                <button
                  type="button"
                  className="rr-btn rr-btn--secondary rr-btn--sm"
                  onClick={() => setOpen(ats)}
                >
                  {t('hiringAtsConnect', atsName(ats))}
                </button>
              ) : null}
            </span>
            {open === ats && !connected ? (
              <ConnectForm ats={ats} onDone={() => setOpen(null)} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * "Save to <ATS>" on someone shortlisted: directly when that system is connected, otherwise in the
 * recruiter's own tab from the side panel, where a stage move is offered only if they name one.
 */
export const SaveToAts: FC<{ role: Role; person: PersonOnRole }> = ({
  role,
  person,
}) => {
  const { data: connections = [] } = useAtsConnections()
  const actions = useAtsActions()
  const connected = connections.filter((c) => c.connected).map((c) => c.ats)
  const fromSite = ALL.find((a) => a === person.record.site)
  const [picked, setPicked] = useState<AtsId | undefined>()
  const ats = picked ?? fromSite ?? connected[0] ?? 'greenhouse'
  const [stage, setStage] = useState('')
  const direct = (connected as AtsId[]).includes(ats)
  const name = atsName(ats)
  const save = () => {
    if (direct) {
      actions.save.mutate(
        {
          roleId: role.id,
          personId: person.id,
          ats: ats as ConnectableAts,
          locale: getLocale(),
        },
        {
          onSuccess: (out) =>
            out.status === 'saved'
              ? toast.success(t('hiringSavedTo', name))
              : toast.error(t('hiringAtsFailed', atsProblem(out.reason))),
          onError: () =>
            toast.error(t('hiringAtsFailed', atsProblem('rejected'))),
        },
      )
      return
    }
    void atsSaveRequestStorage
      .setValue({
        roleId: role.id,
        personId: person.id,
        name: person.record.name,
        ats,
        ...(stage.trim() ? { stage: stage.trim() } : {}),
      })
      .then(() => toast(t('hiringSaveQueued', name)))
  }
  return (
    <span className="flex w-full flex-wrap items-center justify-end gap-2">
      <select
        className="rr-select rr-select--sm"
        aria-label={t('hiringSaveIn')}
        value={ats}
        onChange={(e) => setPicked(e.target.value as AtsId)}
      >
        {ALL.map((a) => (
          <option key={a} value={a}>
            {atsName(a)}
          </option>
        ))}
      </select>
      {direct ? null : (
        <Input
          className="h-8 w-56 text-[12px]"
          value={stage}
          placeholder={t('hiringSaveStage', name)}
          aria-label={t('hiringSaveStage', name)}
          onChange={(e) => setStage(e.target.value)}
        />
      )}
      <button
        type="button"
        className="rr-btn rr-btn--secondary rr-btn--sm"
        disabled={actions.save.isPending}
        aria-busy={actions.save.isPending}
        onClick={save}
      >
        {t('hiringSaveTo', name)}
      </button>
    </span>
  )
}
