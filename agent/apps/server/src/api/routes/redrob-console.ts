/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { RedrobConsoleDeviceFlow } from '../services/redrob-console/device-flow'
import type { Env } from '../types'

const handleSchema = z.object({ handle: z.string().uuid() }).strict()

/** `POST /start` begins a console device connection; `POST /poll` and `POST /cancel` take its handle. */
export function createRedrobConsoleRoutes(
  options: { flow?: RedrobConsoleDeviceFlow } = {},
) {
  const flow = options.flow ?? new RedrobConsoleDeviceFlow()
  return new Hono<Env>()
    .post('/device/start', async (c) => {
      try {
        return c.json(await flow.start(), 200)
      } catch (err) {
        return c.json(
          {
            error:
              err instanceof Error
                ? err.message
                : 'Could not start the connection.',
          },
          502,
        )
      }
    })
    .post('/device/poll', zValidator('json', handleSchema), async (c) => {
      return c.json(await flow.poll(c.req.valid('json').handle), 200)
    })
    .post('/device/cancel', zValidator('json', handleSchema), (c) => {
      flow.cancel(c.req.valid('json').handle)
      return c.json({ ok: true }, 200)
    })
}
