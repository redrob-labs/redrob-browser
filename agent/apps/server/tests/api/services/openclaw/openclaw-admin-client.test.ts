/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, expect, it, mock } from 'bun:test'
import { OPENCLAW_CONTAINER_HOME } from '@browseros/shared/constants/openclaw'
import { OpenClawAdminClient } from '../../../../src/api/services/openclaw/openclaw-admin-client'

describe('OpenClawAdminClient', () => {
  it('lists agents from JSON CLI output', async () => {
    const execInContainer = mock(
      async (_command: string[], onLog?: (line: string) => void) => {
        onLog?.(
          JSON.stringify([
            {
              id: 'main',
              workspace: `${OPENCLAW_CONTAINER_HOME}/workspace`,
              model: 'openrouter/anthropic/claude-haiku-4-5',
            },
          ]),
        )
        return 0
      },
    )
    const client = new OpenClawAdminClient(
      { execInContainer },
      async () => 'gateway-token',
    )

    const agents = await client.listAgents()

    expect(execInContainer).toHaveBeenCalledTimes(1)
    expect(execInContainer.mock.calls[0]?.[0]).toEqual([
      'node',
      'dist/index.js',
      'agents',
      'list',
      '--json',
      '--token',
      'gateway-token',
    ])
    expect(agents).toEqual([
      {
        agentId: 'main',
        name: 'main',
        workspace: `${OPENCLAW_CONTAINER_HOME}/workspace`,
        model: 'openrouter/anthropic/claude-haiku-4-5',
      },
    ])
  })

  it('creates an agent non-interactively and reads it back from the agent list', async () => {
    let callIndex = 0
    const execInContainer = mock(
      async (command: string[], onLog?: (line: string) => void) => {
        callIndex += 1
        if (callIndex === 1) {
          expect(command).toEqual([
            'node',
            'dist/index.js',
            'agents',
            'add',
            'research',
            '--workspace',
            `${OPENCLAW_CONTAINER_HOME}/workspace-research`,
            '--model',
            'openai/gpt-5.4-mini',
            '--non-interactive',
            '--json',
            '--token',
            'gateway-token',
          ])
          return 0
        }

        onLog?.(
          JSON.stringify([
            {
              id: 'main',
              workspace: `${OPENCLAW_CONTAINER_HOME}/workspace`,
            },
            {
              id: 'research',
              workspace: `${OPENCLAW_CONTAINER_HOME}/workspace-research`,
              model: 'openai/gpt-5.4-mini',
            },
          ]),
        )
        return 0
      },
    )
    const client = new OpenClawAdminClient(
      { execInContainer },
      async () => 'gateway-token',
    )

    const agent = await client.createAgent({
      name: 'research',
      workspace: `${OPENCLAW_CONTAINER_HOME}/workspace-research`,
      model: 'openai/gpt-5.4-mini',
    })

    expect(execInContainer).toHaveBeenCalledTimes(2)
    expect(agent).toEqual({
      agentId: 'research',
      name: 'research',
      workspace: `${OPENCLAW_CONTAINER_HOME}/workspace-research`,
      model: 'openai/gpt-5.4-mini',
    })
  })

  it('includes CLI stderr or stdout in thrown errors', async () => {
    const execInContainer = mock(
      async (_command: string[], onLog?: (line: string) => void) => {
        onLog?.('agent already exists')
        return 1
      },
    )
    const client = new OpenClawAdminClient(
      { execInContainer },
      async () => 'gateway-token',
    )

    await expect(client.listAgents()).rejects.toThrow('agent already exists')
  })
})
