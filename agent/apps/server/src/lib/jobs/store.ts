/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Job Apply on this computer, in `<browseros dir>/jobs` (files mode 0600): the profile, the résumé,
 * the applications and their receipts. Nothing here is sent to Redrob or to any hiring product.
 *
 * Also the applications in progress: which conversation is filling which application, in which mode,
 * so the browser-tool guard can stop before the submit button in review mode, keep uploads to the
 * résumé, and the receipt effect can record what was filled and when it was sent.
 */

import { readFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import {
  type Application,
  type ApplicationStatus,
  canQueue,
  type QueueRefusal,
  type Receipt,
} from '@browseros/jobs/applications'
import type { JobPosting } from '@browseros/jobs/posting'
import {
  type ApplyMode,
  EMPTY_PROFILE,
  type JobProfile,
  starterAnswers,
} from '@browseros/jobs/profile'
import { getBrowserosDir } from '../browseros-dir'

const RUN_TTL_MS = 60 * 60_000
export const RESUME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
}
export const MAX_RESUME_BYTES = 10 * 1024 * 1024

export interface ActiveApplicationRun {
  applicationId: string
  mode: ApplyMode
  title: string
  company: string
  /** The only file an upload may set during this run. */
  resumePath?: string
  fields: Receipt['fields']
  expiresAt: number
}

export class JobStore {
  private readonly runs = new Map<string, ActiveApplicationRun>()

  constructor(
    private readonly dir = join(getBrowserosDir(), 'jobs'),
    private readonly now: () => number = Date.now,
  ) {}

  private path(...parts: string[]): string {
    return join(this.dir, ...parts)
  }

  private read<T>(name: string, fallback: T): T {
    try {
      return JSON.parse(readFileSync(this.path(name), 'utf8')) as T
    } catch {
      return fallback
    }
  }

