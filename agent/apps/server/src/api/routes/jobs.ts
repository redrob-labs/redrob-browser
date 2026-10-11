/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { readFile } from 'node:fs/promises'
import { matchJob } from '@browseros/jobs/match'
import { applyPrompt } from '@browseros/jobs/prompt'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  JobInputError,
  type JobStore,
  MAX_RESUME_BYTES,
} from '../../lib/jobs/store'

const ModeSchema = z.enum(['review', 'batch', 'automatic'])

const ProfileSchema = z.object({
  answers: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        question: z.string().max(300),
        aliases: z.array(z.string().max(120)).max(40),
        answer: z.string().max(5000),
      }),
    )
    .max(300),
  criteria: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        text: z.string().max(300),
        kind: z.enum(['must', 'nice']),
        keywords: z.array(z.string().max(120)).max(40),
        inferred: z.boolean().optional(),
      }),
    )
    .max(60),
  mode: ModeSchema,
  dailyCap: z.number().int().min(1).max(50),
  keywords: z.string().max(200),
})

const PostingSchema = z.object({
  title: z.string().min(1).max(300),
  company: z.string().max(200),
  location: z.string().max(200).optional(),
  description: z.string().max(8000),
  url: z.string().url().max(2000),
  system: z.string().max(40).optional(),
  source: z.enum(['json-ld', 'page']),
})

const StatusSchema = z.enum([
  'queued',
  'filling',
  'needs-you',
  'ready',
  'sent',
  'failed',
  'skipped',
])

export function createJobRoutes(deps: { store: JobStore }) {
  const { store } = deps
  return new Hono()
    .get('/profile', (c) => c.json({ profile: store.getProfile() }))
    .put('/profile', zValidator('json', ProfileSchema), async (c) =>
      c.json({ profile: await store.saveProfile(c.req.valid('json')) }),
    )
    .post('/resume', async (c) => {
      const name = c.req.query('name') ?? ''
      const length = Number(c.req.header('content-length') ?? 0)
      if (length > MAX_RESUME_BYTES) {
        return c.json({ error: { message: 'file too large' } }, 413)
      }
      try {
        const bytes = new Uint8Array(await c.req.arrayBuffer())
        return c.json({ profile: await store.saveResume(name, bytes) })
      } catch (error) {
        if (error instanceof JobInputError) {
          return c.json({ error: { message: error.message } }, 400)
        }
        throw error
      }
    })
    .delete('/resume', async (c) =>
      c.json({ profile: await store.removeResume() }),
    )
    .post(
      '/match',
      zValidator('json', z.object({ posting: PostingSchema })),
      (c) =>
        c.json({
          match: matchJob(
            c.req.valid('json').posting as never,
            store.getProfile().criteria,
          ),
        }),
    )
    .get('/applications', (c) =>
      c.json({ applications: store.listApplications() }),
    )
    .post(
      '/applications',
      zValidator(
        'json',
        z.object({
          posting: PostingSchema,
          automatic: z.boolean().default(false),
        }),
      ),
      async (c) => {
        const { posting, automatic } = c.req.valid('json')
        const queued = await store.queue(posting as never, automatic)
        if ('refused' in queued) {
          return c.json(
            { error: { message: queued.refused, code: queued.refused } },
            409,
          )
        }
        return c.json(queued, 201)
      },
    )
    .post(
      '/applications/:id/runs',
      zValidator(
        'json',
        z.object({ conversationId: z.string().min(1), mode: ModeSchema }),
      ),
      async (c) => {
        const application = store.getApplication(c.req.param('id'))
        if (!application) {
          return c.json({ error: { message: 'no such application' } }, 404)
        }
        const { conversationId, mode } = c.req.valid('json')
        await store.startRun(conversationId, application, mode)
        return c.json({
          message: applyPrompt(application.posting, store.getProfile(), {
            mode,
            resumePath: store.resumePath(),
          }),
        })
      },
    )
    .patch(
      '/applications/:id',
      zValidator(
        'json',
        z.object({
          status: StatusSchema.optional(),
          note: z.string().max(1000).optional(),
        }),
      ),
      async (c) => {
        const updated = await store.update(
          c.req.param('id'),
          c.req.valid('json'),
        )
        if (!updated)
          return c.json({ error: { message: 'no such application' } }, 404)
        return c.json({ application: updated })
      },
    )
    .delete('/applications/:id', async (c) => {
      await store.remove(c.req.param('id'))
      return c.body(null, 204)
    })
    .get('/applications/:id/receipt.png', async (c) => {
      try {
        const bytes = await readFile(store.receiptPath(c.req.param('id')))
        return c.body(bytes, 200, {
          'content-type': 'image/png',
          'cache-control': 'no-store',
        })
      } catch {
        return c.json({ error: { message: 'no receipt' } }, 404)
      }
    })
}
