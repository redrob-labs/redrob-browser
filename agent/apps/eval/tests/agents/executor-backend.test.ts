import { describe, expect, it } from 'bun:test'
import {
  backendKindForProvider,
  createExecutorBackend,
} from '../../src/agents/orchestrated/backends/create-executor-backend'
import type { ExecutorBackend } from '../../src/agents/orchestrated/executor-backend'

describe('executor backend boundary', () => {
  it('selects Clado only for the Clado action provider', () => {
    expect(backendKindForProvider('clado-action')).toBe('clado')
    expect(backendKindForProvider('openai-compatible')).toBe('tool-loop')
  })

  it('forwards execution and step state through the backend interface', async () => {
    const signal = new AbortController().signal
    const fakeBackend: ExecutorBackend = {
      kind: 'tool-loop',
      async execute(instruction, receivedSignal) {
        expect(instruction).toBe('Click checkout')
        expect(receivedSignal).toBe(signal)
        return {
          observation: 'Clicked checkout',
          status: 'done',
          url: 'https://example.test/checkout',
          actionsPerformed: 2,
          toolsUsed: ['browser_click_element'],
        }
      },
      async close() {},
      getTotalSteps() {
        return 2
      },
    }

    const backend = createExecutorBackend({
      backendKind: 'tool-loop',
      executor: fakeBackend,
    })
    const result = await backend.execute('Click checkout', signal)

    expect(result.observation).toBe('Clicked checkout')
    expect(result.actionsPerformed).toBe(2)
    expect(backend.getTotalSteps()).toBe(2)
  })
})
