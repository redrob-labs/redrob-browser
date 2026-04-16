/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

type LogFn = (line: string) => void

interface ContainerExecutor {
  execInContainer(command: string[], onLog?: LogFn): Promise<number>
}

interface RawAgentRecord {
  id: string
  name?: string
  workspace: string
  model?: string
}

export interface OpenClawAgentRecord {
  agentId: string
  name: string
  workspace: string
  model?: string
}

export class OpenClawAdminClient {
  constructor(
    private readonly executor: ContainerExecutor,
    private readonly getToken: () => Promise<string>,
  ) {}

  async listAgents(): Promise<OpenClawAgentRecord[]> {
    const records = await this.runJsonCommand<RawAgentRecord[]>([
      'agents',
      'list',
      '--json',
    ])
    return records.map((record) => ({
      agentId: record.id,
      name: record.name ?? record.id,
      workspace: record.workspace,
      model: record.model,
    }))
  }

  async createAgent(input: {
    name: string
    workspace: string
    model?: string
  }): Promise<OpenClawAgentRecord> {
    const args = ['agents', 'add', input.name, '--workspace', input.workspace]

    if (input.model) {
      args.push('--model', input.model)
    }

    args.push('--non-interactive', '--json')
    await this.runCommand(args)
    const agents = await this.listAgents()
    const agent = agents.find((entry) => entry.agentId === input.name)

    if (!agent) {
      throw new Error(`Created agent ${input.name} was not found in agent list`)
    }

    return agent
  }

  async deleteAgent(agentId: string): Promise<void> {
    await this.runCommand(['agents', 'delete', agentId, '--force', '--json'])
  }

  async probe(): Promise<void> {
    await this.listAgents()
  }

  private async runJsonCommand<T>(args: string[]): Promise<T> {
    const output = await this.runCommand(args)
    return parseJsonOutput<T>(output)
  }

  private async runCommand(args: string[]): Promise<string> {
    const output: string[] = []
    const token = await this.getToken()
    const command = ['node', 'dist/index.js', ...args, '--token', token]
    const exitCode = await this.executor.execInContainer(command, (line) =>
      output.push(line),
    )

    if (exitCode !== 0) {
      const detail = output.join('\n').trim()
      throw new Error(
        detail || `OpenClaw command failed (${args.slice(0, 2).join(' ')})`,
      )
    }

    return output.join('\n').trim()
  }
}

function parseJsonOutput<T>(output: string): T {
  const direct = tryParseJson<T>(output)
  if (direct !== null) return direct

  const start = output.search(/[[{]/)
  if (start >= 0) {
    const sliced = tryParseJson<T>(output.slice(start))
    if (sliced !== null) return sliced
  }

  throw new Error(
    `Failed to parse OpenClaw JSON output: ${output.slice(0, 200)}`,
  )
}

function tryParseJson<T>(value: string): T | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed) as T
  } catch {
    return null
  }
}
