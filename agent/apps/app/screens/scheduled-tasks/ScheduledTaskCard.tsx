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
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Pencil,
  Play,
  RotateCcw,
  Square,
  Trash2,
  XCircle,
} from '@browseros/icons'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import relativeTime from 'dayjs/plugin/relativeTime'
import { type FC, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Switch } from '@/components/ui/switch'
import { ProviderIcon } from '@/lib/llm-providers/providerIcons'
import { useProvidersQuery } from '@/modules/llm-providers/llm-providers.hooks'
import { useScheduledJobRuns } from '@/modules/schedules/schedules.hooks'
import type { ScheduledJob, ScheduledJobRun } from './types'

dayjs.extend(relativeTime)
dayjs.extend(duration)

export interface ScheduledTaskCardProps {
  job: ScheduledJob
  onEdit: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
  onRun: () => void
  onViewRun: (run: ScheduledJobRun) => void
  onCancelRun: (runId: string) => void
  onRetryRun: (jobId: string) => void
}

function formatSchedule(job: ScheduledJob): string {
  if (job.scheduleType === 'daily' && job.scheduleTime) {
    return t('stDailyAt', job.scheduleTime)
  }
  if (job.scheduleType === 'hourly' && job.scheduleInterval) {
    return job.scheduleInterval === 1
      ? t('stEveryHour')
      : t('stEveryNHoursN', job.scheduleInterval)
  }
  if (job.scheduleType === 'minutes' && job.scheduleInterval) {
    return job.scheduleInterval === 1
      ? t('stEveryMinute')
      : t('stEveryNMinutesN', job.scheduleInterval)
  }
  return t('stNotScheduled')
}

const formatRelativeTime = (dateStr: string) =>
  formatRelative(new Date(dateStr))

function formatDuration(startedAt: string, completedAt?: string): string {
  if (!completedAt) return 'Running...'
  const diff = dayjs(completedAt).diff(dayjs(startedAt))
  const d = dayjs.duration(diff)
  const mins = Math.floor(d.asMinutes())
  const secs = d.seconds()
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs}s`
}

const formatRunDate = (dateStr: string) =>
  dayjs(dateStr).format('MMM D, h:mm A')

export const ScheduledTaskCard: FC<ScheduledTaskCardProps> = ({
  job,
  onEdit,
  onDelete,
  onToggle,
  onRun,
  onViewRun,
  onCancelRun,
  onRetryRun,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const { jobRuns } = useScheduledJobRuns()
  const { data: providers = [] } = useProvidersQuery()
  const providerInfo = job.providerId
    ? (providers.find((provider) => provider.id === job.providerId) ?? null)
    : null
  // Named a provider that is no longer there. The run would fall back to the
  // selected provider, which is not what this job was set up to use, so it is
  // worth saying rather than leaving the row looking ordinary.
  const providerMissing = Boolean(job.providerId) && providerInfo === null

  const runs = useMemo(
    () =>
      jobRuns
        .filter((run) => run.jobId === job.id)
        .sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        ),
    [jobRuns, job.id],
  )

  return (
    <div className="ui-card p-4">
      <div className="flex items-start gap-4">
        <Switch
          checked={job.enabled}
          onCheckedChange={onToggle}
          aria-label={`${job.enabled ? 'Disable' : 'Enable'} ${job.name}`}
        />

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="truncate font-semibold">{job.name}</span>
            {!job.enabled && (
              <span className="rr-badge rr-badge--sm rr-badge--subtle rr-badge--neutral">
                {t('stDisabled')}
              </span>
            )}
          </div>
          <p className="mb-2 line-clamp-1 text-muted-foreground text-sm">
            "{job.query}"
          </p>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <span>{formatSchedule(job)}</span>
            {providerInfo && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <ProviderIcon type={providerInfo.type} size={12} />
                  {providerInfo.name}
                </span>
              </>
            )}
            {providerMissing && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-[var(--status-warning)]">
                  <AlertTriangle aria-hidden className="size-3" />
                  {t('stProviderUnavailable')}
                </span>
              </>
            )}
            {job.lastRunAt && (
              <>
                <span>•</span>
                <span>{t('stLastRun', formatRelativeTime(job.lastRunAt))}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRun}>
            <Play className="mr-1.5 h-3 w-3" />
            {t('stTest')}
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-1.5 h-3 w-3" />
            {t('stEdit')}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            className="ui-row-delete"
            aria-label={t('stDeleteName', job.name)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {runs.length > 0 && (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-4">
          <CollapsibleTrigger className="ui-disclosure flex w-full items-center gap-2 text-sm">
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
            <span>{t('stRunHistoryN', runs.length)}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="space-y-2">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="ui-sample flex items-center gap-3 p-3"
                >
                  {run.status === 'completed' ? (
                    <CheckCircle2 className="ui-status--success h-4 w-4 shrink-0" />
                  ) : run.status === 'failed' ? (
                    <XCircle className="ui-status--danger h-4 w-4 shrink-0" />
                  ) : (
                    <Loader2 className="ui-status--running h-4 w-4 shrink-0 animate-spin" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {formatRunDate(run.startedAt)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatDuration(run.startedAt, run.completedAt)}
                      </span>
                    </div>
                    {run.status === 'failed' && run.result && (
                      <p className="ui-status--danger mt-1 line-clamp-1 text-xs">
                        {run.result}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {run.status === 'running' && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          onCancelRun(run.id)
                        }}
                        className="ui-status--danger"
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
                        className=""
                        aria-label={t('stRetryRun')}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewRun(run)}
                      className="shrink-0"
                    >
                      {t('stView')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
