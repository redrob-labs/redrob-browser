/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Talent Scout's records, on this device only (Recruit plan §4.6). Candidate data never syncs
 * through Redrob: the team's system of record is its ATS.
 *
 *   hiring_roles         a job being filled, with its criteria (versioned) and how Redrob works on it
 *   hiring_people        one person, across sites and roles; only what criteria can use
 *   hiring_role_people   a person on a role: stage, and the latest evaluation
 *   hiring_events        the hiring record, append-only: every selection step, and who did it
 *   hiring_suppressions  salted hashes of people who asked not to be contacted, kept after deletion
 *
 * No photos and no CV files are stored. A person with no activity for 180 days is deleted, except
 * their suppression hashes.
 */

import type { Candidate } from '@browseros/hiring/candidate'
import type { CriteriaSet } from '@browseros/hiring/criteria'
import type { Evaluation } from '@browseros/hiring/evaluate'
import type { InferSelectModel } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

export const HIRING_MODES = ['review', 'batch', 'automatic'] as const
export const HIRING_STAGES = [
  'found',
  'shortlisted',
  'contacted',
  'replied',
  'interview',
  'saved',
  'set-aside',
] as const

export const hiringRoles = sqliteTable('hiring_roles', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  location: text('location'),
  /** The job description the recruiter pasted, the source criteria are proposed from. */
  description: text('description'),
  criteria: text('criteria', { mode: 'json' }).$type<CriteriaSet>().notNull(),
  mode: text('mode', { enum: HIRING_MODES }).notNull().default('review'),
  /** Sites this role is sourced from. */
  sites: text('sites', { mode: 'json' }).$type<string[]>().notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const hiringPeople = sqliteTable(
  'hiring_people',
  {
    id: text('id').primaryKey(),
    /** The person as read, protected fields already dropped. */
    record: text('record', { mode: 'json' }).$type<Candidate>().notNull(),
    /** Exact de-duplication keys (`url:…`, `email:…`, `ats:…`), space-separated. */
    keys: text('keys').notNull(),
    /** Sites the person was read on. */
    sites: text('sites', { mode: 'json' }).$type<string[]>().notNull(),
    /** Whether a model read the page because no extractor could (the receipt says so). */
    readByModel: integer('read_by_model', { mode: 'boolean' })
      .notNull()
      .default(false),
    lastActivityAt: integer('last_activity_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('hiring_people_last_activity_idx').on(table.lastActivityAt),
  ],
)

export const hiringRolePeople = sqliteTable(
  'hiring_role_people',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => hiringRoles.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => hiringPeople.id, { onDelete: 'cascade' }),
    stage: text('stage', { enum: HIRING_STAGES }).notNull().default('found'),
    /** The recruiter's reason, from a short neutral list, when they set someone aside. */
    reason: text('reason'),
    evaluation: text('evaluation', { mode: 'json' }).$type<Evaluation>(),
    foundAt: integer('found_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.personId] }),
    index('hiring_role_people_stage_idx').on(table.roleId, table.stage),
  ],
)

export const hiringEvents = sqliteTable(
  'hiring_events',
  {
    id: text('id').primaryKey(),
    /** No foreign keys: the record outlives the role and the person it is about. */
    roleId: text('role_id'),
    personId: text('person_id'),
    kind: text('kind').notNull(),
    /** Who did it: the recruiter, or Redrob in a named mode. */
    actor: text('actor').notNull(),
    detail: text('detail', { mode: 'json' }).$type<Record<string, unknown>>(),
    at: integer('at').notNull(),
  },
  (table) => [index('hiring_events_role_at_idx').on(table.roleId, table.at)],
)

export const hiringSuppressions = sqliteTable('hiring_suppressions', {
  hash: text('hash').primaryKey(),
  at: integer('at').notNull(),
})

export type HiringRoleRow = InferSelectModel<typeof hiringRoles>
export type HiringPersonRow = InferSelectModel<typeof hiringPeople>
export type HiringRolePersonRow = InferSelectModel<typeof hiringRolePeople>
export type HiringEventRow = InferSelectModel<typeof hiringEvents>

export const HIRING_MESSAGE_STATUSES = [
  /** Written, waiting for the recruiter. */
  'draft',
  /** Approved: by the recruiter, or by Redrob in Automatic for someone who meets every must have. */
  'approved',
  /** In a side-panel run now. */
  'sending',
  'sent',
  /** The recruiter chose not to send it. */
  'not-sent',
  /** Stopped by a reply or an opt-out. */
  'stopped',
] as const

/** Messages to send and sent (Recruit plan §3.2 "Messages", §4.3). The exact text is the receipt. */
export const hiringMessages = sqliteTable(
  'hiring_messages',
  {
    id: text('id').primaryKey(),
    roleId: text('role_id')
      .notNull()
      .references(() => hiringRoles.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => hiringPeople.id, { onDelete: 'cascade' }),
    /** The site's id, whose own channel carries it. */
    channel: text('channel').notNull(),
    /** For email: the address the person published or applied with. Nothing else is ever written to. */
    recipient: text('recipient'),
    /** For email: which of the recruiter's connected mailboxes sends it. */
    connector: text('connector'),
    /** 0 for the first message, then 1 and 2 for follow-ups. */
    sequence: integer('sequence').notNull().default(0),
    body: text('body').notNull(),
    status: text('status', { enum: HIRING_MESSAGE_STATUSES })
      .notNull()
      .default('draft'),
    approvedBy: text('approved_by'),
    /** Why it could not go, in a code the panel words: a limit, quiet hours, a stop. */
    note: text('note'),
    sentAt: integer('sent_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('hiring_messages_status_idx').on(table.status),
    index('hiring_messages_person_idx').on(table.personId),
  ],
)

export type HiringMessageRow = InferSelectModel<typeof hiringMessages>

export const HIRING_INTERVIEW_STATUSES = [
  /** Reading the recruiter's calendar in a side-panel run. */
  'reading',
  /** Times found, waiting for the recruiter to send them. */
  'offered',
  /** The candidate picked one; waiting for the recruiter to book it. */
  'chosen',
  'booking',
  'booked',
  'cancelled',
  /** The calendar could not be read: the recruiter picks times. */
  'needs-you',
] as const

/** Interviews being arranged (Recruit plan §4.5). Never recorded or analysed: a time, nothing more. */
export const hiringInterviews = sqliteTable(
  'hiring_interviews',
  {
    id: text('id').primaryKey(),
    roleId: text('role_id')
      .notNull()
      .references(() => hiringRoles.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => hiringPeople.id, { onDelete: 'cascade' }),
    /** Google Calendar or Outlook Calendar. */
    connector: text('connector').notNull(),
    lengthMinutes: integer('length_minutes').notNull(),
    status: text('status', { enum: HIRING_INTERVIEW_STATUSES }).notNull(),
    slots: text('slots', { mode: 'json' })
      .$type<Array<{ start: number; end: number }>>()
      .notNull(),
    chosen: integer('chosen'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('hiring_interviews_role_idx').on(table.roleId)],
)

export type HiringInterviewRow = InferSelectModel<typeof hiringInterviews>
