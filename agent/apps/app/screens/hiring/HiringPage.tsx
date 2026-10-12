/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Hiring: Talent Scout's page (Recruit plan §3.2). Roles with their criteria; People, the pipeline per
 * role in stage order; and the Record, every step with who did it. Messages and Interviews join the
 * tabs when outreach and scheduling land.
 */

import { activeCriteria } from '@browseros/hiring/criteria'
import { SITES } from '@browseros/hiring/sites'
import { formatRelative, t, tNodes } from '@browseros/i18n'
import { Trash2 } from '@browseros/icons'
import { type FC, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CandidateNotice } from '@/components/hiring/CandidateNotice'
import { CriteriaEditor } from '@/components/hiring/CriteriaEditor'
import {
  RecordReply,
  RoleMode,
  WriteMessage,
} from '@/components/hiring/Outreach'
import { PersonCard } from '@/components/hiring/PersonCard'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAgentServerUrl } from '@/modules/browseros/agent-server-url.hooks'
import {
  type CriterionDraft,
  type Refused,
  type Role,
  useHiringActions,
  usePeople,
  useRecord,
  useRoles,
} from '@/modules/hiring/hiring.hooks'
import {
  eventText,
  refusalText,
  STAGE_LABEL,
  STAGES,
  screenProblem,
} from '@/modules/hiring/labels'
import { MessagesTab } from './MessagesTab'

const showRefused = (refused: Refused[]) => {
  for (const r of refused) toast.error(refusalText(r.text, r.reason))
}

