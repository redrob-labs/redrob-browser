/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Talent Scout in the side panel: on a profile, one chip per role (two at most); pressing one reads
 * the open page, adds the person, checks them against the role, and shows the card.
 */

import { t } from '@browseros/i18n'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  type HiringPage,
  hiringPageByTabStorage,
} from '@/lib/hiring/hiringStorage'
import {
  OutreachRefused,
  type PersonOnRole,
  type Role,
  type SetAsideReason,
  useHiringActions,
  useMessages,
  useOutreachActions,
  usePeople,
  useRoles,
} from './hiring.hooks'
import { screenProblem, sendRefusalText, sourceProblem } from './labels'

const READ_MESSAGE = 'redrob:hiring:read-page'

function useActiveHiringPage(): { page: HiringPage | null; tabId?: number } {
  const [tabId, setTabId] = useState<number | undefined>()
  const [map, setMap] = useState<Record<string, HiringPage>>({})
  useEffect(() => {
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => setTabId(tabs[0]?.id))
    const onActivated = (info: { tabId: number }) => setTabId(info.tabId)
    chrome.tabs.onActivated.addListener(onActivated)
    void hiringPageByTabStorage.getValue().then(setMap)
    const unwatch = hiringPageByTabStorage.watch((next) => setMap(next ?? {}))
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated)
      unwatch()
    }
  }, [])
  return {
    page: tabId === undefined ? null : (map[String(tabId)] ?? null),
    tabId,
  }
}

type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'

/**
 * Approved messages are sent here, one per run, in the recruiter's own browser where they can watch:
 * the chip starts the next one, the server's send guard holds the agent to its text, and when the run
 * ends the message is either sent (and recorded) or back in Messages with "Needs you".
 */
function useSending(options: {
  conversationId: string
  status: ChatStatus
  send: (message: string) => void
}) {
  const { data } = useMessages(undefined)
  const outreach = useOutreachActions()
  const running = useRef(false)
  const previous = useRef(options.status)
  const approved = (data?.messages ?? []).filter((m) => m.status === 'approved')

  // biome-ignore lint/correctness/useExhaustiveDependencies: only reacts to the chat finishing
  useEffect(() => {
    const was = previous.current
    previous.current = options.status
    const finished =
      (was === 'streaming' || was === 'submitted') &&
      (options.status === 'ready' || options.status === 'error')
    if (!finished || !running.current) return
    running.current = false
    outreach.end.mutate(options.conversationId, {
      onSuccess: ({ message }) =>
        message?.status === 'sent'
          ? toast.success(t('hiringPanelSent'))
          : toast(t('hiringPanelNotSent')),
    })
  }, [options.status])

  const next = approved[0]
  return {
    sendNext: next
      ? {
          position: 1,
          total: approved.length,
          run: () =>
            outreach.start.mutate(
              { id: next.id, conversationId: options.conversationId },
              {
                onSuccess: ({ instruction }) => {
                  running.current = true
                  options.send(instruction)
                },
                onError: (error) =>
                  toast.error(
                    t(
                      'hiringRefusedSend',
                      sendRefusalText(
                        error instanceof OutreachRefused
                          ? error.code
                          : 'needs-you',
                      ),
                    ),
                  ),
              },
            ),
        }
      : null,
  }
}

