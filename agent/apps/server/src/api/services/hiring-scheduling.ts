/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Talent Scout's interview scheduling (Recruit plan §4.5), in two side-panel runs, each under the
 * connector guard:
 *
 *   read   the agent reads the recruiter's free and busy times from their Google or Outlook Calendar
 *          and changes nothing. The server reads the busy times out of what the connector returned
 *          and proposes three free slots inside the interview hours (10:00 to 17:00, 30 minutes).
 *          The times go to the candidate as an ordinary message, through the Messages queue.
 *   book   once the candidate picked one, the agent creates exactly that one event, with the
 *          candidate as the only guest, and the person moves to Interview.
 *
 * Interviews are never recorded, transcribed or scored.
 */

import {
  chosenSlot,
  DEFAULT_HOURS,
  type Interval,
  type InterviewHours,
  mergeIntervals,
  parseBusy,
  proposeSlots,
} from '@browseros/hiring/schedule'
import { and, desc, eq } from 'drizzle-orm'
import {
  type HiringInterviewRow,
  hiringInterviews,
} from '../../lib/db/schema/hiring'
import { HiringInputError, type HiringStore } from '../../lib/hiring/store'

export const CALENDAR_CONNECTORS = [
  'Google Calendar',
  'Outlook Calendar',
] as const
export type CalendarConnector = (typeof CALENDAR_CONNECTORS)[number]

const RUN_TTL_MS = 20 * 60_000

export interface CalendarRun {
  kind: 'read' | 'book'
  interviewId: string
  connector: CalendarConnector
  /** For a booking: the one slot, and the only guest. */
  slot?: Interval
  guest?: string
  busy: Interval[]
  done: boolean
  expiresAt: number
}

/** A calendar action that changes something. Only a booking run may create, and only one event. */
const CHANGES =
  /(create|insert|add|update|patch|delete|remove|move|cancel|send|respond|accept|decline)/i
const CREATES =
  /(create|insert|add)_?\w*event|event\w*_?(create|insert|add)|(create|insert)$/i

function isoMinute(at: number): string {
  return new Date(at).toISOString().slice(0, 16)
}

/** Every instant written in the args, to the minute, in UTC. */
function instantsIn(args: unknown): Set<string> {
  const out = new Set<string>()
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          visit(JSON.parse(trimmed))
          return
        } catch {}
      }
      const t = Date.parse(value)
      if (!Number.isNaN(t) && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value))
        out.add(isoMinute(t))
    } else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object')
      Object.values(value).forEach(visit)
  }
  visit(args)
  return out
}

function emailsIn(args: unknown): Set<string> {
  return new Set(
    (
      JSON.stringify(args).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ??
      []
    ).map((e) => e.toLowerCase()),
  )
}

export class HiringScheduling {
  private readonly runs = new Map<string, CalendarRun>()

  constructor(
    private readonly store: HiringStore,
    private readonly options: {
      now?: () => number
      timeZone?: string
      hours?: InterviewHours
    } = {},
  ) {}

  private now(): number {
    return (this.options.now ?? Date.now)()
  }

  private zone(): string {
    return (
      this.options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    )
  }

  private get db() {
    return this.store.db
  }

  get(id: string): HiringInterviewRow | null {
    return (
      this.db
        .select()
        .from(hiringInterviews)
        .where(eq(hiringInterviews.id, id))
        .get() ?? null
    )
  }

  /** Every interview not finished, across roles: what the side panel offers to continue. */
  open(): HiringInterviewRow[] {
    return this.db
      .select()
      .from(hiringInterviews)
      .orderBy(desc(hiringInterviews.updatedAt))
      .all()
      .filter((i) => !['booked', 'cancelled'].includes(i.status))
  }

  list(roleId: string): HiringInterviewRow[] {
    return this.db
      .select()
      .from(hiringInterviews)
      .where(eq(hiringInterviews.roleId, roleId))
      .orderBy(desc(hiringInterviews.updatedAt))
      .all()
  }

