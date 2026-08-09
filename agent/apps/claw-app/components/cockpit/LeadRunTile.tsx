import { NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/utils'
import type { TaskSummary } from '@/modules/api/audit.hooks'
import {
  abbreviateSequence,
  formatDuration,
  formatRelative,
} from '@/screens/audit/audit.helpers'

interface LeadRunTileProps {
  task: TaskSummary
  now: number
  className?: string
}

/**
 * Lead-story tile for the cockpit editorial layout.
 *
 * Cyanotype lead tile: a quiet media well over a saturated blue
 * information panel. The whole tile remains a link.
 */
export function LeadRunTile({ task, now, className }: LeadRunTileProps) {
  const isLive = task.status === 'live'
  const isFailed = task.status === 'failed'
  const isStopped = task.status === 'cancelled'
  const location = useLocation()
  return (
    <NavLink
      to={`/audit/${encodeURIComponent(task.sessionId)}`}
      state={{ from: location.pathname }}
      data-testid={`lead-tile-${task.sessionId}`}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[9px] border border-[#C8D4E0] bg-white transition-[border-color,box-shadow] duration-150 hover:border-[#0043CD] hover:shadow-sm',
        className,
      )}
    >
      <div className="flex-1 border-[#C8D4E0] border-b bg-[#E3EAF1]" />
      <Caption
        task={task}
        now={now}
        isLive={isLive}
        isFailed={isFailed}
        isStopped={isStopped}
      />
    </NavLink>
  )
}

function Caption({
  task,
  now,
  isLive,
  isFailed,
  isStopped,
}: {
  task: TaskSummary
  now: number
  isLive: boolean
  isFailed: boolean
  isStopped: boolean
}) {
  return (
    <div className="relative flex flex-col gap-[7px] bg-[#0043CD] px-5 pt-4 pb-[18px] text-white">
      <div className="flex items-center gap-2 font-medium text-[11.5px] text-white leading-[14px]">
        <span className="truncate">{task.label}</span>
        {isFailed && <span className="text-red-200">FAILED</span>}
        {isStopped && <span className="text-white/70">STOPPED</span>}
      </div>
      <h2 className="truncate font-bold text-[22px] text-white leading-[1.2] tracking-[-0.02em]">
        {task.name}
      </h2>
      <p className="pr-16 text-[11.5px] text-white tabular-nums leading-[1.5]">
        {formatDuration(task.durationMs)} · {task.dispatchCount} tool
        {task.dispatchCount === 1 ? '' : 's'} ·{' '}
        {isLive
          ? 'running now'
          : `started ${formatRelative(task.startedAt, now)}`}
      </p>
      <p className="truncate pr-16 text-[11px] text-white leading-[1.5]">
        {abbreviateSequence(task.toolSequence)}
      </p>
      {isLive && (
        <span className="absolute right-3 bottom-4 rounded-full bg-[#2FE08C] px-2.5 py-[3px] font-semibold text-[#04331D] text-[11px] leading-[14px]">
          Live
        </span>
      )}
    </div>
  )
}
