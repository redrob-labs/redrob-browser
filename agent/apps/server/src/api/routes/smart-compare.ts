/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { SmartCompare } from '../services/smart-compare'

const PriceSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
})

export const CompareRequestSchema = z.object({
  product: z.object({
    title: z.string().min(1).max(500),
    brand: z.string().max(100).optional(),
    models: z.array(z.string().max(60)).max(10),
    gtin: z.string().max(20).optional(),
    price: PriceSchema.optional(),
    url: z.string().url(),
    source: z.enum(['json-ld', 'open-graph', 'store-page']),
  }),
  region: z.enum(['KR', 'IN', 'US']),
  fresh: z.boolean().optional(),
})

export function createSmartCompareRoutes(deps: { compare: SmartCompare }) {
  return new Hono().post(
    '/',
    zValidator('json', CompareRequestSchema),
    async (c) => {
      const { product, region, fresh } = c.req.valid('json')
      return c.json(await deps.compare.compare(product, region, { fresh }))
    },
  )
}
