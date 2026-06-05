import { Plus } from 'lucide-react'
import { type FC, useEffect, useMemo, useState } from 'react'
import { AdapterIcon, adapterLabel } from '@/entrypoints/app/agents/AdapterIcon'
import { AgentList } from '@/entrypoints/app/agents/AgentList'
import {
  adapterHealthLabel,
  adapterHealthMeta,
  adapterHealthTone,
} from '@/entrypoints/app/agents/adapter-health'
import type {
  HarnessAdapterDescriptor,
  HarnessAdapterHealth,
  HarnessAgent,
  HarnessAgentAdapter,
} from '@/entrypoints/app/agents/agent-harness-types'
import { useDefaultAgentName } from '@/entrypoints/app/agents/agents-page-hooks'
import type { AgentListItem } from '@/entrypoints/app/agents/agents-page-types'
import { toHarnessListItem } from '@/entrypoints/app/agents/agents-page-utils'
import { NewAgentDialog } from '@/entrypoints/app/agents/NewAgentDialog'
import { InlineErrorAlert } from '@/entrypoints/app/agents/PageAlerts'
import {
  useAgentAdapters,
  useCreateHarnessAgent,
  useDeleteHarnessAgent,
  useHarnessAgents,
  useUpdateHarnessAgent,
} from '@/entrypoints/app/agents/useAgents'
import { Feature } from '@/lib/browseros/capabilities'
import { useCapabilities } from '@/lib/browseros/useCapabilities'
import { visibleAdapters } from '@/lib/chat/adapter-visibility'
import {
  AGENT_CREATED_EVENT,
  AGENT_DELETED_EVENT,
} from '@/lib/constants/analyticsEvents'
import { track } from '@/lib/metrics/track'
import { cn } from '@/lib/utils'

/**
 * Coding agents (Claude Code / Codex) surfaced inside the BrowserOS AI pane.
 * Each visible adapter gets a card that opens the New Agent dialog scoped to
 * that runtime; existing agents across adapters are listed and managed inline.
 */
