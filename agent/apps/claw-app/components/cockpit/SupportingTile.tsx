import { NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/utils'
import type { TaskSummary } from '@/modules/api/audit.hooks'
import { formatDuration, formatRelative } from '@/screens/audit/audit.helpers'

interface SupportingTileProps {
  task: TaskSummary
  now: number
  className?: string
}

/**
 * Cyanotype supporting tile. Mirrors the lead's pale media well
 * and saturated blue caption at a compact scale.
 */
export function SupportingTile({ task, now, className }: SupportingTileProps) {
  const isLive = task.status === 'live'
  const isStopped = task.status === 'cancelled'
  const location = useLocation()
  return (
    <NavLink
      to={`/audit/${encodeURIComponent(task.sessionId)}`}
      state={{ from: location.pathname }}
      data-testid={`support-tile-${task.sessionId}`}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[9px] border border-[#C8D4E0] bg-white transition-[border-color,box-shadow] duration-150 hover:border-[#0043CD] hover:shadow-sm',
        className,
      )}
    >
      <div className="flex-1 border-[#C8D4E0] border-b bg-[#E3EAF1]" />
      <Caption task={task} now={now} isLive={isLive} isStopped={isStopped} />
    </NavLink>
  )
}

function Caption({
  task,
  now,
  isLive,
  isStopped,
}: {
  task: TaskSummary
  now: number
  isLive: boolean
  isStopped: boolean
}) {
  return (
    <div className="flex flex-col gap-[7px] bg-[#0043CD] px-5 pt-4 pb-[18px] text-white">
      <div className="flex items-center gap-2 font-medium text-[11.5px] text-white leading-[14px]">
        <span className="truncate">{task.label}</span>
        {isLive && (
          <span className="rounded-full bg-[#2FE08C] px-2 py-0.5 font-semibold text-[#04331D] text-[10px]">
            LIVE
          </span>
        )}
        {isStopped && <span className="text-white/70">STOPPED</span>}
      </div>
      <h3 className="truncate font-bold text-[16px] text-white leading-5 tracking-[-0.02em]">
        {task.name}
      </h3>
      <p className="text-[11.5px] text-white tabular-nums leading-[14px]">
        {formatDuration(task.durationMs)} · {task.dispatchCount}t ·{' '}
        {formatRelative(task.startedAt, now)}
      </p>
    </div>
  )
}
