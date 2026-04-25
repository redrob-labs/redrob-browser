import type { MonitoringSessionContext } from './types'

interface ActiveMonitoringSession {
  monitoringSessionId: string
  source: MonitoringSessionContext['source']
}

export class MonitoringSessionRegistry {
  private readonly activeSessionsByAgent = new Map<
    string,
    ActiveMonitoringSession
  >()

  setActive(
    agentId: string,
    monitoringSessionId: string,
    source: MonitoringSessionContext['source'],
  ): void {
    this.activeSessionsByAgent.set(agentId, { monitoringSessionId, source })
  }

  getActive(agentId: string): string | undefined {
    return this.activeSessionsByAgent.get(agentId)?.monitoringSessionId
  }

  resolveForUnattributedToolCalls():
    | { agentId: string; monitoringSessionId: string }
    | undefined {
    const activeSessions = [...this.activeSessionsByAgent.entries()].flatMap(
      ([agentId, session]) =>
        session?.monitoringSessionId
          ? [
              {
                agentId,
                monitoringSessionId: session.monitoringSessionId,
                source: session.source,
              },
            ]
          : [],
    )

    if (activeSessions.length === 1) {
      const [{ agentId, monitoringSessionId }] = activeSessions
      return { agentId, monitoringSessionId }
    }

    const openClawSessions = activeSessions.filter(
      (session) => session.source === 'openclaw-agent-chat',
    )

    if (openClawSessions.length === 1) {
      const [{ agentId, monitoringSessionId }] = openClawSessions
      return { agentId, monitoringSessionId }
    }

    return undefined
  }

  clearIfMatches(agentId: string, monitoringSessionId: string): void {
    if (
      this.activeSessionsByAgent.get(agentId)?.monitoringSessionId !==
      monitoringSessionId
    ) {
      return
    }
    this.activeSessionsByAgent.delete(agentId)
  }
}
