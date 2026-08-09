import { NavLink, useLocation } from 'react-router'
import type { TaskSummary } from '@/modules/api/audit.hooks'
import {
  abbreviateSequence,
  formatDuration,
  formatRelative,
} from '@/screens/audit/audit.helpers'

interface RunRowProps {
  task: TaskSummary
  now: number
}

/**
 * One cyanotype activity-table row. The five columns intentionally
 * share the header's fixed grid so scan lines stay perfectly aligned.
 */
export function RunRow({ task, now }: RunRowProps) {
  const isLive = task.status === 'live'
  const isStopped = task.status === 'cancelled'
  const location = useLocation()
  return (
    <NavLink
      to={`/audit/${encodeURIComponent(task.sessionId)}`}
      state={{ from: location.pathname }}
      data-testid={`run-row-${task.sessionId}`}
      className="group grid grid-cols-[236px_minmax(0,1fr)_240px_72px_64px] items-center gap-4 border-[#DFE7EE] border-t px-4 py-2.5 transition-colors duration-150 first:border-t-0 hover:bg-[#F3F6F9]"
    >
      <span className="inline-flex min-w-0 items-center gap-2 text-[#0043CD] text-[11px] leading-[14px]">
        <span className="truncate">{task.label}</span>
        {isLive && (
          <span className="font-semibold text-[#008C4D] text-[10px]">LIVE</span>
        )}
        {isStopped && (
          <span className="text-[#5F7794] text-[10px]">STOPPED</span>
        )}
      </span>
      <span className="min-w-0 truncate font-[system-ui] text-[#0C2742] text-[13px] leading-4">
        {task.name}
      </span>
      <span className="truncate text-[#5F7794] text-[11px] leading-[14px]">
        {abbreviateSequence(task.toolSequence)}
      </span>
      <span className="text-right text-[#4A6480] text-[11px] tabular-nums leading-[14px]">
        {formatDuration(task.durationMs)}
      </span>
      <span className="text-right text-[#5F7794] text-[11px] tabular-nums leading-[14px]">
        {formatRelative(task.startedAt, now)}
      </span>
    </NavLink>
  )
}
