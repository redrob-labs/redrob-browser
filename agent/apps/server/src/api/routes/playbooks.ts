/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { type Playbook, runPrompt } from '@browseros/playbooks/playbook'
import { draftFromEvents, type TeachEvent } from '@browseros/playbooks/teach'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  PlaybookInvalidError,
  type PlaybookStore,
} from '../../lib/playbooks/store'

const EventSchema = z.union([
  z.object({
    kind: z.literal('navigate'),
    url: z.string(),
    title: z.string().max(300),
    at: z.number(),
  }),
  z.object({
    kind: z.literal('click'),
    url: z.string(),
    role: z.string().max(40),
    name: z.string().max(300),
    at: z.number(),
  }),
  z.object({
    kind: z.literal('input'),
    url: z.string(),
    field: z.string().max(200),
    value: z.string().max(2000).optional(),
    valueClass: z.enum(['text', 'private', 'secret']),
    at: z.number(),
  }),
  z.object({
    kind: z.literal('submit'),
    url: z.string(),
    name: z.string().max(300),
    at: z.number(),
  }),
])

export function createPlaybookRoutes(deps: { store: PlaybookStore }) {
  const { store } = deps
  return new Hono()
    .get('/', (c) => c.json({ playbooks: store.list() }))
    .post(
      '/draft',
      zValidator(
        'json',
        z.object({
          events: z.array(EventSchema).min(1).max(2000),
          name: z.string().max(120).optional(),
        }),
      ),
      (c) => {
        const { events, name } = c.req.valid('json')
        // A secret's value never reaches the server, even if a recorder sent one.
        const clean = events.map((e) =>
          e.kind === 'input' && e.valueClass !== 'text'
            ? { ...e, value: undefined }
            : e,
        ) as TeachEvent[]
        return c.json({
          playbook: draftFromEvents(clean, {
            id: crypto.randomUUID(),
            now: Date.now(),
            name,
          }),
        })
      },
    )
    .put('/:id', async (c) => {
      try {
        const body = (await c.req.json()) as Playbook
        return c.json({
          playbook: await store.save({ ...body, id: c.req.param('id') }),
        })
      } catch (error) {
        if (
          error instanceof PlaybookInvalidError ||
          error instanceof SyntaxError
        ) {
          return c.json({ error: { message: error.message } }, 400)
        }
        throw error
      }
    })
    .delete('/:id', async (c) => {
      await store.remove(c.req.param('id'))
      return c.body(null, 204)
    })
    .post(
      '/:id/runs',
      zValidator(
        'json',
        z.object({
          conversationId: z.string().min(1),
          values: z.record(z.string(), z.string().max(5000)).default({}),
        }),
      ),
      async (c) => {
        const playbook = store.get(c.req.param('id'))
        if (!playbook)
          return c.json({ error: { message: 'no such playbook' } }, 404)
        const { conversationId, values } = c.req.valid('json')
        await store.startRun(conversationId, playbook)
        return c.json({ message: runPrompt(playbook, values) })
      },
    )
}