  private async write(name: string, value: unknown): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 })
    const temporary = `${this.path(name)}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(value, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
    await rename(temporary, this.path(name))
  }

  getProfile(): JobProfile {
    const stored = this.read<Partial<JobProfile> | null>('profile.json', null)
    if (!stored) return { ...EMPTY_PROFILE, answers: starterAnswers() }
    return { ...EMPTY_PROFILE, ...stored, version: 1 }
  }

  async saveProfile(
    profile: Omit<JobProfile, 'version' | 'resume'>,
  ): Promise<JobProfile> {
    const saved: JobProfile = {
      ...profile,
      version: 1,
      resume: this.getProfile().resume,
    }
    await this.write('profile.json', saved)
    return saved
  }

  /** The résumé file on disk, which uploads during an application are limited to. */
  resumePath(): string | undefined {
    const resume = this.getProfile().resume
    return resume ? this.path('resume', resume.name) : undefined
  }

  async saveResume(name: string, bytes: Uint8Array): Promise<JobProfile> {
    const extension = extname(name).toLowerCase()
    if (!RESUME_TYPES[extension]) throw new JobInputError('unsupported file')
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_RESUME_BYTES) {
      throw new JobInputError('file too large')
    }
    // The file keeps the person's name for it (forms show it to the employer), minus path tricks.
    const safe = name.replace(/[/\\]/g, '_').replace(/^\.+/, '').slice(-120)
    await rm(this.path('resume'), { recursive: true, force: true })
    await mkdir(this.path('resume'), { recursive: true, mode: 0o700 })
    await writeFile(this.path('resume', safe), bytes, { mode: 0o600 })
    const profile: JobProfile = {
      ...this.getProfile(),
      resume: { name: safe, size: bytes.byteLength, addedAt: this.now() },
    }
    await this.write('profile.json', profile)
    return profile
  }

  async removeResume(): Promise<JobProfile> {
    await rm(this.path('resume'), { recursive: true, force: true })
    const { resume: _removed, ...rest } = this.getProfile()
    await this.write('profile.json', rest)
    return rest
  }

  listApplications(): Application[] {
    return this.read<Application[]>('applications.json', []).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    )
  }

  getApplication(id: string): Application | null {
    return this.listApplications().find((a) => a.id === id) ?? null
  }

  async queue(
    posting: JobPosting,
    automatic: boolean,
  ): Promise<{ application: Application } | { refused: QueueRefusal }> {
    const applications = this.listApplications()
    const refused = canQueue(applications, posting, {
      automatic,
      dailyCap: this.getProfile().dailyCap,
      now: this.now(),
    })
    if (refused) return { refused }
    const application: Application = {
      id: crypto.randomUUID(),
      posting,
      status: 'queued',
      createdAt: this.now(),
      updatedAt: this.now(),
    }
    await this.write('applications.json', [application, ...applications])
    return { application }
  }

  async update(
    id: string,
    patch: Partial<Pick<Application, 'status' | 'note' | 'conversationId'>> & {
      receipt?: Receipt
    },
  ): Promise<Application | null> {
    const applications = this.listApplications()
    const index = applications.findIndex((a) => a.id === id)
    if (index < 0) return null
    const current = applications[index] as Application
    const next: Application = { ...current, ...patch, updatedAt: this.now() }
    if (patch.status === 'sent' && !next.receipt) {
      next.receipt = { fields: [], sentAt: this.now() }
    }
    applications[index] = next
    await this.write('applications.json', applications)
    return next
  }

  async remove(id: string): Promise<void> {
    const applications = this.listApplications()
    await this.write(
      'applications.json',
      applications.filter((a) => a.id !== id),
    )
    await rm(this.receiptPath(id), { force: true })
  }

  receiptPath(id: string): string {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) throw new JobInputError('bad id')
    return this.path('receipts', `${id}.png`)
  }

  /** Records that `conversationId` is now filling `application`. */
  async startRun(
    conversationId: string,
    application: Application,
    mode: ApplyMode,
  ): Promise<void> {
    this.runs.set(conversationId, {
      applicationId: application.id,
      mode,
      title: application.posting.title,
      company: application.posting.company,
      resumePath: this.resumePath(),
      fields: [],
      expiresAt: this.now() + RUN_TTL_MS,
    })
    await this.update(application.id, { status: 'filling', conversationId })
  }

  activeRun(conversationId: string | undefined): ActiveApplicationRun | null {
    if (!conversationId) return null
    const run = this.runs.get(conversationId)
    if (!run) return null
    if (run.expiresAt < this.now()) {
      this.runs.delete(conversationId)
      return null
    }
    return run
  }

  recordField(conversationId: string, field: string, value: string): void {
    const run = this.activeRun(conversationId)
    if (!run) return
    const existing = run.fields.find((f) => f.field === field)
    if (existing) existing.value = value
    else run.fields.push({ field, value })
  }

  /** The submit button was pressed: keeps the receipt and ends the run. */
  async markSent(
    conversationId: string,
    screenshot?: { data: string },
  ): Promise<Application | null> {
    const run = this.activeRun(conversationId)
    if (!run) return null
    this.runs.delete(conversationId)
    let file: string | undefined
    if (screenshot) {
      await mkdir(this.path('receipts'), { recursive: true, mode: 0o700 })
      file = `${run.applicationId}.png`
      await writeFile(
        this.path('receipts', file),
        Buffer.from(screenshot.data, 'base64'),
        { mode: 0o600 },
      )
    }
    return this.update(run.applicationId, {
      status: 'sent',
      receipt: { fields: run.fields, screenshot: file, sentAt: this.now() },
    })
  }

  /** The run stopped for the person: review mode finished, or a question needs them. */
  async endRun(
    conversationId: string,
    status: Extract<ApplicationStatus, 'ready' | 'needs-you' | 'failed'>,
    note?: string,
  ): Promise<void> {
    const run = this.runs.get(conversationId)
    if (!run) return
    this.runs.delete(conversationId)
    await this.update(run.applicationId, { status, note })
  }
}

export class JobInputError extends Error {}
