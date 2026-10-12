/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Talent Scout's records on this device (Recruit plan §4.6): roles, people, their place on each role,
 * the hiring record and the suppression list. Every selection step is an event, with who did it, so
 * the record can be exported for an employer's bias audit without Redrob ever holding demographics.
 */

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { type Candidate, normaliseCandidate } from '@browseros/hiring/candidate'
import {
  type CriteriaSet,
  type Criterion,
  deviceCheckFor,
  type Refusal,
  revise,
} from '@browseros/hiring/criteria'
import { compareForList, type Evaluation } from '@browseros/hiring/evaluate'
import {
  isSuppressed,
  personKeys,
  suppressionHashes,
} from '@browseros/hiring/people'
import { and, asc, eq, inArray, lt } from 'drizzle-orm'
import { getBrowserosDir } from '../browseros-dir'
import type { BrowserOsDatabase } from '../db/client'
import {
  type HIRING_STAGES,
  type HiringEventRow,
  type HiringRoleRow,
  hiringEvents,
  hiringPeople,
  hiringRolePeople,
  hiringRoles,
  hiringSuppressions,
} from '../db/schema/hiring'

export type HiringStage = (typeof HIRING_STAGES)[number]
export type HiringMode = HiringRoleRow['mode']

/** 180 days without activity, then deleted, except the suppression hashes (plan §4.6). */
export const RETENTION_MS = 180 * 86_400_000

/** The neutral reasons a recruiter picks from when setting someone aside (plan §3.2). */
export const SET_ASIDE_REASONS = [
  'doesnt-meet-must-have',
  'not-looking',
  'contacted-elsewhere',
  'other',
] as const
export type SetAsideReason = (typeof SET_ASIDE_REASONS)[number]

/** Who did a step: the recruiter, or Redrob in the role's mode. */
export type Actor = 'recruiter' | `redrob:${HiringMode}`

export interface RoleInput {
  title: string
  location?: string
  description?: string
  criteria: Array<Omit<Criterion, 'id' | 'check'> & { id?: string }>
  mode?: HiringMode
  sites?: string[]
}

export interface PersonOnRole {
  id: string
  record: Candidate
  sites: string[]
  readByModel: boolean
  stage: HiringStage
  reason?: string | null
  evaluation?: Evaluation | null
  foundAt: number
}

export class HiringInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const shortId = () => crypto.randomUUID()

/** Gives each criterion an id and, where the wording is plain enough, the device check it means. */
function withChecks(items: RoleInput['criteria']): Criterion[] {
  return items.map((c) => ({
    ...c,
    id: c.id ?? shortId().slice(0, 8),
    text: c.text.trim(),
    check: deviceCheckFor(c.text),
  }))
}

export class HiringStore {
  private saltValue: string | null = null

  constructor(
    /** The database, or how to get it: the server opens it after the routes are built. */
    private readonly source: BrowserOsDatabase | (() => BrowserOsDatabase),
    private readonly options: {
      now?: () => number
      saltPath?: string
    } = {},
  ) {}

  private get db(): BrowserOsDatabase {
    return typeof this.source === 'function' ? this.source() : this.source
  }

  private now(): number {
    return (this.options.now ?? Date.now)()
  }

