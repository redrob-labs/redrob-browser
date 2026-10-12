/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Talent Scout's outreach (Recruit plan §3.2 "Messages", §3.3, §4.3).
 *
 *   draft     the model writes, behind the privacy gate at High, with labels; real names go back in
 *             on this computer. Every first message ends with how they were found and how to say no.
 *   approve   the recruiter, one by one or as a batch; in Automatic, Redrob approves only messages to
 *             people who meet every must have with evidence, and never where a law needs more first.
 *   send      only through the side panel, one message per run, in the recruiter's own tab, on the
 *             site's own channel. Before a run starts the limits are checked: opt-outs, the 90-day
 *             window, the day's cap, quiet hours in the recipient's time zone, follow-up spacing.
 *             During the run the send guard holds the agent to that one approved text.
 *   reply     an opt-out stops everything to that person at once and adds them to the suppression
 *             list; any other reply stops the follow-ups.
 */

import { activeCriteria } from '@browseros/hiring/criteria'
import {
  canSend,
  DEFAULT_LIMITS,
  isOptOut,
  type OutreachLimits,
  type SendRefusal,
  type SentMessage,
} from '@browseros/hiring/limits'
import {
  automaticAllowed,
  DRAFT_SYSTEM,
  draftPrompt,
  FOLLOW_UP_SYSTEM,
  timeZoneFor,
  withNotice,
} from '@browseros/hiring/outreach'
import { type SiteId, siteById } from '@browseros/hiring/sites'
import { and, asc, eq, inArray } from 'drizzle-orm'
import {
  type HiringMessageRow,
  hiringMessages,
} from '../../lib/db/schema/hiring'
import { HiringInputError, type HiringStore } from '../../lib/hiring/store'
import type { PrivacyGate } from '../../lib/privacy/gate'
import type { Complete } from './hiring-screening'

const RUN_TTL_MS = 30 * 60_000

/** One message being sent in one side-panel conversation: what the send guard holds the agent to. */
export interface ActiveOutreachRun {
  messageId: string
  body: string
  /** The person's profile host: the only site the run may go to. */
  host: string
  sent: boolean
  expiresAt: number
}

export type DraftOutcome =
  | { status: 'drafted'; message: HiringMessageRow }
  | { status: 'needs-you'; reason: 'privacy' | 'no-model' | 'model-failed' }

export class OutreachRefusedError extends Error {
  constructor(readonly code: SendRefusal | 'not-approved' | 'set-aside') {
    super(code)
  }
}

export class HiringOutreach {
  private readonly runs = new Map<string, ActiveOutreachRun>()

  constructor(
    private readonly store: HiringStore,
    private readonly gate: Pick<PrivacyGate, 'label' | 'restore' | 'forget'>,
    private readonly complete: Complete | null,
    private readonly options: {
      now?: () => number
      limits?: OutreachLimits
      /** The recruiter's own time zone, for a recipient whose place is unknown. */
      timeZone?: string
    } = {},
  ) {}

  private now(): number {
    return (this.options.now ?? Date.now)()
  }

  private get db() {
    return this.store.db
  }

  get(id: string): HiringMessageRow | null {
    return (
      this.db
        .select()
        .from(hiringMessages)
        .where(eq(hiringMessages.id, id))
        .get() ?? null
    )
  }

  list(roleId?: string): HiringMessageRow[] {
    const query = this.db.select().from(hiringMessages)
    return (roleId ? query.where(eq(hiringMessages.roleId, roleId)) : query)
      .orderBy(asc(hiringMessages.createdAt))
      .all()
  }

  private history(): SentMessage[] {
    return this.db
      .select()
      .from(hiringMessages)
      .where(eq(hiringMessages.status, 'sent'))
      .all()
      .map((m) => ({
        personId: m.personId,
        channel: m.channel,
        sentAt: m.sentAt ?? m.updatedAt,
        sequence: m.sequence,
      }))
  }

  /** Today's sends per channel, against its cap: what the Messages tab shows under the queue. */
  today(): Array<{ channel: string; sent: number; cap: number }> {
    const limits = this.options.limits ?? DEFAULT_LIMITS
    const day = new Date(this.now()).toDateString()
    const counts = new Map<string, number>()
    for (const m of this.history()) {
      if (new Date(m.sentAt).toDateString() === day)
        counts.set(m.channel, (counts.get(m.channel) ?? 0) + 1)
    }
    return [...counts.entries()].map(([channel, sent]) => ({
      channel,
      sent,
      cap: limits.perSitePerDay[channel] ?? 0,
    }))
  }

  private person(roleId: string, personId: string) {
    const role = this.store.getRole(roleId)
    if (!role) throw new HiringInputError('no-role', 'no such role')
    const person = this.store
      .peopleOnRole(roleId)
      .find((p) => p.id === personId)
    if (!person)
      throw new HiringInputError('no-person', 'this person is not on the role')
    return { role, person }
  }

  private update(
    id: string,
    patch: Partial<HiringMessageRow>,
  ): HiringMessageRow {
    this.db
      .update(hiringMessages)
      .set({ ...patch, updatedAt: this.now() })
      .where(eq(hiringMessages.id, id))
      .run()
    return this.get(id) as HiringMessageRow
  }