export function useHiringPanel(options: {
  conversationId: string
  status: ChatStatus
  send: (message: string) => void
}) {
  const sending = useSending(options)
  const { page, tabId } = useActiveHiringPage()
  const { data: roles = [] } = useRoles()
  const actions = useHiringActions()
  const [checked, setChecked] = useState<{
    role: Role
    personId: string
    url: string
  } | null>(null)
  const { data: people = [] } = usePeople(checked?.role.id)
  const person: PersonOnRole | undefined = checked
    ? people.find((p) => p.id === checked.personId)
    : undefined
  const [busy, setBusy] = useState(false)
  const [reviewed, setReviewed] = useState<{
    role: Role
    url: string
    personIds: string[]
    notChecked: number
    problem?: string
  } | null>(null)
  const { data: reviewedPeople = [] } = usePeople(reviewed?.role.id)

  /** The list the recruiter has open: each profile it links to, read one at a time, then checked. */
  const review = async (role: Role) => {
    if (tabId === undefined || !page) return
    setBusy(true)
    try {
      const read = (await chrome.tabs.sendMessage(tabId, {
        type: READ_MESSAGE,
      })) as { url: string; html: string } | undefined
      if (!read?.html) throw new Error('no page')
      toast(t('hiringReviewing', page.count ?? 0))
      const results = await actions.reviewList.mutateAsync({
        roleId: role.id,
        ...read,
        groupTitle: t('hiringGroupTitle', role.title),
      })
      const ok = results.filter((r) => r.status === 'ok' && r.personId)
      const failed = results.filter((r) => r.status !== 'ok')
      await actions.screenRole.mutateAsync(role.id)
      setReviewed({
        role,
        url: page.url,
        personIds: ok.map((r) => r.personId as string),
        notChecked: failed.length,
        problem: failed.some((r) => r.status === 'limit')
          ? t('hiringReviewLimit')
          : failed[0]
            ? sourceProblem(failed[0].status)
            : undefined,
      })
    } catch {
      toast.error(t('hiringCheckFailed', sourceProblem('failed')))
    } finally {
      setBusy(false)
    }
  }

  const reviewedList =
    reviewed && page && reviewed.url === page.url
      ? {
          role: reviewed.role,
          people: reviewedPeople.filter((p) =>
            reviewed.personIds.includes(p.id),
          ),
          notChecked: reviewed.notChecked,
          problem: reviewed.problem,
        }
      : null

  /** The recruiter's own click: shortlist everyone on the list who meets every must have with evidence. */
  const saveAllMeeting = async () => {
    if (!reviewedList) return
    const meeting = reviewedList.people.filter(
      (p) => p.evaluation?.meetsEveryMust && p.stage === 'found',
    )
    for (const p of meeting) {
      await actions.setStage.mutateAsync({
        roleId: reviewedList.role.id,
        personId: p.id,
        stage: 'shortlisted',
      })
    }
    toast.success(t('hiringSavedAll', meeting.length))
    setReviewed(null)
  }

  // The card belongs to the page it was asked for.
  const showing = checked && page && checked.url === page.url ? checked : null

  const check = async (role: Role) => {
    if (tabId === undefined || !page) return
    setBusy(true)
    try {
      const read = (await chrome.tabs.sendMessage(tabId, {
        type: READ_MESSAGE,
      })) as { url: string; html: string } | undefined
      if (!read?.html) throw new Error('no page')
      const [result] = await actions.addFromPage.mutateAsync({
        roleId: role.id,
        ...read,
      })
      if (result?.status !== 'ok' || !result.personId) {
        toast.error(
          t('hiringCheckFailed', sourceProblem(result?.status ?? 'failed')),
        )
        return
      }
      setChecked({ role, personId: result.personId, url: page.url })
      const screened = await actions.screen.mutateAsync({
        roleId: role.id,
        personId: result.personId,
      })
      if (screened.status === 'needs-you') toast(screenProblem(screened.reason))
    } catch {
      toast.error(t('hiringCheckFailed', sourceProblem('failed')))
    } finally {
      setBusy(false)
    }
  }

  const decide = (
    stage: 'shortlisted' | 'set-aside',
    reason?: SetAsideReason,
  ) => {
    if (!showing) return
    actions.setStage.mutate(
      { roleId: showing.role.id, personId: showing.personId, stage, reason },
      {
        onSuccess: () => {
          toast.success(
            stage === 'shortlisted'
              ? t('hiringShortlisted')
              : t('hiringSetAside'),
          )
          setChecked(null)
        },
      },
    )
  }

  return {
    page,
    chips: page?.kind !== 'list' && page && !showing ? roles.slice(0, 2) : [],
    listChips: page?.kind === 'list' && !reviewedList ? roles.slice(0, 2) : [],
    listCount: page?.count ?? 0,
    review,
    reviewedList,
    saveAllMeeting,
    closeList: () => setReviewed(null),
    noRole: Boolean(page && roles.length === 0),
    busy,
    check,
    card: showing && person ? { role: showing.role, person } : null,
    shortlist: () => decide('shortlisted'),
    setAside: (reason: SetAsideReason) => decide('set-aside', reason),
    close: () => setChecked(null),
    sendNext: sending.sendNext,
    hasChips:
      Boolean(page && !showing && !reviewedList) || Boolean(sending.sendNext),
  }
}

export type HiringPanel = ReturnType<typeof useHiringPanel>
