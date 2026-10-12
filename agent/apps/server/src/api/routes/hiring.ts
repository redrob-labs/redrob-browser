/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Talent Scout's routes. Only the extension may call them (requireTrustedAppOrigin): they carry other
 * people's details.
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { HIRING_MODES, HIRING_STAGES } from '../../lib/db/schema/hiring'
import {
  type HiringPolicySource,
  hiringPolicyStatus,
} from '../../lib/hiring/policy'
import {
  HiringInputError,
  type HiringStore,
  SET_ASIDE_REASONS,
} from '../../lib/hiring/store'
import {
  type HiringOutreach,
  OutreachRefusedError,
} from '../services/hiring-outreach'
import type { HiringScreening } from '../services/hiring-screening'
import type { HiringSourcing } from '../services/hiring-sourcing'

const CriterionSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  text: z.string().trim().min(1).max(300),
  kind: z.enum(['must', 'nice']),
  inferred: z.boolean().optional(),
  confirmed: z.boolean().optional(),
})

const RoleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  location: z.string().max(200).optional(),
  description: z.string().max(20_000).optional(),
  criteria: z.array(CriterionSchema).max(40).default([]),
  mode: z.enum(HIRING_MODES).optional(),
  sites: z.array(z.string().max(40)).max(20).optional(),
})

function failure(error: unknown) {
  if (error instanceof HiringInputError) {
    return {
      status: error.code.startsWith('no-') ? 404 : 400,
      body: { error: { message: error.message, code: error.code } },
    } as const
  }
  throw error
}

