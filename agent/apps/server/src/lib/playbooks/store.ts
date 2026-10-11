/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Playbooks on this device, one JSON file each in `<browseros dir>/playbooks` (mode 0600). Files rather
 * than tables because a playbook is shared as a file and imported as one; the format is the same.
 *
 * Also the runs in progress: which conversation is running which playbook, so the browser-tool guard
 * can keep a run to the playbook's sites and stop it before anything final.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  normalisePlaybook,
  type Playbook,
  validatePlaybook,
} from '@browseros/playbooks/playbook'
import { getBrowserosDir } from '../browseros-dir'

const RUN_TTL_MS = 2 * 60 * 60_000

export interface ActivePlaybookRun {
  playbookId: string
  name: string
  sites: string[]
  expiresAt: number
}

export class PlaybookStore {
  private readonly runs = new Map<string, ActivePlaybookRun>()

  constructor(
    private readonly dir = join(getBrowserosDir(), 'playbooks'),
    private readonly now: () => number = Date.now,
  ) {}

  private file(id: string): string {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('bad playbook id')
    return join(this.dir, `${id}.json`)
  }

  list(): Playbook[] {
    let names: string[] = []
    try {
      names = readdirSync(this.dir).filter((n) => n.endsWith('.json'))
    } catch {
      return []
    }
    const out: Playbook[] = []
    for (const name of names) {
      try {
        const value = JSON.parse(readFileSync(join(this.dir, name), 'utf8'))
        if (!validatePlaybook(value)) out.push(normalisePlaybook(value))
      } catch {
        // A file someone edited by hand into something else is skipped, not fatal.
      }
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  get(id: string): Playbook | null {
    return this.list().find((p) => p.id === id) ?? null
  }

  async save(playbook: Playbook): Promise<Playbook> {
    const problem = validatePlaybook(playbook)
    if (problem) throw new PlaybookInvalidError(problem)
    const saved = normalisePlaybook({ ...playbook, updatedAt: this.now() })
    await mkdir(this.dir, { recursive: true, mode: 0o700 })
    const temporary = `${this.file(saved.id)}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(saved, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
    await rename(temporary, this.file(saved.id))
    return saved
  }

  async remove(id: string): Promise<void> {
    await rm(this.file(id), { force: true })
  }

  /** Records that `conversationId` is now running `playbook`; counts the run. */
  async startRun(conversationId: string, playbook: Playbook): Promise<void> {
    this.runs.set(conversationId, {
      playbookId: playbook.id,
      name: playbook.name,
      sites: playbook.sites,
      expiresAt: this.now() + RUN_TTL_MS,
    })
    await this.save({
      ...playbook,
      runs: playbook.runs + 1,
      lastRunAt: this.now(),
    })
  }

  activeRun(conversationId: string | undefined): ActivePlaybookRun | null {
    if (!conversationId) return null
    const run = this.runs.get(conversationId)
    if (!run) return null
    if (run.expiresAt < this.now()) {
      this.runs.delete(conversationId)
      return null
    }
    return run
  }

  endRun(conversationId: string): void {
    this.runs.delete(conversationId)
  }
}

export class PlaybookInvalidError extends Error {}
