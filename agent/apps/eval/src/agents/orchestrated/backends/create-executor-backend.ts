import type { ResolvedAgentConfig } from '@browseros/server/agent/types'
import type { Browser } from '@browseros/server/browser'
import type { ExecutorCallbacks } from '../../orchestrator-executor/executor'
import type { ExecutorBackend, ExecutorBackendKind } from '../executor-backend'
import { ExecutorAdapterBackend } from './tool-loop-backend'

export interface CreateExecutorBackendOptions {
  backendKind?: ExecutorBackendKind
  provider?: string
  configTemplate?: ResolvedAgentConfig
  browser?: Browser | null
  serverUrl?: string
  windowId?: number
  tabId?: number
  initialPageId?: number
  callbacks?: ExecutorCallbacks
  executor?: ExecutorBackend
}

export function backendKindForProvider(provider: string): ExecutorBackendKind {
  return provider === 'clado-action' ? 'clado' : 'tool-loop'
}

/** Creates the backend used for one orchestrator delegation. */
export function createExecutorBackend(
  options: CreateExecutorBackendOptions,
): ExecutorBackend {
  const kind =
    options.backendKind ??
    backendKindForProvider(
      options.provider ?? options.configTemplate?.provider ?? '',
    )

  return new ExecutorAdapterBackend({
    kind,
    configTemplate: options.configTemplate,
    browser: options.browser,
    serverUrl: options.serverUrl,
    windowId: options.windowId,
    tabId: options.tabId,
    initialPageId: options.initialPageId,
    callbacks: options.callbacks,
    executor: options.executor,
  })
}
