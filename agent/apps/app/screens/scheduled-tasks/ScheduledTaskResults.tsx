/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { formatRelative, t } from '@browseros/i18n'
import {
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  Square,
  XCircle,
} from '@browseros/icons'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import type { FC } from 'react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import type {
  ScheduledJob,
  ScheduledJobRun,
} from '@/lib/schedules/scheduleTypes'
import {
  useScheduledJobRuns,
  useScheduledJobs,
} from '@/modules/schedules/schedules.hooks'

dayjs.extend(relativeTime)

interface JobRunWithDetails extends ScheduledJobRun {
  job: ScheduledJob | undefined
}

export interface ScheduledTaskResultsProps {
  onViewRun: (run: ScheduledJobRun) => void
  onCancelRun: (runId: string) => void
  onRetryRun: (jobId: string) => void
}

const getStatusIcon = (status: JobRunWithDetails['status']) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="ui-status--success h-4 w-4" />
    case 'running':
      return <Loader2 className="ui-status--running h-4 w-4 animate-spin" />
    case 'failed':
      return <XCircle className="ui-status--danger h-4 w-4" />
  }
}

const formatTimestamp = (dateString: string) =>
  formatRelative(new Date(dateString))

export const ScheduledTaskResults: FC<ScheduledTaskResultsProps> = ({
  onViewRun,
  onCancelRun,
  onRetryRun,
}) => {
  const { jobRuns } = useScheduledJobRuns()
  const { jobs } = useScheduledJobs()

  const sortedRuns: JobRunWithDetails[] = useMemo(() => {
    const enrichWithJob = (run: ScheduledJobRun): JobRunWithDetails => ({
      ...run,
      job: jobs.find((j) => j.id === run.jobId),
    })

    const running = jobRuns
      .filter((r) => r.status === 'running')
      .map(enrichWithJob)

    const completedOrFailed = jobRuns
      .filter((r) => r.status === 'completed' || r.status === 'failed')
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      )
      .map(enrichWithJob)

    return [...running, ...completedOrFailed]
  }, [jobRuns, jobs])

  if (!sortedRuns.length) {
    return (
      <div className="rr-empty rr-empty--compact">
        <span className="rr-empty__icon" aria-hidden="true">
          <Calendar />
        </span>
        <p className="rr-empty__desc">{t('stNoTaskRunsYet')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sortedRuns.map((run) => (
        <Button
          key={run.id}
          variant="ghost"
          onClick={() => onViewRun(run)}
          className="ui-card-btn w-full justify-start p-4 text-left"
        >
          <div className="flex w-full items-start gap-3">
            {getStatusIcon(run.status)}
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="truncate font-medium text-foreground text-sm">
                  {run.job?.name}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground text-xs">
                  <Clock className="h-3 w-3" />
                  {formatTimestamp(run.startedAt)}
                </span>
              </div>
              {run.result && (
                <p className="line-clamp-2 text-ellipsis text-muted-foreground text-xs">
                  {run.result}
                </p>
              )}
            </div>
            {run.status === 'running' && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onCancelRun(run.id)
                }}
                className="ui-status--danger shrink-0"
                aria-label={t('stCancelRun')}
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            )}
            {run.status === 'failed' && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onRetryRun(run.jobId)
                }}
                className="shrink-0"
                aria-label={t('stRetryRun')}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </Button>
      ))}
    </div>
  )
}
