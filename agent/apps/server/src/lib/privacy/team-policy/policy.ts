/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported unchanged in substance from redrob-cowork apps/server/src/team-policy/policy.ts: the browser and
 * Cowork verify the same signed file, and the shared vectors (tests/lib/privacy/fixtures/team-policy)
 * are the contract between them and the console.
 */

import { z } from 'zod'

/*
 * The team policy: one signed JSON document per console workspace ("account"), published by an
 * admin in the console. Everything the app trusts about a policy is in this payload, so the
 * schema is strict: an unknown field is refused rather than ignored, because a field this version
 * does not understand could be one it was meant to enforce.
 *
 * Mirrored by the console's policy API (redrob-console, feature/team-policy-api). The shared
 * vectors are the contract between the two.
 */

const TEAM_POLICY_SCHEMA_VERSION = 1

/** Generous bounds, there only so a policy cannot be used to exhaust memory or disk. */
const LIMITS = {
  idLength: 128,
  nameLength: 200,
  noteLength: 4_000,
  notes: 100,
  protectedNames: 1_000,
  aliasesPerName: 10,
  connectors: 100,
  playbooks: 100,
  playbookLength: 20_000,
  skills: 100,
  skillLength: 50_000,
} as const

const id = z.string().trim().min(1).max(LIMITS.idLength)
const label = z.string().trim().min(1).max(LIMITS.nameLength)

const privacyLevelSchema = z.enum(['off', 'standard', 'high', 'strict'])

const privacySchema = z
  .object({
    level: privacyLevelSchema,
    locked: z.boolean(),
    /** One entry per person or organisation: every form it appears in, e.g. ["김지원", "Jiwon Kim"]. */
    names: z
      .array(z.array(label).min(1).max(LIMITS.aliasesPerName))
      .max(LIMITS.protectedNames),
    /** What is kept as-is for the model to reason with. Read by the privacy gate (C4). */
    keep: z
      .object({
        amounts: z.boolean().optional(),
        dates: z.boolean().optional(),
      })
      .strict(),
    /** Transforms an admin can require. Read by the privacy gate (C4). */
    transforms: z
      .object({
        roundAmounts: z.boolean().optional(),
        shiftDates: z.boolean().optional(),
        titlesNearNames: z.boolean().optional(),
      })
      .strict(),
  })
  .strict()

const connectorSchema = z
  .object({
    name: label,
    type: z.enum(['remote', 'local']),
    /** Remote connectors are allowed by URL; an entry without one allows the name only. */
    url: z.string().url().max(2_000).optional(),
  })
  .strict()

const playbookSchema = z
  .object({
    name: label,
    description: z.string().max(LIMITS.nameLength).optional(),
    template: z.string().min(1).max(LIMITS.playbookLength),
  })
  .strict()

const skillSchema = z
  .object({
    name: label,
    description: z.string().max(LIMITS.nameLength).optional(),
    content: z.string().min(1).max(LIMITS.skillLength),
  })
  .strict()

export const teamPolicySchema = z
  .object({
    v: z.literal(TEAM_POLICY_SCHEMA_VERSION),
    accountId: id,
    /** Only ever goes up. The app ignores a policy that is not newer than the one it applied. */
    version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    issuedAt: z.string().datetime({ offset: true }),
    /** Taken from the publisher's console session, not typed. */
    setBy: z
      .object({
        userId: id,
        name: label,
        role: z.enum(['admin', 'developer', 'viewer']),
      })
      .strict(),
    privacy: privacySchema,
    notes: z
      .array(
        z
          .object({ id, text: z.string().trim().min(1).max(LIMITS.noteLength) })
          .strict(),
      )
      .max(LIMITS.notes),
    connectors: z
      .object({
        allow: z.array(connectorSchema).max(LIMITS.connectors),
        allowLocalPrograms: z.boolean(),
      })
      .strict(),
    playbooks: z.array(playbookSchema).max(LIMITS.playbooks),
    skills: z.array(skillSchema).max(LIMITS.skills),
  })
  .strict()

export type TeamPolicy = z.infer<typeof teamPolicySchema>
