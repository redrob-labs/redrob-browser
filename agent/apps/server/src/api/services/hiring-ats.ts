/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Saving someone to the team's ATS (Recruit plan §4.4), when the recruiter presses "Save to <ATS>":
 *
 *   API       when the team connected Greenhouse, Lever or Ashby: find the person (or the id saved
 *             last time), add them as a prospect if they are not there, and add the note. Done here.
 *   browser   every ATS, Workday included: a side-panel run in the recruiter's own tab that adds the
 *             note, and moves the stage only to the one the recruiter chose. The stage-change guard
 *             holds it to that host, to the note's exact text, and away from every control that
 *             rejects, archives or dispositions. When the note is posted, the server screenshots
 *             the page for the receipt.
 *
 * Either way the person moves to Saved, and the record keeps which system, which path, and the id.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  ATS_HOSTS,
  ATS_NAMES,
  type AtsId,
  atsNote,
  CONNECTABLE_ATS,
  type ConnectableAts,
  isConnectable,
} from '@browseros/hiring/ats'
import { activeCriteria } from '@browseros/hiring/criteria'
import { getBrowserosDir } from '../../lib/browseros-dir'
import {
  type AtsClient,
  type AtsCredential,
  AtsError,
  atsClient,
} from '../../lib/hiring/ats-clients'
import { HiringInputError, type HiringStore } from '../../lib/hiring/store'

export interface AtsCredentialStore {
  get(ats: ConnectableAts): AtsCredential | null
  set(credential: AtsCredential): void
  delete(ats: ConnectableAts): void
}

const RUN_TTL_MS = 20 * 60_000

export interface AtsBrowserRun {
  roleId: string
  personId: string
  ats: AtsId
  host: string
  note: string
  /** The stage the recruiter chose, by the name their ATS uses; none means no stage move. */
  stage?: string
  /** Short texts the run may type: the person's name, address and profile, to find or add them. */
  allowedTexts: string[]
  /** The note was typed, word for word: a save press after this posts it. */
  noteTyped: boolean
  notePosted: boolean
  stageMoved: boolean
  receipt?: string
  expiresAt: number
}

export type AtsSaveOutcome =
  | {
      status: 'saved'
      ats: AtsId
      candidateId?: string
      via: 'api' | 'browser'
    }
  | { status: 'needs-you'; reason: string }

export class HiringAts {
  private readonly runs = new Map<string, AtsBrowserRun>()

  constructor(
    private readonly store: HiringStore,
    private readonly credentials: AtsCredentialStore,
    private readonly options: {
      now?: () => number
      fetch?: (url: string, init?: RequestInit) => Promise<Response>
      receiptsDir?: string
    } = {},
  ) {}

  private now(): number {
    return (this.options.now ?? Date.now)()
  }

  private receiptsDir(): string {
    return (
      this.options.receiptsDir ?? join(getBrowserosDir(), 'hiring-receipts')
    )
  }

  private client(credential: AtsCredential): AtsClient {
    return atsClient(credential, {
      fetch: this.options.fetch,
      now: this.options.now,
    })
  }

  /** Which systems are connected. Never the key. */
  connections(): Array<{ ats: ConnectableAts; connected: boolean }> {
    return CONNECTABLE_ATS.map((ats) => ({
      ats,
      connected: this.credentials.get(ats) !== null,
    }))
  }

  /** Checks the key with the ATS before keeping it. */
  async connect(credential: AtsCredential): Promise<void> {
    const verified = await this.client(credential).verify()
    this.credentials.set(verified)
    this.store.event('ats-connected', 'recruiter', { ats: credential.ats })
  }

  disconnect(ats: ConnectableAts): void {
    this.credentials.delete(ats)
    this.store.event('ats-disconnected', 'recruiter', { ats })
  }

  private person(roleId: string, personId: string) {
    const role = this.store.getRole(roleId)
    if (!role) throw new HiringInputError('no-role', 'no such role')
    const person = this.store
      .peopleOnRole(roleId)
      .find((p) => p.id === personId)
    if (!person)
      throw new HiringInputError('no-person', 'this person is not on the role')
    if (person.stage === 'set-aside')
      throw new HiringInputError('set-aside', 'this person is set aside')
    if (person.stage === 'found')
      throw new HiringInputError(
        'not-shortlisted',
        'only someone the recruiter shortlisted is saved to the ATS',
      )
    return { role, person }
  }

  private note(roleId: string, personId: string, locale: string): string {
    const { role, person } = this.person(roleId, personId)
    return atsNote({
      roleTitle: role.title,
      profileUrl: person.record.url,
      evaluation: person.evaluation,
      criteria: activeCriteria(role.criteria),
      locale,
      at: new Date(this.now()),
    })
  }

  /** The id this person had in that ATS when they were saved before, so they are not added twice. */
  private savedId(personId: string, ats: AtsId): string | undefined {
    for (const event of [...this.store.record()].reverse()) {
      if (
        event.personId === personId &&
        event.kind === 'saved-to-ats' &&
        event.detail?.ats === ats &&
        typeof event.detail.candidateId === 'string'
      )
        return event.detail.candidateId
    }
    return undefined
  }

