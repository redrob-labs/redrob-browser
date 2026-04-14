import { useEffect, useState } from 'react'
import {
  type AgentEntry,
  getModelDisplayName,
  type OpenClawStatus,
} from '@/entrypoints/app/agents/useOpenClaw'
import { getLatestConversation } from '@/lib/agent-conversations/storage'
import type { AgentCardData } from '@/lib/agent-conversations/types'

function getAgentStatusTone(
  status: OpenClawStatus['status'] | undefined,
): AgentCardData['status'] {
  if (status === 'error') return 'error'
  if (status === 'starting') return 'working'
  return 'idle'
}

async function getAgentCardData(
  agent: AgentEntry,
  status: OpenClawStatus['status'] | undefined,
): Promise<AgentCardData> {
  const conversation = await getLatestConversation(agent.agentId)
  const lastTurn = conversation?.turns[conversation.turns.length - 1]
  const lastTextPart = lastTurn?.parts.findLast((part) => part.kind === 'text')

  return {
    agentId: agent.agentId,
    name: agent.name,
    model: getModelDisplayName(agent.model),
    status: getAgentStatusTone(status),
    lastMessage:
      lastTextPart?.kind === 'text'
        ? lastTextPart.text.slice(0, 120)
        : undefined,
    lastMessageTimestamp: lastTurn?.timestamp,
  }
}

export function useAgentCardData(
  agents: AgentEntry[],
  status: OpenClawStatus['status'] | undefined,
) {
  const [cardData, setCardData] = useState<AgentCardData[]>([])

  useEffect(() => {
    let active = true

    const loadCardData = async () => {
      const nextCardData = await Promise.all(
        agents.map((agent) => getAgentCardData(agent, status)),
      )
      if (active) {
        setCardData(nextCardData)
      }
    }

    if (agents.length > 0) {
      void loadCardData()
    } else {
      setCardData([])
    }

    return () => {
      active = false
    }
  }, [agents, status])

  return cardData
}
