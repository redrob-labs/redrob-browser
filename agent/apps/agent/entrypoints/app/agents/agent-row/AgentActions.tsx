import { Loader2, Trash2 } from 'lucide-react'
import type { FC } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  canDelete as canDeleteAgent,
  displayName,
} from '../agent-display.helpers'
import type { AgentListItem } from '../agents-page-types'
import type { AgentLiveness } from '../LivenessDot'

interface AgentActionsProps {
  agent: AgentListItem
  status: AgentLiveness
  deleting?: boolean
  onDelete: (agent: AgentListItem) => void
}

/**
 * Right-hand controls for an agent row in the "Your agents" list: a live
 * status pill ("Running" while the runtime is up) plus a delete button that
 * matches the configured-provider cards. Chatting happens from the composer's
 * provider picker, so there's no per-row chat affordance here.
 */
export const AgentActions: FC<AgentActionsProps> = ({
  agent,
  status,
  deleting,
  onDelete,
}) => {
  const allowDelete = canDeleteAgent(agent)

  return (
    <div className="flex shrink-0 items-center gap-2">
      <AgentStatusPill status={status} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${displayName(agent)}`}
        disabled={!allowDelete || deleting}
        onClick={() => onDelete(agent)}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        {deleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}

const STATUS_PILL: Record<
  AgentLiveness,
  { label: string; pill: string; dot: string } | null
> = {
  working: {
    label: 'Running',
    pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500 animate-pulse',
  },
  idle: {
    label: 'Running',
    pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  asleep: {
    label: 'Asleep',
    pill: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/40',
  },
  error: {
    label: 'Error',
    pill: 'bg-destructive/10 text-destructive',
    dot: 'bg-destructive',
  },
  unknown: null,
}

function AgentStatusPill({ status }: { status: AgentLiveness }) {
  const variant = STATUS_PILL[status]
  if (!variant) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-xs',
        variant.pill,
      )}
    >
      <span className={cn('size-1.5 rounded-full', variant.dot)} />
      {variant.label}
    </span>
  )
}