export const CodingAgentsSection: FC = () => {
  const { supports } = useCapabilities()
  const hermesAgentSupported = supports(Feature.HERMES_AGENT_SUPPORT)
  const { adapters } = useAgentAdapters()
  const { harnessAgents, loading } = useHarnessAgents()
  const createHarnessAgent = useCreateHarnessAgent()
  const deleteHarnessAgent = useDeleteHarnessAgent()
  const updateHarnessAgent = useUpdateHarnessAgent()

  const shownAdapters = useMemo(
    () => visibleAdapters(adapters, hermesAgentSupported),
    [adapters, hermesAgentSupported],
  )
  const visibleAdapterIds = useMemo(
    () => new Set(shownAdapters.map((adapter) => adapter.id)),
    [shownAdapters],
  )
  const codingAgents = useMemo(
    () => harnessAgents.filter((agent) => visibleAdapterIds.has(agent.adapter)),
    [harnessAgents, visibleAdapterIds],
  )

  const [createAdapterId, setCreateAdapterId] =
    useState<HarnessAgentAdapter | null>(null)
  const [newName, setNewName] = useState('')
  const [modelId, setModelId] = useState('')
  const [reasoningEffort, setReasoningEffort] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [deletingAgentKey, setDeletingAgentKey] = useState<string | null>(null)

  const createOpen = createAdapterId !== null
  const createAdapter = shownAdapters.find(
    (adapter) => adapter.id === createAdapterId,
  )

  useDefaultAgentName(createOpen, setNewName)
  // Seed model/reasoning from the chosen adapter's defaults when the dialog opens.
  useEffect(() => {
    if (!createOpen || !createAdapter) return
    setModelId((current) => current || createAdapter.defaultModelId)
    setReasoningEffort(
      (current) => current || createAdapter.defaultReasoningEffort,
    )
  }, [createOpen, createAdapter])

  const listItems = useMemo<AgentListItem[]>(
    () => codingAgents.map(toHarnessListItem),
    [codingAgents],
  )
  const harnessAgentLookup = useMemo(() => {
    const map = new Map<string, HarnessAgent>()
    for (const agent of codingAgents) map.set(agent.id, agent)
    return map
  }, [codingAgents])
  const activity = useMemo(() => {
    const map: Record<
      string,
      {
        status: 'working' | 'idle' | 'asleep' | 'error'
        lastUsedAt: number | null
      }
    > = {}
    for (const agent of codingAgents) {
      if (!agent.status) continue
      map[agent.id] = {
        status: agent.status,
        lastUsedAt: agent.lastUsedAt ?? null,
      }
    }
    return map
  }, [codingAgents])

  const openCreate = (adapterId: HarnessAgentAdapter) => {
    setCreateError(null)
    setModelId('')
    setReasoningEffort('')
    setCreateAdapterId(adapterId)
  }

  const closeCreate = () => {
    setCreateAdapterId(null)
    setCreateError(null)
    createHarnessAgent.reset()
  }

  const handleCreate = async () => {
    if (!newName.trim() || !createAdapterId) return
    setCreateError(null)
    try {
      await createHarnessAgent.mutateAsync({
        name: newName.trim(),
        adapter: createAdapterId,
        modelId: modelId || undefined,
        reasoningEffort: reasoningEffort || undefined,
      })
      track(AGENT_CREATED_EVENT, {
        runtime: createAdapterId,
        model_id: modelId || undefined,
        reasoning_effort: reasoningEffort || undefined,
      })
      setCreateAdapterId(null)
      setNewName('')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDelete = async (item: AgentListItem) => {
    setDeletingAgentKey(item.key)
    setPageError(null)
    try {
      await deleteHarnessAgent.mutateAsync(item.agentId)
      track(AGENT_DELETED_EVENT, {
        runtime: item.source,
        agent_id: item.agentId,
      })
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeletingAgentKey(null)
    }
  }

  // No coding-agent runtimes available (harness unsupported) — hide entirely.
  if (shownAdapters.length === 0) return null

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-semibold text-lg">Coding agents</h2>
        <p className="text-muted-foreground text-sm">
          Spin up a Claude Code or Codex agent to chat with, schedule, or run in
          the background.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {shownAdapters.map((adapter) => (
          <CodingAgentCard
            key={adapter.id}
            adapter={adapter}
            onCreate={() => openCreate(adapter.id)}
          />
        ))}
      </div>

      {pageError ? (
        <InlineErrorAlert
          message={pageError}
          onDismiss={() => setPageError(null)}
        />
      ) : null}

      {codingAgents.length > 0 ? (
        <div className="space-y-3">
          <h3 className="font-medium text-muted-foreground text-sm">
            Your agents
          </h3>
          <AgentList
            agents={listItems}
            activity={activity}
            harnessAgentLookup={harnessAgentLookup}
            adapters={shownAdapters}
            loading={loading}
            deletingAgentKey={
              deleteHarnessAgent.isPending ? deletingAgentKey : null
            }
            onCreateAgent={() => openCreate(shownAdapters[0].id)}
            onDeleteAgent={(agent) => {
              void handleDelete(agent)
            }}
            onPinToggle={(agent, next) => {
              if (!harnessAgentLookup.has(agent.agentId)) return
              updateHarnessAgent.mutate({
                agentId: agent.agentId,
                patch: { pinned: next },
              })
            }}
          />
        </div>
      ) : null}

      <NewAgentDialog
        adapters={createAdapter ? [createAdapter] : []}
        createError={createError}
        createRuntime={createAdapterId ?? 'claude'}
        creating={createHarnessAgent.isPending}
        defaultProviderId=""
        harnessAdapterId={createAdapterId ?? 'claude'}
        harnessModelId={modelId}
        harnessReasoningEffort={reasoningEffort}
        hermesProviders={[]}
        hermesSelectedProviderId=""
        name={newName}
        open={createOpen}
        onCreate={handleCreate}
        onOpenChange={(open) => {
          if (!open) closeCreate()
        }}
        onRuntimeChange={() => {}}
        onHarnessAdapterChange={() => {}}
        onHarnessModelChange={setModelId}
        onHarnessReasoningChange={setReasoningEffort}
        onHermesProviderChange={() => {}}
        onNameChange={setNewName}
      />
    </section>
  )
}

function CodingAgentCard({
  adapter,
  onCreate,
}: {
  adapter: HarnessAdapterDescriptor
  onCreate: () => void
}) {
  const label = adapter.name || adapterLabel(adapter.id)
  const meta = adapter.health
    ? (adapterHealthMeta(adapter.health) ?? `Default ${adapter.defaultModelId}`)
    : `Default ${adapter.defaultModelId}`
  return (
    <button
      type="button"
      onClick={onCreate}
      className="group flex w-full items-center gap-3 rounded-lg border border-border bg-background p-4 text-left transition-all hover:border-[var(--accent-orange)] hover:shadow-md"
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-orange)]/10 text-[var(--accent-orange)]">
        <AdapterIcon adapter={adapter.id} className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{label}</span>
          <CodingAgentHealthBadge health={adapter.health} />
        </div>
        <p className="truncate text-muted-foreground text-xs">{meta}</p>
      </div>
      <span className="flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1 text-sm transition-colors group-hover:border-[var(--accent-orange)] group-hover:text-[var(--accent-orange)]">
        <Plus className="size-4" />
        Create
      </span>
    </button>
  )
}

function CodingAgentHealthBadge({
  health,
}: {
  health: HarnessAdapterHealth | undefined
}) {
  if (!health) return null
  const tone = adapterHealthTone(health)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-xs',
        tone === 'ready' &&
          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        tone === 'warning' &&
          'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        tone === 'danger' && 'bg-red-500/10 text-red-600 dark:text-red-400',
      )}
      title={health.reason}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          tone === 'ready' && 'bg-emerald-500',
          tone === 'warning' && 'bg-amber-500',
          tone === 'danger' && 'bg-red-500',
        )}
      />
      {adapterHealthLabel(health)}
    </span>
  )
}