  private saved(
    roleId: string,
    personId: string,
    detail: Record<string, unknown>,
  ): void {
    this.store.event('saved-to-ats', 'recruiter', detail, { roleId, personId })
    this.store.setStage(roleId, personId, 'saved', 'recruiter')
  }

  /** Through the connection: the recruiter's press is the approval for this one person. */
  async saveViaApi(
    roleId: string,
    personId: string,
    ats: ConnectableAts,
    locale: string,
  ): Promise<AtsSaveOutcome> {
    const credential = this.credentials.get(ats)
    if (!credential) return { status: 'needs-you', reason: 'not-connected' }
    const { person } = this.person(roleId, personId)
    const note = this.note(roleId, personId, locale)
    const client = this.client(credential)
    const who = {
      name: person.record.name,
      email: person.record.contact.find((c) => c.kind === 'email' && c.value)
        ?.value,
      profileUrl: person.record.url,
      headline: person.record.headline,
    }
    try {
      let candidateId =
        this.savedId(personId, ats) ??
        (person.record.site === ats ? person.record.atsId : undefined) ??
        (await client.find(who)) ??
        undefined
      const added = !candidateId
      if (!candidateId) candidateId = await client.addProspect(who)
      await client.addNote(candidateId, note)
      this.saved(roleId, personId, { ats, via: 'api', candidateId, added })
      return { status: 'saved', ats, candidateId, via: 'api' }
    } catch (error) {
      if (error instanceof AtsError)
        return { status: 'needs-you', reason: error.code }
      throw error
    }
  }

  /** Starts the browser run in `conversationId`. Returns the instruction for the agent. */
  startBrowser(
    roleId: string,
    personId: string,
    input: {
      ats: AtsId
      conversationId: string
      locale: string
      stage?: string
    },
  ): { instruction: string } {
    const { person } = this.person(roleId, personId)
    const note = this.note(roleId, personId, input.locale)
    const name = ATS_NAMES[input.ats]
    const host = ATS_HOSTS[input.ats]
    const email = person.record.contact.find(
      (c) => c.kind === 'email' && c.value,
    )?.value
    const stage = input.stage?.trim() || undefined
    this.runs.set(input.conversationId, {
      roleId,
      personId,
      ats: input.ats,
      host,
      note,
      stage,
      allowedTexts: [person.record.name, person.record.url, email ?? ''].filter(
        Boolean,
      ),
      noteTyped: false,
      notePosted: false,
      stageMoved: false,
      expiresAt: this.now() + RUN_TTL_MS,
    })
    const onPage =
      person.record.site === input.ats
        ? ` Their ${name} page: ${person.record.url}`
        : ''
    return {
      instruction: [
        `In my ${name} (on ${host}), find ${person.record.name}${email ? ` (${email})` : ''}.${onPage}`,
        `If they are not in ${name}, add them as a prospect with their name${email ? ', email' : ''} and this profile link: ${person.record.url}`,
        'Then add this note to them, exactly as written:',
        '"""',
        note,
        '"""',
        stage
          ? `Then move them to the "${stage}" stage, and to no other.`
          : 'Do not change their stage.',
        'Never reject, archive, disqualify or disposition anyone. If you are not signed in, or cannot find where to add the note, stop and tell me.',
        'When the note is saved, stop and say it is done.',
      ].join('\n'),
    }
  }

  activeRun(conversationId: string | undefined): AtsBrowserRun | null {
    if (!conversationId) return null
    const run = this.runs.get(conversationId)
    if (!run) return null
    if (run.expiresAt < this.now()) {
      this.runs.delete(conversationId)
      return null
    }
    return run
  }

  /** The note's save press succeeded: keep the picture of the page for the receipt. */
  async markNotePosted(
    conversationId: string,
    screenshot?: { data: string },
  ): Promise<void> {
    const run = this.activeRun(conversationId)
    if (!run || run.notePosted) return
    run.notePosted = true
    if (screenshot?.data) {
      const id = crypto.randomUUID()
      await mkdir(this.receiptsDir(), { recursive: true, mode: 0o700 })
      await writeFile(
        join(this.receiptsDir(), `${id}.png`),
        Buffer.from(screenshot.data, 'base64'),
        { mode: 0o600 },
      )
      run.receipt = id
    }
  }

  markStageMoved(conversationId: string): void {
    const run = this.activeRun(conversationId)
    if (run) run.stageMoved = true
  }

  /** The chat finished: saved when the note was posted, otherwise back to the recruiter. */
  end(conversationId: string): AtsSaveOutcome {
    const run = this.runs.get(conversationId)
    if (!run) return { status: 'needs-you', reason: 'no-run' }
    this.runs.delete(conversationId)
    if (!run.notePosted) return { status: 'needs-you', reason: 'not-saved' }
    this.saved(run.roleId, run.personId, {
      ats: run.ats,
      via: 'browser',
      ...(run.stage ? { stage: run.stage, stageMoved: run.stageMoved } : {}),
      ...(run.receipt ? { receipt: run.receipt } : {}),
    })
    return { status: 'saved', ats: run.ats, via: 'browser' }
  }

  async receipt(id: string): Promise<Buffer> {
    if (!/^[0-9a-f-]{36}$/.test(id))
      throw new HiringInputError('no-receipt', 'no such receipt')
    return readFile(join(this.receiptsDir(), `${id}.png`))
  }
}

export { isConnectable }
