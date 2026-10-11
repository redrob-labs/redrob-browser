/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Job Apply in the side panel: the posting card, starting an application in the conversation, and
 * working through a batch the person approved on the Job Apply page. When a run ends without the
 * application being sent, it is marked "Ready for you to send" (review mode) or "Needs you", so the
 * tracker never shows a stopped application as still filling in.
 */

import { t } from '@browseros/i18n'
import {
  type Application,
  dedupeKey,
  sentToday,
} from '@browseros/jobs/applications'
import { matchJob } from '@browseros/jobs/match'
import type { JobPosting } from '@browseros/jobs/posting'
import { type ApplyMode, VOLUNTARY } from '@browseros/jobs/profile'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { type ApprovedBatch, approvedBatchStorage } from '@/lib/jobs/jobStorage'
import {
  type JobRequestError,
  useActivePosting,
  useApplications,
  useJobActions,
  useJobProfile,
} from './jobs.hooks'

export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'

function useApprovedBatch(): ApprovedBatch | null {
  const [batch, setBatch] = useState<ApprovedBatch | null>(null)
  useEffect(() => {
    void approvedBatchStorage.getValue().then(setBatch)
    return approvedBatchStorage.watch((next) => setBatch(next ?? null))
  }, [])
  return batch
}

export function useJobPanel(options: {
  conversationId: string
  status: ChatStatus
  send: (message: string) => void
}) {
  const posting = useActivePosting()
  const { data: profile } = useJobProfile()
  const { data: applications = [], refetch } = useApplications()
  const actions = useJobActions()
  const batch = useApprovedBatch()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ApplyMode | null>(null)
  const current = useRef<{ id: string; mode: ApplyMode } | null>(null)
  const previousStatus = useRef(options.status)

  const chosenMode = mode ?? profile?.mode ?? 'review'
  const match = posting && profile ? matchJob(posting, profile.criteria) : null

  const startApplication = (application: Application, runMode: ApplyMode) =>
    actions.start.mutate(
      {
        id: application.id,
        conversationId: options.conversationId,
        mode: runMode,
      },
      {
        onSuccess: (message) => {
          current.current = { id: application.id, mode: runMode }
          setOpen(false)
          options.send(message)
        },
        onError: () => toast.error(t('jobsStartFailed')),
      },
    )

  const existingFor = (p: JobPosting) =>
    applications.find(
      (a) =>
        dedupeKey(a.posting) === dedupeKey(p) &&
        a.status !== 'skipped' &&
        a.status !== 'failed',
    )

  const queueFailed = (error: JobRequestError) =>
    toast.error(
      error.code === 'daily-cap'
        ? t('jobsDailyCap', profile?.dailyCap ?? 0)
        : error.code === 'duplicate'
          ? t('jobsDuplicate')
          : t('jobsStartFailed'),
    )

  const apply = () => {
    if (!posting) return
    const existing = existingFor(posting)
    if (existing && existing.status !== 'sent') {
      startApplication(existing, chosenMode)
      return
    }
    actions.queue.mutate(
      { posting, automatic: chosenMode === 'automatic' },
      {
        onSuccess: (application) => startApplication(application, chosenMode),
        onError: queueFailed,
      },
    )
  }

  const shortlist = () => {
    if (!posting) return
    actions.queue.mutate(
      { posting },
      {
        onSuccess: () => {
          setOpen(false)
          toast.success(t('jobsShortlisted'))
        },
        onError: queueFailed,
      },
    )
  }

  const nextInBatch = async () => {
    const latest = await approvedBatchStorage.getValue()
    if (!latest) return
    const fresh = (await refetch()).data ?? applications
    if (
      latest.mode === 'automatic' &&
      profile &&
      sentToday(fresh, Date.now()) >= profile.dailyCap
    ) {
      toast(t('jobsDailyCap', profile.dailyCap))
      await approvedBatchStorage.setValue(null)
      return
    }
    let index = latest.next
    let application: Application | undefined
    while (index < latest.ids.length && !application) {
      const candidate = fresh.find((a) => a.id === latest.ids[index])
      index += 1
      if (
        candidate &&
        candidate.status !== 'sent' &&
        candidate.status !== 'skipped'
      )
        application = candidate
    }
    if (!application) {
      toast.success(t('jobsBatchDone', latest.sent))
      await approvedBatchStorage.setValue(null)
      return
    }
    await approvedBatchStorage.setValue({ ...latest, next: index })
    startApplication(application, latest.mode)
  }

  // When a run ends: settle the application, then go on with an approved batch if it was sent.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only reacts to the chat finishing
  useEffect(() => {
    const was = previousStatus.current
    previousStatus.current = options.status
    const finished =
      (was === 'streaming' || was === 'submitted') &&
      (options.status === 'ready' || options.status === 'error')
    const run = current.current
    if (!finished || !run) return
    current.current = null
    void (async () => {
      const fresh = (await refetch()).data ?? []
      const application = fresh.find((a) => a.id === run.id)
      const sent = application?.status === 'sent'
      if (application?.status === 'filling') {
        actions.update.mutate({
          id: run.id,
          status:
            options.status === 'error'
              ? 'failed'
              : run.mode === 'review'
                ? 'ready'
                : 'needs-you',
        })
      }
      const latest = await approvedBatchStorage.getValue()
      if (!latest) return
      if (sent) {
        await approvedBatchStorage.setValue({
          ...latest,
          sent: latest.sent + 1,
        })
        await nextInBatch()
      }
      // Not sent: the batch waits on the "Apply to the next one" chip, after the person has looked.
    })()
  }, [options.status])

  const unanswered = profile
    ? profile.answers.filter((a) => !a.answer.trim() && !VOLUNTARY.has(a.id))
        .length
    : 0

  return {
    posting,
    profile,
    match,
    mode: chosenMode,
    setMode,
    open: open && Boolean(posting),
    setOpen,
    apply,
    shortlist,
    busy: actions.queue.isPending || actions.start.isPending,
    unanswered,
    batch:
      batch && !current.current && batch.next < batch.ids.length
        ? {
            position: batch.next + 1,
            total: batch.ids.length,
            next: () => void nextInBatch(),
          }
        : null,
    chip: Boolean(posting) && !open,
    hasChips: (Boolean(posting) && !open) || Boolean(batch),
  }
}

export type JobPanel = ReturnType<typeof useJobPanel>