  /** The suppression salt: random per device, never sent anywhere. */
  async salt(): Promise<string> {
    if (this.saltValue) return this.saltValue
    const path = this.options.saltPath ?? join(getBrowserosDir(), 'hiring-salt')
    try {
      this.saltValue = readFileSync(path, 'utf8').trim()
    } catch {
      this.saltValue = randomBytes(32).toString('hex')
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, this.saltValue, { encoding: 'utf8', mode: 0o600 })
    }
    return this.saltValue
  }

  private event(
    kind: string,
    actor: Actor,
    detail: Record<string, unknown> = {},
    ids: { roleId?: string; personId?: string } = {},
  ) {
    this.db
      .insert(hiringEvents)
      .values({
        id: shortId(),
        roleId: ids.roleId ?? null,
        personId: ids.personId ?? null,
        kind,
        actor,
        detail,
        at: this.now(),
      })
      .run()
  }

  // Roles ---------------------------------------------------------------------------------------

  listRoles(): HiringRoleRow[] {
    return this.db
      .select()
      .from(hiringRoles)
      .orderBy(asc(hiringRoles.createdAt))
      .all()
  }

  getRole(id: string): HiringRoleRow | null {
    return (
      this.db.select().from(hiringRoles).where(eq(hiringRoles.id, id)).get() ??
      null
    )
  }

  createRole(input: RoleInput): {
    role: HiringRoleRow
    refused: Array<{ text: string; reason: Refusal }>
  } {
    const { set, refused } = revise(
      { version: 0, items: [] },
      withChecks(input.criteria),
    )
    const now = this.now()
    const role: HiringRoleRow = {
      id: shortId(),
      title: input.title.trim(),
      location: input.location?.trim() || null,
      description: input.description ?? null,
      criteria: set,
      mode: input.mode ?? 'review',
      sites: input.sites ?? [],
      createdAt: now,
      updatedAt: now,
    }
    this.db.insert(hiringRoles).values(role).run()
    this.event(
      'role-created',
      'recruiter',
      { title: role.title, criteriaVersion: set.version },
      { roleId: role.id },
    )
    return {
      role,
      refused: refused.map((r) => ({
        text: r.criterion.text,
        reason: r.reason,
      })),
    }
  }

  /** A new criteria version. Refused wording is left out and reported; the record keeps the change. */
  reviseCriteria(
    roleId: string,
    items: RoleInput['criteria'],
  ): {
    criteria: CriteriaSet
    refused: Array<{ text: string; reason: Refusal }>
  } {
    const role = this.getRole(roleId)
    if (!role) throw new HiringInputError('no-role', 'no such role')
    const { set, refused } = revise(role.criteria, withChecks(items))
    this.db
      .update(hiringRoles)
      .set({ criteria: set, updatedAt: this.now() })
      .where(eq(hiringRoles.id, roleId))
      .run()
    this.event(
      'criteria-changed',
      'recruiter',
      {
        version: set.version,
        criteria: set.items.map((c) => ({
          text: c.text,
          kind: c.kind,
          inferred: c.inferred,
          confirmed: c.confirmed,
        })),
      },
      { roleId },
    )
    return {
      criteria: set,
      refused: refused.map((r) => ({
        text: r.criterion.text,
        reason: r.reason,
      })),
    }
  }

  updateRole(
    roleId: string,
    patch: {
      title?: string
      location?: string | null
      mode?: HiringMode
      sites?: string[]
    },
  ): HiringRoleRow {
    const role = this.getRole(roleId)
    if (!role) throw new HiringInputError('no-role', 'no such role')
    this.db
      .update(hiringRoles)
      .set({ ...patch, updatedAt: this.now() })
      .where(eq(hiringRoles.id, roleId))
      .run()
    if (patch.mode && patch.mode !== role.mode) {
      this.event(
        'mode-changed',
        'recruiter',
        { from: role.mode, to: patch.mode },
        { roleId },
      )
    }
    return this.getRole(roleId) as HiringRoleRow
  }

  /** Deletes the role and the people who are on no other role. */
  deleteRole(roleId: string): void {
    const people = this.db
      .select({ personId: hiringRolePeople.personId })
      .from(hiringRolePeople)
      .where(eq(hiringRolePeople.roleId, roleId))
      .all()
      .map((r) => r.personId)
    this.db.delete(hiringRoles).where(eq(hiringRoles.id, roleId)).run()
    for (const personId of people) {
      const elsewhere = this.db
        .select({ roleId: hiringRolePeople.roleId })
        .from(hiringRolePeople)
        .where(eq(hiringRolePeople.personId, personId))
        .get()
      if (!elsewhere) this.deletePerson(personId)
    }
    this.event('role-deleted', 'recruiter', {}, { roleId })
  }

  // People --------------------------------------------------------------------------------------

  private findByKeys(keys: string[]) {
    // Keys are few per person and a device holds hundreds of people: a scan is fine and exact.
    const all = this.db.select().from(hiringPeople).all()
    return (
      all.find((p) => p.keys.split(' ').some((k) => keys.includes(k))) ?? null
    )
  }

  /**
   * Adds or updates a person read from a page, and puts them on the role. A person who asked not to
   * be contacted is still never written to; they can be found, and the queue refuses them (5.6).
   */
  async upsertPerson(
    roleId: string,
    candidate: Candidate,
    options: { readByModel?: boolean; actor?: Actor } = {},
  ): Promise<{ personId: string; isNew: boolean; suppressed: boolean }> {
    const role = this.getRole(roleId)
    if (!role) throw new HiringInputError('no-role', 'no such role')
    const record = normaliseCandidate(candidate)
    const keys = personKeys(record)
    const now = this.now()
    const existing = this.findByKeys(keys)
    let personId: string
    let isNew = false
    if (existing) {
      personId = existing.id
      const merged = new Set([...existing.keys.split(' '), ...keys])
      this.db
        .update(hiringPeople)
        .set({
          // The newest read wins: it is what the person shows today.
          record,
          keys: [...merged].join(' '),
          sites: [...new Set([...existing.sites, record.site])],
          readByModel: existing.readByModel || Boolean(options.readByModel),
          lastActivityAt: now,
        })
        .where(eq(hiringPeople.id, personId))
        .run()
    } else {
      personId = shortId()
      isNew = true
      this.db
        .insert(hiringPeople)
        .values({
          id: personId,
          record,
          keys: keys.join(' '),
          sites: [record.site],
          readByModel: Boolean(options.readByModel),
          lastActivityAt: now,
          createdAt: now,
        })
        .run()
    }
    const onRole = this.db
      .select()
      .from(hiringRolePeople)
      .where(
        and(
          eq(hiringRolePeople.roleId, roleId),
          eq(hiringRolePeople.personId, personId),
        ),
      )
      .get()
    if (!onRole) {
      this.db
        .insert(hiringRolePeople)
        .values({
          roleId,
          personId,
          stage: 'found',
          foundAt: now,
          updatedAt: now,
        })
        .run()
      this.event(
        'found',
        options.actor ?? 'recruiter',
        { site: record.site, readByModel: Boolean(options.readByModel) },
        { roleId, personId },
      )
    }
    const suppressed = isSuppressed(
      record,
      await this.salt(),
      this.suppressedHashes(),
    )
    return { personId, isNew, suppressed }
  }

  setEvaluation(
    roleId: string,
    personId: string,
    evaluation: Evaluation,
    actor: Actor = 'recruiter',
  ): void {
    this.db
      .update(hiringRolePeople)
      .set({ evaluation, updatedAt: this.now() })
      .where(
        and(
          eq(hiringRolePeople.roleId, roleId),
          eq(hiringRolePeople.personId, personId),
        ),
      )
      .run()
    this.event(
      'evaluated',
      actor,
      {
        criteriaVersion: evaluation.criteriaVersion,
        states: Object.fromEntries(
          evaluation.results.map((r) => [r.criterionId, r.state]),
        ),
        met: evaluation.met,
        judged: evaluation.judged,
      },
      { roleId, personId },
    )
  }

  /**
   * Moves a person on a role. Setting aside is the recruiter's act only, with a reason; Redrob in any
   * mode can never do it (plan §3.3, "no rejections").
   */
  setStage(
    roleId: string,
    personId: string,
    stage: HiringStage,
    actor: Actor,
    reason?: SetAsideReason,
  ): void {
    if (stage === 'set-aside') {
      if (actor !== 'recruiter') {
        throw new HiringInputError(
          'recruiter-only',
          'only the recruiter sets someone aside',
        )
      }
      if (!reason)
        throw new HiringInputError(
          'reason-needed',
          'a reason is needed to set someone aside',
        )
    }
    const row = this.db
      .select()
      .from(hiringRolePeople)
      .where(
        and(
          eq(hiringRolePeople.roleId, roleId),
          eq(hiringRolePeople.personId, personId),
        ),
      )
      .get()
    if (!row)
      throw new HiringInputError('no-person', 'this person is not on the role')
    this.db
      .update(hiringRolePeople)
      .set({
        stage,
        reason: stage === 'set-aside' ? reason : null,
        updatedAt: this.now(),
      })
      .where(
        and(
          eq(hiringRolePeople.roleId, roleId),
          eq(hiringRolePeople.personId, personId),
        ),
      )
      .run()
    this.db
      .update(hiringPeople)
      .set({ lastActivityAt: this.now() })
      .where(eq(hiringPeople.id, personId))
      .run()
    this.event(
      stage === 'set-aside' ? 'set-aside' : 'stage',
      actor,
      { from: row.stage, to: stage, ...(reason ? { reason } : {}) },
      { roleId, personId },
    )
  }

  /** The People list: must haves met with evidence, then newest. No score. */
  peopleOnRole(roleId: string): PersonOnRole[] {
    const role = this.getRole(roleId)
    if (!role) return []
    const rows = this.db
      .select()
      .from(hiringRolePeople)
      .innerJoin(hiringPeople, eq(hiringRolePeople.personId, hiringPeople.id))
      .where(eq(hiringRolePeople.roleId, roleId))
      .all()
    const empty: Evaluation = {
      criteriaVersion: 0,
      results: [],
      met: 0,
      judged: 0,
      meetsEveryMust: false,
      suggestsSetAside: false,
    }
    return rows
      .map((r) => ({
        id: r.hiring_people.id,
        record: r.hiring_people.record,
        sites: r.hiring_people.sites,
        readByModel: r.hiring_people.readByModel,
        stage: r.hiring_role_people.stage,
        reason: r.hiring_role_people.reason,
        evaluation: r.hiring_role_people.evaluation,
        foundAt: r.hiring_role_people.foundAt,
      }))
      .sort((a, b) =>
        compareForList(
          {
            evaluation: a.evaluation ?? empty,
            foundAt: a.foundAt,
            criteria: role.criteria.items,
          },
          {
            evaluation: b.evaluation ?? empty,
            foundAt: b.foundAt,
            criteria: role.criteria.items,
          },
        ),
      )
  }

  /** Removes a person everywhere on this device at once. The record keeps that it happened, not who. */
  deletePerson(personId: string, actor: Actor = 'recruiter'): void {
    this.db.delete(hiringPeople).where(eq(hiringPeople.id, personId)).run()
    // Earlier events keep the id but no details; the person's data is gone.
    this.event('person-deleted', actor, {})
  }

  // Suppression ---------------------------------------------------------------------------------

  private suppressedHashes(): Set<string> {
    return new Set(
      this.db
        .select({ hash: hiringSuppressions.hash })
        .from(hiringSuppressions)
        .all()
        .map((r) => r.hash),
    )
  }

  /** The person asked not to be contacted: never written to again, kept as hashes after deletion. */
  async suppress(personId: string, actor: Actor = 'recruiter'): Promise<void> {
    const person = this.db
      .select()
      .from(hiringPeople)
      .where(eq(hiringPeople.id, personId))
      .get()
    if (!person) throw new HiringInputError('no-person', 'no such person')
    const salt = await this.salt()
    for (const hash of suppressionHashes(person.record, salt)) {
      this.db
        .insert(hiringSuppressions)
        .values({ hash, at: this.now() })
        .onConflictDoNothing()
        .run()
    }
    this.event('opted-out', actor, {}, { personId })
  }

  async isSuppressed(candidate: Candidate): Promise<boolean> {
    return isSuppressed(candidate, await this.salt(), this.suppressedHashes())
  }

  // Retention and the record --------------------------------------------------------------------

  /** Deletes people with no activity for 180 days. Returns how many. */
  purgeInactive(): number {
    const cutoff = this.now() - RETENTION_MS
    const stale = this.db
      .select({ id: hiringPeople.id })
      .from(hiringPeople)
      .where(lt(hiringPeople.lastActivityAt, cutoff))
      .all()
    if (!stale.length) return 0
    this.db
      .delete(hiringPeople)
      .where(
        inArray(
          hiringPeople.id,
          stale.map((s) => s.id),
        ),
      )
      .run()
    this.event('retention', 'redrob:automatic', { deleted: stale.length })
    return stale.length
  }

  record(roleId?: string): HiringEventRow[] {
    const query = this.db.select().from(hiringEvents)
    return (roleId ? query.where(eq(hiringEvents.roleId, roleId)) : query)
      .orderBy(asc(hiringEvents.at))
      .all()
  }
}
