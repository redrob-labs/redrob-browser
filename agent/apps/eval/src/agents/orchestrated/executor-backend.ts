import type { ExecutorResult } from '../orchestrator-executor/types'

export type ExecutorBackendKind = 'tool-loop' | 'clado'
export type DelegationResult = ExecutorResult

export interface ExecutorBackend {
  readonly kind: ExecutorBackendKind
  execute(instruction: string, signal?: AbortSignal): Promise<DelegationResult>
  close(): Promise<void>
  getTotalSteps(): number
}
