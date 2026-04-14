import { Plus } from 'lucide-react'
import type { FC } from 'react'
import type { AgentCardData } from '@/lib/agent-conversations/types'
import { cn } from '@/lib/utils'
import { AgentCardCompact, AgentCardExpanded } from './AgentCard'

interface AgentCardDockProps {
  agents: AgentCardData[]
  activeAgentId?: string
  onSelectAgent: (agentId: string) => void
  onCreateAgent?: () => void
  compact?: boolean
}

function CreateAgentButton({
  compact,
  onCreateAgent,
}: {
  compact?: boolean
  onCreateAgent: () => void
}) {
  return (
    <button
      type="button"
      onClick={onCreateAgent}
      className={cn(
        'flex shrink-0 items-center justify-center gap-2 border border-dashed text-muted-foreground transition-colors hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)]',
        compact
          ? 'rounded-full px-3 py-2 text-sm'
          : 'min-h-32 rounded-2xl px-5 py-4',
      )}
    >
      <Plus className={compact ? 'size-3.5' : 'size-5'} />
      <span>{compact ? 'New' : 'Create agent'}</span>
    </button>
  )
}

export const AgentCardDock: FC<AgentCardDockProps> = ({
  agents,
  activeAgentId,
  onSelectAgent,
  onCreateAgent,
  compact,
}) => {
  if (agents.length === 0 && !onCreateAgent) return null

  const Card = compact ? AgentCardCompact : AgentCardExpanded

  return (
    <div
      className={cn(
        compact
          ? 'flex items-center gap-2 overflow-x-auto pb-1'
          : 'grid gap-4 md:grid-cols-3',
      )}
    >
      {agents.map((agent) => (
        <Card
          key={agent.agentId}
          agent={agent}
          active={agent.agentId === activeAgentId}
          onClick={() => onSelectAgent(agent.agentId)}
        />
      ))}
      {onCreateAgent ? (
        <CreateAgentButton compact={compact} onCreateAgent={onCreateAgent} />
      ) : null}
    </div>
  )
}