  /** A first message (sequence 0) or a follow-up, written by the model or by the recruiter (`body`). */
  async draft(
    roleId: string,
    personId: string,
    input: {
      notice: string
      language: string
      tone?: string
      body?: string
      sequence?: number
    },
  ): Promise<DraftOutcome> {
    const { role, person } = this.person(roleId, personId)
    if (person.stage === 'set-aside')
      throw new OutreachRefusedError('set-aside')
    const channel = person.record.site as SiteId
    if (siteById(channel).send === 'none')
      throw new OutreachRefusedError('no-channel')
    const sentBefore = this.list(roleId).filter(
      (m) => m.personId === personId && m.status === 'sent',
    )
    // A follow-up is numbered by what was really sent, not by what the caller says.
    const sequence = input.sequence ? Math.max(1, sentBefore.length) : 0
    const previous = sequence ? sentBefore.at(-1)?.body : undefined

    let body = input.body?.trim()
    if (!body) {
      if (!this.complete) return { status: 'needs-you', reason: 'no-model' }
      const evidence = (person.evaluation?.results ?? [])
        .filter((r) => r.state === 'met' && r.by === 'model' && r.evidence)
        .map((r) => r.evidence as string)
      const key = `hiring:draft:${roleId}:${personId}:${this.now()}`
      try {
        let labelled: string
        try {
          labelled =
            (
              await this.gate.label(
                key,
                [
                  draftPrompt({
                    role,
                    name: person.record.name,
                    evidence,
                    tone: input.tone,
                    language: input.language,
                    previous,
                  }),
                ],
                { minLevel: 'high' },
              )
            ).texts[0] ?? ''
        } catch {
          return { status: 'needs-you', reason: 'privacy' }
        }
        try {
          body = this.gate
            .restore(
              key,
              await this.complete(
                sequence ? FOLLOW_UP_SYSTEM : DRAFT_SYSTEM,
                labelled,
              ),
            )
            .trim()
        } catch {
          return { status: 'needs-you', reason: 'model-failed' }
        }
      } finally {
        this.gate.forget(key)
      }
      if (!body) return { status: 'needs-you', reason: 'model-failed' }
    }
    if (sequence === 0) body = withNotice(body, input.notice)

    // Automatic approves only where every floor holds: every must have met with evidence, the place
    // allows it, and the person has not asked to be left alone.
    const automatic =
      role.mode === 'automatic' &&
      person.evaluation?.meetsEveryMust === true &&
      activeCriteria(role.criteria).some((c) => c.kind === 'must') &&
      automaticAllowed(role.location) &&
      !(await this.store.isSuppressed(person.record))
    const now = this.now()
    const message: HiringMessageRow = {
      id: crypto.randomUUID(),
      roleId,
      personId,
      channel,
      sequence,
      body,
      status: automatic ? 'approved' : 'draft',
      approvedBy: automatic ? 'redrob:automatic' : null,
      note: null,
      sentAt: null,
      createdAt: now,
      updatedAt: now,
    }
    this.db.insert(hiringMessages).values(message).run()
    this.store.event(
      'drafted',
      automatic ? 'redrob:automatic' : 'recruiter',
      { sequence, channel },
      { roleId, personId },
    )
    if (automatic) {
      this.store.event(
        'approved',
        'redrob:automatic',
        { messageId: message.id },
        { roleId, personId },
      )
    }
    return { status: 'drafted', message }
  }

  /** The recruiter's edit of a draft; an approved message goes back to draft when its text changes. */
  edit(id: string, body: string): HiringMessageRow {
    const message = this.get(id)
    if (!message || !['draft', 'approved'].includes(message.status)) {
      throw new HiringInputError('no-message', 'no such message to edit')
    }
    return this.update(id, {
      body: body.trim(),
      status: 'draft',
      approvedBy: null,
    })
  }

  approve(ids: string[]): HiringMessageRow[] {
    const out: HiringMessageRow[] = []
    for (const id of ids) {
      const message = this.get(id)
      if (message?.status !== 'draft') continue
      out.push(
        this.update(id, {
          status: 'approved',
          approvedBy: 'recruiter',
          note: null,
        }),
      )
      this.store.event(
        'approved',
        'recruiter',
        { messageId: id },
        { roleId: message.roleId, personId: message.personId },
      )
    }
    return out
  }

  dontSend(id: string): HiringMessageRow {
    const message = this.get(id)
    if (!message || message.status === 'sent')
      throw new HiringInputError('no-message', 'no such message')
    this.store.event(
      'not-sent',
      'recruiter',
      { messageId: id },
      { roleId: message.roleId, personId: message.personId },
    )
    return this.update(id, { status: 'not-sent' })
  }

