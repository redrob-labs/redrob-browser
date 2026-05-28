import { describe, expect, it } from 'bun:test'
import type {
  HarnessAdapterDescriptor,
  HarnessAgent,
  HarnessAgentAdapter,
} from '@/entrypoints/app/agents/agent-harness-types'
import type { LlmProviderConfig } from '@/lib/llm-providers/types'
// Relative value import: `bun test` resolves tsconfig paths from the package
// root, where `@/` is undefined — only erased `import type` works via `@/`.
import { buildSidepanelChatTargets } from '../../entrypoints/sidepanel/index/sidepanel-chat-targets'
import { isAdapterHidden, visibleAdapters } from './adapter-visibility'

function makeAdapter(id: HarnessAgentAdapter): HarnessAdapterDescriptor {
  return {
    id,
    name: id,
    defaultModelId: 'model',
    defaultReasoningEffort: 'medium',
    modelControl: 'best-effort',
    models: [],
    reasoningEfforts: [],
  }
}

function makeAgent(id: string, adapter: HarnessAgentAdapter): HarnessAgent {
  return {
    id,
    name: id,
    adapter,
    permissionMode: 'approve-all',
    sessionKey: 'session',
    createdAt: 0,
    updatedAt: 0,
  }
}

function makeProvider(id: string): LlmProviderConfig {
  return {
    id,
    type: 'browseros',
    name: id,
    modelId: 'model',
    supportsImages: false,
    contextWindow: 1000,
    temperature: 0.2,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('isAdapterHidden', () => {
  it('hides hermes', () => {
    expect(isAdapterHidden('hermes')).toBe(true)
  })

  it('shows claude and codex', () => {
    expect(isAdapterHidden('claude')).toBe(false)
    expect(isAdapterHidden('codex')).toBe(false)
  })
})

describe('visibleAdapters', () => {
  it('drops hermes descriptors and preserves the order of the rest', () => {
    const result = visibleAdapters([
      makeAdapter('claude'),
      makeAdapter('hermes'),
      makeAdapter('codex'),
    ])
    expect(result.map((adapter) => adapter.id)).toEqual(['claude', 'codex'])
  })
})

describe('buildSidepanelChatTargets adapter visibility', () => {
  it('omits acp targets for hermes-backed agents but keeps claude/codex', () => {
    const targets = buildSidepanelChatTargets({
      providers: [],
      adapters: [
        makeAdapter('claude'),
        makeAdapter('codex'),
        makeAdapter('hermes'),
      ],
      agents: [
        makeAgent('a', 'claude'),
        makeAgent('b', 'hermes'),
        makeAgent('c', 'codex'),
      ],
    })
    expect(
      targets
        .filter((target) => target.kind === 'acp')
        .map((target) => target.id),
    ).toEqual(['a', 'c'])
  })

  it('keeps one llm target per provider', () => {
    const targets = buildSidepanelChatTargets({
      providers: [makeProvider('p1'), makeProvider('p2')],
      adapters: [],
      agents: [],
    })
    expect(
      targets
        .filter((target) => target.kind === 'llm')
        .map((target) => target.id),
    ).toEqual(['p1', 'p2'])
  })
})
