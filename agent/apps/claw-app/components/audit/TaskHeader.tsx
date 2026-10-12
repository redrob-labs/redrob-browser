/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t, tCount } from '@browseros/i18n'
import {
  ChevronLeft,
  Copy,
  ExternalLink,
  PlayCircle,
  Settings2,
} from '@browseros/icons'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import type { TaskDetail } from '@/modules/api/audit.hooks'
import {
  replayMetadataRefetchInterval,
  useReplayMetadata,
} from '@/modules/api/replay.hooks'
import { formatDuration, formatTokensFull } from '@/screens/audit/audit.helpers'
import { AgentDot } from './AgentDot'
import { StatusBadge } from './StatusBadge'

interface TaskHeaderProps {
  detail: TaskDetail
}

export function TaskHeader({ detail }: TaskHeaderProps) {
  const { session: task, dispatches } = detail
  const [copied, setCopied] = useState(false)
  const finalUrl = lastUrl(dispatches) ?? dispatches[0]?.url ?? null
  const navigate = useNavigate()
  const location = useLocation()
  // Semantic back: prefer the referring path passed via router state
  // (see cockpit tiles + audit list). Falls back to /audit for direct
  // URL loads. Never uses navigate(-1) because history-based back is
  // unreliable once the user has forward/back navigation in history.
  const backTo =
    typeof location.state === 'object' &&
    location.state !== null &&
    'from' in location.state &&
    typeof location.state.from === 'string'
      ? location.state.from
      : '/audit'
  // Poll the metadata endpoint while the session is live, and briefly after it
  // ends until the recording first appears, so the View Replay button unlocks
  // once the first rrweb batch lands even if it finalises just after teardown.
  const replayMeta = useReplayMetadata({
    variables: { sessionId: task.sessionId },
    refetchInterval: (query) =>
      replayMetadataRefetchInterval({
        status: task.status,
        endedAt: task.endedAt,
        hasData: query.state.data?.hasData,
      }),
  })
  const replayReady = replayMeta.data?.hasData === true

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(backTo)}
        className="inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink"
      >
        <ChevronLeft className="size-3.5" />
        {t('clBack')}
      </button>

      <header className="rounded-2xl border border-border-2 bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AgentDot slug={task.slug} />
              <span className="font-semibold text-ink" translate="no">
                {task.slug}
              </span>
              <StatusBadge status={task.status} />
              {task.errorCount > 0 && (
                <span className="text-[12.5px] text-red">
                  {tCount('clErrors', task.errorCount)}
                </span>
              )}
            </div>
            <h1 className="font-extrabold text-2xl tracking-tight">
              {task.name}
            </h1>
            {task.taskSummary && (
              <p className="max-w-2xl text-[13px] text-ink-2 leading-snug">
                {task.taskSummary}
              </p>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] md:grid-cols-4">
          <div>
            <dt className="text-ink-3">{t('clStarted')}</dt>
            <dd className="font-mono text-ink-2">
              {new Date(task.startedAt).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">{t('clEnded')}</dt>
            <dd className="font-mono text-ink-2">
              {task.endedAt
                ? new Date(task.endedAt).toLocaleString()
                : task.status === 'live'
                  ? t('clStillRunning')
                  : t('clIdleLower')}
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">{t('clDuration')}</dt>
            <dd className="font-mono text-ink-2">
              {formatDuration(task.durationMs)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">{t('clTools')}</dt>
            <dd className="font-mono text-ink-2">{task.dispatchCount}</dd>
          </div>
          <div>
            <dt className="text-ink-3">{t('clTokens2')}</dt>
            <dd
              className="font-mono text-ink-2"
              title={
                task.tokenUsage
                  ? `${task.tokenUsage.inputTokenEstimate.toLocaleString()} in · ${task.tokenUsage.outputTokenEstimate.toLocaleString()} out`
                  : undefined
              }
            >
              {task.tokenUsage
                ? formatTokensFull(task.tokenUsage.totalTokenEstimate)
                : '—'}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-ink-3">{t('clSite')}</dt>
            {task.site ? (
              <dd className="font-mono text-ink-2" translate="no">
                {task.site}
              </dd>
            ) : (
              <dd className="font-mono text-ink-2">{t('clNoSite')}</dd>
            )}
          </div>
          <div className="col-span-2">
            <dt className="text-ink-3">{t('clSession')}</dt>
            <dd className="flex items-center gap-2 font-mono text-ink-2">
              <span className="truncate" translate="no">
                {task.sessionId}
              </span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(task.sessionId)
                    .then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    })
                }}
                className="rounded p-1 text-ink-3 hover:bg-bg-sunken"
                aria-label={t('clCopySessionId')}
              >
                <Copy className="size-3" />
              </button>
              {copied && (
                <span className="text-[11px] text-accent">
                  {t('clCopied2')}
                </span>
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            variant="default"
            size="sm"
            disabled={!replayReady}
            onClick={() =>
              navigate(`/audit/${task.sessionId}/replay`, {
                state: { from: location.pathname },
              })
            }
            title={
              replayReady
                ? t('clWatchTheRrwebSessionReplay')
                : t('clNoReplayRecordedForThis')
            }
          >
            <PlayCircle className="mr-1.5 size-3.5" />
            {t('clViewSessionReplay')}
          </Button>
          {finalUrl && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(finalUrl, '_blank', 'noreferrer')}
            >
              <ExternalLink className="mr-1.5 size-3.5" />
              {t('clOpenFinalUrl')}
            </Button>
          )}
          {task.site && (
            <Button variant="ghost" size="sm">
              <Settings2 className="mr-1.5 size-3.5" />
              {t('clMakeRuleOn', task.site)}
            </Button>
          )}
        </div>
      </header>
    </section>
  )
}

function lastUrl(dispatches: TaskDetail['dispatches']): string | null {
  for (let i = dispatches.length - 1; i >= 0; i--) {
    const url = dispatches[i]?.url
    if (url) return url
  }
  return null
}
