import type { ResolvedAgentConfig } from '@browseros/server/agent/types'
import type { Browser } from '@browseros/server/browser'
import {
  Executor,
  type ExecutorCallbacks,
} from '../../orchestrator-executor/executor'
import type {
  DelegationResult,
  ExecutorBackend,
  ExecutorBackendKind,
} from '../executor-backend'

interface ExecutorRunner {
  execute(instruction: string, signal?: AbortSignal): Promise<DelegationResult>
  close(): Promise<void>
  getTotalSteps(): number
}

export interface ExecutorAdapterBackendOptions {
  kind: ExecutorBackendKind
  configTemplate?: ResolvedAgentConfig
  browser?: Browser | null
  serverUrl?: string
  windowId?: number
  tabId?: number
  initialPageId?: number
  callbacks?: ExecutorCallbacks
  executor?: ExecutorRunner
}

export class ExecutorAdapterBackend implements ExecutorBackend {
  readonly kind: ExecutorBackendKind
  private readonly executor: ExecutorRunner

  constructor(options: ExecutorAdapterBackendOptions) {
    this.kind = options.kind
    this.executor =
      options.executor ??
      new Executor(
        required(options.configTemplate, 'configTemplate'),
        options.browser ?? null,
        required(options.serverUrl, 'serverUrl'),
        {
          isCladoAction: options.kind === 'clado',
          windowId: options.windowId,
          tabId: options.tabId,
          initialPageId: options.initialPageId,
          callbacks: options.callbacks,
        },
      )
  }

  execute(
    instruction: string,
    signal?: AbortSignal,
  ): Promise<DelegationResult> {
    return this.executor.execute(instruction, signal)
  }

  close(): Promise<void> {
    return this.executor.close()
  }

  getTotalSteps(): number {
    return this.executor.getTotalSteps()
  }
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`${name} is required`)
  return value
}