export function createHiringRoutes(deps: {
  store: HiringStore
  sourcing: HiringSourcing
  screening: HiringScreening
  outreach: HiringOutreach
  policy?: HiringPolicySource
}) {
  const { store, sourcing, screening, outreach } = deps
  const guard = async <T>(
    c: { json: (b: unknown, s?: number) => Response },
    run: () => Promise<T> | T,
  ) => {
    try {
      return c.json(await run())
    } catch (error) {
      const f = failure(error)
      return c.json(f.body, f.status)
    }
  }
  /** Like guard, and a limit or a stop on outreach is a 409 with its code. */
  const sent = async <T>(
    c: { json: (b: unknown, s?: number) => Response },
    run: () => Promise<T> | T,
  ) => {
    try {
      // guard answers HiringInputError and rethrows the rest, an OutreachRefusedError included.
      return await guard(c, run)
    } catch (error) {
      if (error instanceof OutreachRefusedError) {
        return c.json({ error: { message: error.code, code: error.code } }, 409)
      }
      throw error
    }
  }
  return new Hono()
    .get('/policy', (c) =>
      c.json({ policy: hiringPolicyStatus(deps.policy?.() ?? null) }),
    )
    .get('/roles', (c) => c.json({ roles: store.listRoles() }))
    .post('/roles', zValidator('json', RoleSchema), (c) => {
      const result = store.createRole(c.req.valid('json'))
      return c.json(result, 201)
    })
    .get('/roles/:id', (c) => {
      const role = store.getRole(c.req.param('id'))
      return role
        ? c.json({ role })
        : c.json({ error: { message: 'no such role' } }, 404)
    })
    .patch(
      '/roles/:id',
      zValidator(
        'json',
        z.object({
          title: z.string().trim().min(1).max(200).optional(),
          location: z.string().max(200).nullable().optional(),
          mode: z.enum(HIRING_MODES).optional(),
          sites: z.array(z.string().max(40)).max(20).optional(),
        }),
      ),
      (c) =>
        guard(c, () => ({
          role: store.updateRole(c.req.param('id'), c.req.valid('json')),
        })),
    )
    .delete('/roles/:id', (c) => {
      store.deleteRole(c.req.param('id'))
      return c.body(null, 204)
    })
    .put(
      '/roles/:id/criteria',
      zValidator(
        'json',
        z.object({ criteria: z.array(CriterionSchema).max(40) }),
      ),
      (c) =>
        guard(c, () =>
          store.reviseCriteria(c.req.param('id'), c.req.valid('json').criteria),
        ),
    )
    .post(
      '/criteria/propose',
      zValidator(
        'json',
        z.object({ description: z.string().min(1).max(20_000) }),
      ),
      (c) => guard(c, () => screening.propose(c.req.valid('json').description)),
    )
    .post('/roles/:id/screen', (c) =>
      guard(c, async () => ({
        results: await screening.screenRole(c.req.param('id')),
      })),
    )
    .post('/roles/:id/people/:personId/screen', (c) =>
      guard(c, () =>
        screening.screen(c.req.param('id'), c.req.param('personId')),
      ),
    )
    .get('/roles/:id/people', (c) =>
      c.json({ people: store.peopleOnRole(c.req.param('id')) }),
    )
    .post(
      '/roles/:id/people',
      zValidator(
        'json',
        z.object({
          url: z.string().url().max(2_000),
          html: z.string().max(5_000_000),
        }),
      ),
      (c) =>
        guard(c, async () => ({
          results: await sourcing.fromOpenPage(
            c.req.param('id'),
            c.req.valid('json'),
          ),
        })),
    )
    .post(
      '/roles/:id/source',
      zValidator(
        'json',
        z.object({
          urls: z.array(z.string().url().max(2_000)).min(1).max(100),
          groupTitle: z.string().min(1).max(120),
        }),
      ),
      (c) =>
        guard(c, async () => {
          const { urls, groupTitle } = c.req.valid('json')
          return {
            results: await sourcing.fromUrls(
              c.req.param('id'),
              urls,
              groupTitle,
            ),
          }
        }),
    )
    .patch(
      '/roles/:id/people/:personId',
      zValidator(
        'json',
        z.object({
          stage: z.enum(HIRING_STAGES),
          reason: z.enum(SET_ASIDE_REASONS).optional(),
        }),
      ),
      (c) =>
        guard(c, () => {
          const { stage, reason } = c.req.valid('json')
          // Every stage change over HTTP is the recruiter's own; Redrob's modes act through the queue.
          store.setStage(
            c.req.param('id'),
            c.req.param('personId'),
            stage,
            'recruiter',
            reason,
          )
          return { ok: true }
        }),
    )
    .delete('/people/:personId', (c) => {
      store.deletePerson(c.req.param('personId'))
      return c.body(null, 204)
    })
    .post('/people/:personId/opt-out', (c) =>
      guard(c, async () => {
        await store.suppress(c.req.param('personId'))
        return { ok: true }
      }),
    )
    .get('/messages', (c) =>
      c.json({
        messages: outreach.list(c.req.query('roleId') || undefined),
        today: outreach.today(),
      }),
    )
    .post(
      '/roles/:id/people/:personId/messages',
      zValidator(
        'json',
        z.object({
          notice: z.string().min(1).max(500),
          language: z.string().min(2).max(20),
          tone: z.string().max(2_000).optional(),
          body: z.string().max(8_000).optional(),
          sequence: z.number().int().min(0).max(2).optional(),
        }),
      ),
      (c) =>
        sent(c, () =>
          outreach.draft(
            c.req.param('id'),
            c.req.param('personId'),
            c.req.valid('json'),
          ),
        ),
    )
    .patch(
      '/messages/:id',
      zValidator(
        'json',
        z.object({
          body: z.string().min(1).max(8_000).optional(),
          status: z.enum(['approved', 'not-sent']).optional(),
        }),
      ),
      (c) =>
        sent(c, () => {
          const { body, status } = c.req.valid('json')
          const id = c.req.param('id')
          if (body) outreach.edit(id, body)
          if (status === 'approved') outreach.approve([id])
          if (status === 'not-sent') outreach.dontSend(id)
          return { message: outreach.get(id) }
        }),
    )
    .post(
      '/messages/approve',
      zValidator(
        'json',
        z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }),
      ),
      (c) =>
        sent(c, () => ({
          messages: outreach.approve(c.req.valid('json').ids),
        })),
    )
    .post(
      '/messages/:id/start',
      zValidator('json', z.object({ conversationId: z.string().min(1) })),
      (c) =>
        sent(c, () =>
          outreach.start(c.req.param('id'), c.req.valid('json').conversationId),
        ),
    )
    .post(
      '/messages/end',
      zValidator('json', z.object({ conversationId: z.string().min(1) })),
      (c) =>
        sent(c, () => ({
          message: outreach.end(c.req.valid('json').conversationId),
        })),
    )
    .post(
      '/roles/:id/people/:personId/reply',
      zValidator('json', z.object({ text: z.string().min(1).max(20_000) })),
      (c) =>
        sent(c, () =>
          outreach.reply(
            c.req.param('id'),
            c.req.param('personId'),
            c.req.valid('json').text,
          ),
        ),
    )
    .get('/record/export', (c) => {
      const rows = store.auditRows(c.req.query('roleId') || undefined)
      if (c.req.query('format') === 'json') return c.json({ rows })
      const columns = [
        'at',
        'role_id',
        'person_ref',
        'step',
        'by',
        'criteria_version',
        'criteria_states',
        'reason',
        'site',
      ]
      const cell = (v: string) =>
        /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v
      const csv = [
        columns.join(','),
        ...rows.map((r) => columns.map((k) => cell(r[k] ?? '')).join(',')),
      ].join('\n')
      return c.body(`${csv}\n`, 200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="hiring-record.csv"',
      })
    })
    .get('/record', (c) =>
      c.json({ events: store.record(c.req.query('roleId') || undefined) }),
    )
}