  /** Why this approved message may not go now, or null. */
  async refusal(
    message: HiringMessageRow,
  ): Promise<SendRefusal | 'not-approved' | 'set-aside' | null> {
    if (message.status !== 'approved') return 'not-approved'
    const { role, person } = this.person(message.roleId, message.personId)
    if (person.stage === 'set-aside') return 'set-aside'
    const replied = ['replied', 'interview', 'saved'].includes(person.stage)
    return canSend(
      {
        personId: message.personId,
        channel: message.channel,
        sequence: message.sequence,
        timeZone: timeZoneFor(
          [person.record.location, role.location],
          this.options.timeZone ??
            Intl.DateTimeFormat().resolvedOptions().timeZone,
        ),
      },
      this.history(),
      {
        optedOut: await this.store.isSuppressed(person.record),
        replied,
        channelOpen: siteById(message.channel as SiteId).send !== 'none',
      },
      this.options.limits ?? DEFAULT_LIMITS,
      this.now(),
    )
  }

  /**
   * Starts sending one approved message in the side-panel conversation `conversationId`. Returns the
   * instruction for the agent; the send guard holds it to this text and this person's site.
   */
  async start(
    id: string,
    conversationId: string,
  ): Promise<{ instruction: string }> {
    const message = this.get(id)
    if (!message) throw new HiringInputError('no-message', 'no such message')
    const refused = await this.refusal(message)
    if (refused) {
      this.update(id, { note: refused })
      throw new OutreachRefusedError(refused)
    }
    const { person } = this.person(message.roleId, message.personId)
    const site = siteById(message.channel as SiteId)
    const host = new URL(person.record.url).hostname.replace(
      /^([a-z]{2,3}|www)\./,
      '',
    )
    this.runs.set(conversationId, {
      messageId: id,
      body: message.body,
      host,
      sent: false,
      expiresAt: this.now() + RUN_TTL_MS,
    })
    this.update(id, { status: 'sending', note: null })
    const channel =
      site.send === 'inmail'
        ? 'InMail'
        : site.send === 'proposal'
          ? 'proposal (제안)'
          : 'message'
    return {
      instruction: [
        `Send this exact ${channel} to ${person.record.name} on ${site.name}: ${person.record.url}`,
        '',
        `Open their profile, use ${site.name}'s own ${channel} button, put in the text below exactly as written, press Send once, and stop. Then tell me it was sent.`,
        'Do not change the text, add to it, or send anything else to anyone. If the site asks me to sign in, shows a check, warns about limits, or asks to buy credits or upgrade, stop and tell me.',
        '',
        '<<<',
        message.body,
        '>>>',
      ].join('\n'),
    }
  }

  activeRun(conversationId: string | undefined): ActiveOutreachRun | null {
    if (!conversationId) return null
    const run = this.runs.get(conversationId)
    if (!run) return null
    if (run.expiresAt < this.now()) {
      this.runs.delete(conversationId)
      return null
    }
    return run
  }

  /** The send button was pressed in the run: the message is sent, and the person contacted. */
  markSent(conversationId: string): HiringMessageRow | null {
    const run = this.activeRun(conversationId)
    if (!run || run.sent) return null
    run.sent = true
    const message = this.get(run.messageId)
    if (!message) return null
    const sent = this.update(message.id, { status: 'sent', sentAt: this.now() })
    this.store.event(
      'contacted',
      message.approvedBy === 'redrob:automatic'
        ? 'redrob:automatic'
        : 'recruiter',
      {
        messageId: message.id,
        channel: message.channel,
        sequence: message.sequence,
        text: message.body,
      },
      { roleId: message.roleId, personId: message.personId },
    )
    const person = this.store
      .peopleOnRole(message.roleId)
      .find((p) => p.id === message.personId)
    if (person && ['found', 'shortlisted'].includes(person.stage)) {
      this.store.setStage(
        message.roleId,
        message.personId,
        'contacted',
        'recruiter',
      )
    }
    return sent
  }

  /** The run ended. A message that did not go is approved again, with "Needs you". */
  end(conversationId: string): HiringMessageRow | null {
    const run = this.runs.get(conversationId)
    if (!run) return null
    this.runs.delete(conversationId)
    const message = this.get(run.messageId)
    if (message?.status === 'sending')
      return this.update(message.id, { status: 'approved', note: 'needs-you' })
    return message
  }

  /**
   * A reply the recruiter recorded. An opt-out suppresses the person and stops everything to them;
   * any reply stops the follow-ups. The reply's text is classified here and is not stored.
   */
  async reply(
    roleId: string,
    personId: string,
    text: string,
  ): Promise<{ optedOut: boolean }> {
    this.person(roleId, personId)
    const optedOut = isOptOut(text)
    const pending = this.db
      .select({ id: hiringMessages.id })
      .from(hiringMessages)
      .where(
        and(
          eq(hiringMessages.personId, personId),
          inArray(hiringMessages.status, ['draft', 'approved', 'sending']),
        ),
      )
      .all()
    for (const { id } of pending)
      this.update(id, {
        status: 'stopped',
        note: optedOut ? 'opted-out' : 'replied',
      })
    if (optedOut) {
      await this.store.suppress(personId)
    } else {
      this.store.event('replied', 'recruiter', {}, { roleId, personId })
      this.store.setStage(roleId, personId, 'replied', 'recruiter')
    }
    return { optedOut }
  }
}
