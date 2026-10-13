/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { adapterLabel } from '@/components/agents/AdapterIcon'
import type { LlmProviderConfig } from '@/lib/llm-providers/types'
import type { AcpAgent } from '@/modules/agents/acp-agent-types'
import type { TargetRowAction } from './ConfiguredTargetRow'

export function providerDescription(provider: LlmProviderConfig): string {
  // The key in use is Redrob Launcher's: say so where a key of the app's own
  // would otherwise be implied by the row.
  if (provider.viaLauncher) {
    return `${t('stSignedInWithLauncher')} · ${provider.modelId}`
  }
  return provider.baseUrl
    ? `${provider.modelId} · ${provider.baseUrl}`
    : provider.modelId
}

/** A custom agent identifies itself by its launch command, not its adapter. */
export function agentDescription(agent: AcpAgent): string {
  const isCustom = agent.type === 'custom'
  const primaryLabel =
    isCustom && agent.customConfig?.command
      ? agent.customConfig.command
      : adapterLabel(agent.type)

  return [
    primaryLabel,
    agent.modelId ?? t('stAgentDefaultModel'),
    agent.reasoningEffort,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

/**
 * The first action is always "set as default": the row's radio and its hover
 * button both invoke it, and everything after it lands in the overflow menu.
 */
export function buildProviderActions(input: {
  provider: LlmProviderConfig
  isTesting: boolean
  onSelectProvider: (providerId: string) => void
  onTestProvider: (provider: LlmProviderConfig) => void
  onEditProvider: (provider: LlmProviderConfig) => void
  onDeleteProvider: (provider: LlmProviderConfig) => void
}): TargetRowAction[] {
  const { provider, isTesting } = input
  const actions: TargetRowAction[] = [
    {
      label: t('stSetAsDefault'),
      onSelect: () => input.onSelectProvider(provider.id),
    },
  ]

  actions.push(
    {
      label: isTesting ? t('stTesting') : t('stTestConnection'),
      onSelect: () => input.onTestProvider(provider),
      disabled: isTesting,
    },
    { label: t('stEdit'), onSelect: () => input.onEditProvider(provider) },
    {
      label: t('stDelete'),
      onSelect: () => input.onDeleteProvider(provider),
      destructive: true,
    },
  )
  return actions
}

/** Only custom agents are editable, and only when a handler is supplied. */
export function buildAgentActions(input: {
  agent: AcpAgent
  isDeleting: boolean
  onSelectAgent: (agentId: string) => void
  onDeleteAgent: (agent: AcpAgent) => void | Promise<void>
  onEditAgent?: (agent: AcpAgent) => void
}): TargetRowAction[] {
  const { agent, isDeleting } = input
  const actions: TargetRowAction[] = [
    {
      label: t('stSetAsDefault'),
      onSelect: () => input.onSelectAgent(agent.id),
    },
  ]

  if (agent.type === 'custom' && input.onEditAgent) {
    const onEditAgent = input.onEditAgent
    actions.push({ label: t('stEdit'), onSelect: () => onEditAgent(agent) })
  }

  actions.push({
    label: t('stDelete'),
    onSelect: () => void input.onDeleteAgent(agent),
    destructive: true,
    disabled: isDeleting,
  })
  return actions
}