  private update(
    id: string,
    patch: Partial<HiringInterviewRow>,
  ): HiringInterviewRow {
    this.db
      .update(hiringInterviews)
      .set({ ...patch, updatedAt: this.now() })
      .where(eq(hiringInterviews.id, id))
      .run()
    return this.get(id) as HiringInterviewRow
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

  /** Starts reading the calendar in `conversationId`. Returns the instruction for the agent. */
  startRead(
    roleId: string,
    personId: string,
    input: {
      connector: CalendarConnector
      conversationId: string
      lengthMinutes?: number
    },
  ): { interview: HiringInterviewRow; instruction: string } {
    const { person } = this.person(roleId, personId)
    if (person.stage === 'set-aside')
      throw new HiringInputError('set-aside', 'this person is set aside')
    if (!CALENDAR_CONNECTORS.includes(input.connector))
      throw new HiringInputError('no-calendar', 'unknown calendar')
    const existing = this.db
      .select()
      .from(hiringInterviews)
      .where(
        and(
          eq(hiringInterviews.roleId, roleId),
          eq(hiringInterviews.personId, personId),
        ),
      )
      .all()
      .find((i) => !['booked', 'cancelled'].includes(i.status))
    const now = this.now()
    const interview: HiringInterviewRow = existing
      ? this.update(existing.id, {
          status: 'reading',
          connector: input.connector,
          slots: [],
          chosen: null,
        })
      : {
          id: crypto.randomUUID(),
          roleId,
          personId,
          connector: input.connector,
          lengthMinutes:
            input.lengthMinutes ?? (this.options.hours ?? DEFAULT_HOURS).length,
          status: 'reading',
          slots: [],
          chosen: null,
          createdAt: now,
          updatedAt: now,
        }
    if (!existing) this.db.insert(hiringInterviews).values(interview).run()
    this.runs.set(input.conversationId, {
      kind: 'read',
      interviewId: interview.id,
      connector: input.connector,
      busy: [],
      done: false,
      expiresAt: now + RUN_TTL_MS,
    })
    const from = new Date(now).toISOString()
    const to = new Date(now + 14 * 86_400_000).toISOString()
    return {
      interview,
      instruction: [
        `Using my ${input.connector} connector, read when I am busy from ${from} to ${to} (a free/busy query, or my events in that range).`,
        'Do not create, change, accept or decline anything. When you have read it, stop and say it is done.',
        `If ${input.connector} is not connected, stop and tell me. Do not use the browser for this.`,
      ].join('\n'),
    }
  }

  activeRun(conversationId: string | undefined): CalendarRun | null {
    if (!conversationId) return null
    const run = this.runs.get(conversationId)
    if (!run) return null
    if (run.expiresAt < this.now()) {
      this.runs.delete(conversationId)
      return null
    }
    return run
  }

  /** The connector guard's verdict on one call in a calendar run, or undefined to allow it. */
  authorize(
    run: CalendarRun,
    toolName: string,
    args: Record<string, unknown>,
  ): string | undefined {
    if (toolName !== 'execute_action') return undefined
    if (String(args.server_name ?? '') !== run.connector) {
      return `execute_action: only ${run.connector} is used for this.`
    }
    const action = `${String(args.category_name ?? '')} ${String(args.action_name ?? '')}`
    if (run.kind === 'read') {
      return CHANGES.test(action)
        ? 'execute_action: reading the calendar only; nothing may be created or changed.'
        : undefined
    }
    if (!CHANGES.test(action)) return undefined
    if (run.done) return 'execute_action: the interview is already booked.'
    if (!CREATES.test(action.trim()))
      return 'execute_action: only creating the one interview event is allowed.'
    const slot = run.slot as Interval
    const instants = instantsIn(args)
    if (
      !instants.has(isoMinute(slot.start)) ||
      !instants.has(isoMinute(slot.end))
    ) {
      return `execute_action: the event must start ${new Date(slot.start).toISOString()} and end ${new Date(slot.end).toISOString()}.`
    }
    const guests = [...emailsIn(args)]
    if (run.guest && guests.some((g) => g !== run.guest)) {
      return `execute_action: ${run.guest} is the only guest.`
    }
    return undefined
  }

  /** A connector call returned: busy times are kept from a read; a create books the interview. */
  after(
    conversationId: string,
    run: CalendarRun,
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
  ): void {
    if (toolName !== 'execute_action') return
    if (run.kind === 'read') {
      run.busy = mergeIntervals([...run.busy, ...parseBusy(result)])
      run.done = true
      return
    }
    const action = `${String(args.category_name ?? '')} ${String(args.action_name ?? '')}`
    if (
      run.done ||
      !CREATES.test(action.trim()) ||
      this.authorize(run, toolName, args)
    )
      return
    run.done = true
    const interview = this.update(run.interviewId, { status: 'booked' })
    this.store.event(
      'interview-booked',
      'recruiter',
      {
        connector: run.connector,
        start: run.slot?.start,
        minutes: interview.lengthMinutes,
      },
      { roleId: interview.roleId, personId: interview.personId },
    )
    this.store.setStage(
      interview.roleId,
      interview.personId,
      'interview',
      'recruiter',
    )
    this.runs.delete(conversationId)
  }

  /**
   * The run ended. After a read: three slots, or "Needs you" when nothing came back from the calendar.
   * After a booking that did not happen: back to "chosen".
   */
  end(conversationId: string): HiringInterviewRow | null {
    const run = this.runs.get(conversationId)
    if (!run) return null
    this.runs.delete(conversationId)
    if (run.kind === 'book') {
      const interview = this.get(run.interviewId)
      return interview?.status === 'booking'
        ? this.update(run.interviewId, { status: 'chosen' })
        : interview
    }
    if (!run.done) return this.update(run.interviewId, { status: 'needs-you' })
    const interview = this.get(run.interviewId) as HiringInterviewRow
    const slots = proposeSlots(run.busy, this.now(), this.zone(), {
      ...(this.options.hours ?? DEFAULT_HOURS),
      length: interview.lengthMinutes,
    })
    if (!slots.length)
      return this.update(run.interviewId, { status: 'needs-you' })
    this.store.event(
      'times-found',
      'recruiter',
      { count: slots.length },
      { roleId: interview.roleId, personId: interview.personId },
    )
    return this.update(run.interviewId, { status: 'offered', slots })
  }

  /** The candidate's pick: by index, or read from their reply. Null when the reply is not clear. */
  choose(
    id: string,
    input: { index?: number; reply?: string },
    timeZone: string,
  ): HiringInterviewRow | null {
    const interview = this.get(id)
    if (!interview || !['offered', 'chosen'].includes(interview.status)) {
      throw new HiringInputError(
        'no-interview',
        'no interview waiting for a choice',
      )
    }
    const index =
      input.index ??
      (input.reply ? chosenSlot(input.reply, interview.slots, timeZone) : null)
    if (index === null || index === undefined || !interview.slots[index])
      return null
    return this.update(id, { status: 'chosen', chosen: index })
  }

  /** Starts booking the chosen slot in `conversationId`. */
  startBook(id: string, conversationId: string): { instruction: string } {
    const interview = this.get(id)
    if (interview?.status !== 'chosen' || interview.chosen === null) {
      throw new HiringInputError('not-chosen', 'no time is chosen yet')
    }
    const { role, person } = this.person(interview.roleId, interview.personId)
    const slot = interview.slots[interview.chosen] as Interval
    const guest = person.record.contact
      .find((c) => c.kind === 'email' && c.value)
      ?.value?.toLowerCase()
    this.runs.set(conversationId, {
      kind: 'book',
      interviewId: id,
      connector: interview.connector as CalendarConnector,
      slot,
      guest,
      busy: [],
      done: false,
      expiresAt: this.now() + RUN_TTL_MS,
    })
    this.update(id, { status: 'booking' })
    return {
      instruction: [
        `Using my ${interview.connector} connector, create one event: "${role.title} interview: ${person.record.name}", from ${new Date(slot.start).toISOString()} to ${new Date(slot.end).toISOString()}.`,
        guest
          ? `Invite ${guest} as the only guest, so the invitation comes from my calendar.`
          : 'Add no guests: I will send the invitation myself.',
        'Create nothing else and change nothing else. Then stop and say it is booked. Do not use the browser for this.',
      ].join('\n'),
    }
  }

  cancel(id: string): HiringInterviewRow {
    const interview = this.get(id)
    if (!interview)
      throw new HiringInputError('no-interview', 'no such interview')
    return this.update(id, { status: 'cancelled' })
  }
}
