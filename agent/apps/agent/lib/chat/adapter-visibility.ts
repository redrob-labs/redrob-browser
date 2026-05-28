import type {
  HarnessAdapterDescriptor,
  HarnessAgentAdapter,
} from '@/entrypoints/app/agents/agent-harness-types'

/**
 * Single source of truth for which harness adapters are exposed in the UI.
 * Hermes is hidden today (kept in the backend/types). Re-enabling it later
 * is a one-line change here, and every picker / settings list / create
 * dialog inherits the result.
 */
const HIDDEN_ADAPTERS: ReadonlySet<HarnessAgentAdapter> =
  new Set<HarnessAgentAdapter>(['hermes'])

export function isAdapterHidden(adapter: HarnessAgentAdapter): boolean {
  return HIDDEN_ADAPTERS.has(adapter)
}

export function visibleAdapters(
  adapters: HarnessAdapterDescriptor[],
): HarnessAdapterDescriptor[] {
  return adapters.filter((adapter) => !isAdapterHidden(adapter.id))
}
