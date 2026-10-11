/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Privacy Protection's settings and status, for the composer's status line and the Privacy page.
 * Never returns a value the gate labelled: counts and the person's own settings only.
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { type PrivacyGate, TeamPolicyLockedError } from '../../lib/privacy/gate'
import { PrivacySettingsUpdateSchema } from '../../lib/privacy/settings'

export function createPrivacyRoutes(deps: { gate: PrivacyGate }) {
  const { gate } = deps
  return (
    new Hono()
      .get('/', (c) => c.json(gate.status()))
      .put('/', zValidator('json', PrivacySettingsUpdateSchema), async (c) => {
        try {
          return c.json(await gate.update(c.req.valid('json')))
        } catch (error) {
          if (error instanceof TeamPolicyLockedError) {
            return c.json(
              { error: { message: error.message, code: 'team_policy_locked' } },
              409,
            )
          }
          throw error
        }
      })
      // Reads the device's managed policy now, rather than at the next five-minute check.
      .post('/team', async (c) => {
        await gate.team?.refresh()
        return c.json(gate.status())
      })
      .post('/model', (c) => {
        // Starts the download, or retries a failed one; the status reports progress.
        void gate.detectors.ensureDownloaded()
        return c.json(gate.status(), 202)
      })
  )
}