const NewRole: FC<{ onCreated: (id: string) => void }> = ({ onCreated }) => {
  const actions = useHiringActions()
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [criteria, setCriteria] = useState<CriterionDraft[]>([])
  return (
    <form
      className="rr-card space-y-4 p-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!title.trim()) return
        actions.createRole.mutate(
          {
            title,
            location: location || undefined,
            description: description || undefined,
            criteria: criteria.filter((c) => c.text.trim()),
          },
          {
            onSuccess: ({ role, refused }) => {
              showRefused(refused)
              onCreated(role.id)
            },
          },
        )
      }}
    >
      <h2 className="font-semibold text-[15px]">{t('hiringRoleNew')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <span className="space-y-1">
          <label
            htmlFor="hiring-title"
            className="block font-medium text-[13px]"
          >
            {t('hiringRoleTitle')}
          </label>
          <Input
            id="hiring-title"
            value={title}
            placeholder={t('hiringRoleTitlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
          />
        </span>
        <span className="space-y-1">
          <label
            htmlFor="hiring-location"
            className="block font-medium text-[13px]"
          >
            {t('hiringRoleLocation')}
          </label>
          <Input
            id="hiring-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </span>
      </div>
      <span className="block space-y-1">
        <label
          htmlFor="hiring-description"
          className="block font-medium text-[13px]"
        >
          {t('hiringRoleDescription')}
        </label>
        <Textarea
          id="hiring-description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <span className="flex items-center justify-between gap-3 text-[12px] text-[var(--text-secondary)]">
          <span>{t('hiringRoleDescriptionHint')}</span>
          <button
            type="button"
            className="rr-btn rr-btn--secondary rr-btn--sm shrink-0"
            disabled={!description.trim() || actions.propose.isPending}
            aria-busy={actions.propose.isPending}
            onClick={() =>
              actions.propose.mutate(description, {
                onSuccess: ({ proposals, refused }) => {
                  setCriteria((current) => [...current, ...proposals])
                  showRefused(refused)
                },
                onError: () => toast.error(t('hiringSuggestFailed')),
              })
            }
          >
            {t('hiringSuggest')}
          </button>
        </span>
      </span>
      <div className="space-y-2">
        <h3 className="font-medium text-[13px]">{t('hiringCriteria')}</h3>
        <CriteriaEditor items={criteria} onChange={setCriteria} />
      </div>
      <footer className="flex justify-end">
        <button
          type="submit"
          className="rr-btn rr-btn--primary"
          disabled={!title.trim() || actions.createRole.isPending}
        >
          {t('hiringCreate')}
        </button>
      </footer>
    </form>
  )
}

const RoleCard: FC<{ role: Role }> = ({ role }) => {
  const actions = useHiringActions()
  const [items, setItems] = useState<CriterionDraft[]>(role.criteria.items)
  useEffect(() => setItems(role.criteria.items), [role.criteria])
  return (
    <section className="rr-card space-y-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <span>
          <h2 className="font-semibold text-[15px]">{role.title}</h2>
          {role.location ? (
            <span className="text-[13px] text-[var(--text-secondary)]">
              {role.location}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          className="rr-iconbtn rr-iconbtn--sm"
          aria-label={t('hiringDeleteRole')}
          title={t('hiringDeleteRole')}
          onClick={() => {
            if (window.confirm(t('hiringDeleteRoleConfirm', role.title)))
              actions.deleteRole.mutate(role.id)
          }}
        >
          <Trash2 className="size-[14px]" />
        </button>
      </header>
      <CriteriaEditor items={items} onChange={setItems} />
      <RoleMode role={role} />
      <footer className="flex justify-end">
        <button
          type="button"
          className="rr-btn rr-btn--secondary rr-btn--sm"
          disabled={actions.reviseCriteria.isPending}
          onClick={() =>
            actions.reviseCriteria.mutate(
              { roleId: role.id, criteria: items.filter((c) => c.text.trim()) },
              {
                onSuccess: ({ criteria, refused }) => {
                  showRefused(refused)
                  toast.success(t('hiringCriteriaSaved', criteria.version))
                },
              },
            )
          }
        >
          {t('hiringCriteriaSave')}
        </button>
      </footer>
    </section>
  )
}

const People: FC<{ role: Role }> = ({ role }) => {
  const { data: people = [] } = usePeople(role.id)
  const actions = useHiringActions()
  const [open, setOpen] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  if (!people.length) {
    return (
      <div className="rr-empty rr-empty--compact">
        <p className="rr-empty__desc">{t('hiringPeopleEmpty')}</p>
      </div>
    )
  }
  const counts = STAGES.map((stage) => ({
    stage,
    n: people.filter((p) => p.stage === stage).length,
  })).filter((s) => s.n)
  const criteria = activeCriteria(role.criteria)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-[var(--text-secondary)]">
          {counts.map((c) => `${t(STAGE_LABEL[c.stage])} ${c.n}`).join(' · ')}
        </p>
        {criteria.some((c) => !c.check) ? (
          <button
            type="button"
            className="rr-btn rr-btn--secondary rr-btn--sm"
            disabled={actions.screenRole.isPending}
            aria-busy={actions.screenRole.isPending}
            onClick={() =>
              actions.screenRole.mutate(role.id, {
                onSuccess: ({ results }) => {
                  for (const r of results) {
                    if (r.status === 'needs-you') {
                      const name =
                        people.find((p) => p.id === r.personId)?.record.name ??
                        ''
                      toast.error(
                        t(
                          'hiringScreenNeedsYou',
                          name,
                          screenProblem(r.reason),
                        ),
                      )
                    }
                  }
                },
              })
            }
          >
            {t('hiringScreenAll')}
          </button>
        ) : null}
      </div>
      <ul className="space-y-2">
        {people.map((person) => {
          const expanded = open === person.id
          return (
            <li key={person.id} className="rr-card p-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : person.id)}
                >
                  <b className="font-semibold text-[14px]" translate="no">
                    {person.record.name}
                  </b>
                  <span className="ml-2 text-[13px] text-[var(--text-secondary)]">
                    {person.evaluation?.judged
                      ? t(
                          'hiringMeets',
                          person.evaluation.met,
                          person.evaluation.judged,
                        )
                      : t('hiringNotChecked')}
                    {' · '}
                    {tNodes(
                      'hiringOnSites',
                      <span key="s" translate="no">
                        {person.sites
                          .map(
                            (id) =>
                              SITES.find((site) => site.id === id)?.name ?? id,
                          )
                          .join(', ')}
                      </span>,
                    )}
                  </span>
                </button>
                <span className="rr-badge rr-badge--sm rr-badge--subtle rr-badge--neutral shrink-0">
                  {t(STAGE_LABEL[person.stage])}
                </span>
                <span className="text-[12px] text-[var(--text-tertiary)]">
                  {formatRelative(person.foundAt)}
                </span>
              </div>
              {expanded ? (
                <div className="mt-3 space-y-2">
                  <PersonCard
                    role={role}
                    person={person}
                    busy={actions.setStage.isPending}
                    onShortlist={() =>
                      actions.setStage.mutate({
                        roleId: role.id,
                        personId: person.id,
                        stage: 'shortlisted',
                      })
                    }
                    onSetAside={(reason) =>
                      actions.setStage.mutate({
                        roleId: role.id,
                        personId: person.id,
                        stage: 'set-aside',
                        reason,
                      })
                    }
                  />
                  <span className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="rr-btn rr-btn--ghost rr-btn--sm"
                      aria-expanded={notice === person.id}
                      onClick={() =>
                        setNotice(notice === person.id ? null : person.id)
                      }
                    >
                      {t('hiringNoticeShow')}
                    </button>
                    {person.stage === 'shortlisted' ? (
                      <WriteMessage role={role} person={person} />
                    ) : null}
                    {person.stage === 'contacted' ? (
                      <>
                        <WriteMessage
                          role={role}
                          person={person}
                          sequence={1}
                        />
                        <RecordReply role={role} person={person} />
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="rr-btn rr-btn--ghost rr-btn--sm"
                      onClick={() =>
                        actions.screen.mutate({
                          roleId: role.id,
                          personId: person.id,
                        })
                      }
                    >
                      {t('hiringScreen')}
                    </button>
                    <button
                      type="button"
                      className="rr-btn rr-btn--ghost rr-btn--sm"
                      onClick={() => {
                        if (
                          window.confirm(
                            t('hiringOptOutConfirm', person.record.name),
                          )
                        )
                          actions.optOut.mutate(person.id)
                      }}
                    >
                      {t('hiringOptOut')}
                    </button>
                    <button
                      type="button"
                      className="rr-btn rr-btn--ghost rr-btn--sm"
                      onClick={() => {
                        if (
                          window.confirm(
                            t('hiringDeletePersonConfirm', person.record.name),
                          )
                        )
                          actions.deletePerson.mutate(person.id)
                      }}
                    >
                      {t('hiringDeletePerson')}
                    </button>
                  </span>
                  {notice === person.id ? (
                    <CandidateNotice role={role} person={person} />
                  ) : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const Record: FC<{ roleId?: string }> = ({ roleId }) => {
  const { data: events = [] } = useRecord(roleId)
  const { baseUrl } = useAgentServerUrl()
  // The server's audit export: no names, no message text, keyed for joining with the ATS's data.
  const exportRecord = async () => {
    const response = await fetch(
      `${baseUrl}/hiring/record/export${roleId ? `?roleId=${roleId}` : ''}`,
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(await response.blob())
    a.download = 'hiring-record.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-[var(--text-secondary)]">
          {t('hiringRecordHint')}
        </p>
        <button
          type="button"
          className="rr-btn rr-btn--secondary rr-btn--sm shrink-0"
          onClick={() => void exportRecord()}
          disabled={!events.length}
        >
          {t('hiringExportCsv')}
        </button>
      </div>
      {events.length ? (
        <ol className="rr-card divide-y divide-[var(--border-subtle)] text-[13px]">
          {[...events].reverse().map((event) => (
            <li
              key={event.id}
              className="flex items-center justify-between gap-3 px-4 py-2"
            >
              <span>{eventText(event)}</span>
              <span className="shrink-0 text-[12px] text-[var(--text-tertiary)]">
                {event.actor === 'recruiter'
                  ? t('hiringByYou')
                  : t('hiringByRedrob')}{' '}
                · {formatRelative(event.at)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-[var(--text-tertiary)]">
          {t('hiringRecordEmpty')}
        </p>
      )}
    </div>
  )
}

export const HiringPage: FC = () => {
  const { data: roles = [] } = useRoles()
  const [tab, setTab] = useState('roles')
  const [roleId, setRoleId] = useState<string | undefined>()
  const role = roles.find((r) => r.id === roleId) ?? roles[0]
  return (
    <div className="fade-in slide-in-from-bottom-5 mx-auto max-w-3xl animate-in space-y-6 p-6 duration-500">
      <header className="space-y-1">
        <h1 className="font-semibold text-xl">{t('hiringTitle')}</h1>
        <p className="text-[13px] text-[var(--text-secondary)]">
          {t('hiringLede')}
        </p>
        <p className="font-medium text-[13px]">{t('hiringYouDecide')}</p>
      </header>
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <span className="flex flex-wrap items-center justify-between gap-3">
          <TabsList variant="line" aria-label={t('hiringTitle')}>
            <TabsTrigger value="roles">{t('hiringTabRoles')}</TabsTrigger>
            <TabsTrigger value="people">{t('hiringTabPeople')}</TabsTrigger>
            <TabsTrigger value="messages">{t('hiringTabMessages')}</TabsTrigger>
            <TabsTrigger value="record">{t('hiringTabRecord')}</TabsTrigger>
          </TabsList>
          {tab !== 'roles' && roles.length ? (
            <select
              className="rr-select rr-select--sm"
              aria-label={t('hiringRoleTitle')}
              value={role?.id ?? ''}
              onChange={(e) => setRoleId(e.target.value || undefined)}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          ) : null}
        </span>
        <TabsContent value="roles" className="space-y-4">
          {roles.length === 0 ? (
            <p className="text-[13px] text-[var(--text-secondary)]">
              {t('hiringRolesEmpty')}
            </p>
          ) : null}
          {roles.map((r) => (
            <RoleCard key={r.id} role={r} />
          ))}
          <NewRole
            onCreated={(id) => {
              setRoleId(id)
            }}
          />
        </TabsContent>
        <TabsContent value="people">
          {role ? (
            <People role={role} />
          ) : (
            <p className="text-[13px] text-[var(--text-secondary)]">
              {t('hiringRolesEmpty')}
            </p>
          )}
        </TabsContent>
        <TabsContent value="messages">
          {role ? <MessagesTab role={role} /> : null}
        </TabsContent>
        <TabsContent value="record">
          <Record roleId={role?.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
