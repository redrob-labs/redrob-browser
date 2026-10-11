/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Privacy Protection's settings, in `<browseros dir>/privacy.json`.
 *
 * A file rather than a table: the settings are one small record the gate reads on every model call,
 * and a team policy (PR 1.6) will lay its own values over it without a migration. Counts are kept by
 * ISO week and are counts only; no value the gate saw is ever written here.
 */

import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PrivacyLevel } from '@browseros/privacy/labels'
import { z } from 'zod'
import { getBrowserosDir } from '../browseros-dir'

export const PRIVACY_LEVELS = ['off', 'standard', 'high', 'strict'] as const
export const DEFAULT_PRIVACY_LEVEL: PrivacyLevel = 'standard'

const SettingsSchema = z.object({
  level: z.enum(PRIVACY_LEVELS).default(DEFAULT_PRIVACY_LEVEL),
  /** One entry per person or organisation, every form of it: `[["김지원", "Jiwon Kim"]]`. */
  names: z.array(z.array(z.string().min(1)).min(1)).default([]),
  /** Hosts whose pages the agent may not read or act on, at any level. */
  neverReadSites: z.array(z.string().min(1)).default([]),
  kept: z
    .object({ week: z.string(), count: z.number().int().nonnegative() })
    .default({ week: '', count: 0 }),
})

export type PrivacySettings = z.infer<typeof SettingsSchema>

export const PrivacySettingsUpdateSchema = z
  .object({
    level: z.enum(PRIVACY_LEVELS),
    names: z.array(z.array(z.string().trim().min(1)).min(1)).max(500),
    neverReadSites: z.array(z.string().trim().min(1)).max(500),
  })
  .partial()

export type PrivacySettingsUpdate = z.infer<typeof PrivacySettingsUpdateSchema>

/** `2026-W41`: the ISO week a date falls in. */
export function isoWeek(date: Date): string {
  const day = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
  const weekday = day.getUTCDay() || 7
  day.setUTCDate(day.getUTCDate() + 4 - weekday)
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** A host as people type it, `https://www.MyBank.com/login` or `mybank.com`, reduced to `mybank.com`. */
export function normaliseSite(site: string): string {
  const trimmed = site.trim().toLowerCase()
  let host = trimmed
  try {
    host = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
      .hostname
  } catch {
    // Left as typed: it simply never matches a page.
  }
  return host.replace(/^www\./, '').replace(/\.$/, '')
}

/** Whether a page URL is on a listed site or one of its subdomains. */
export function isNeverReadSite(
  url: string,
  sites: readonly string[],
): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return false
  }
  return sites.some((site) => host === site || host.endsWith(`.${site}`))
}

export class PrivacySettingsStore {
  private cached: PrivacySettings | null = null

  constructor(
    private readonly path = join(getBrowserosDir(), 'privacy.json'),
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The settings, read once and then from memory; a file that does not parse reads as defaults. */
  get(): PrivacySettings {
    if (this.cached) return this.cached
    let raw: unknown = {}
    try {
      raw = JSON.parse(readFileSync(this.path, 'utf8'))
    } catch {
      raw = {}
    }
    const parsed = SettingsSchema.safeParse(raw)
    this.cached = parsed.success ? parsed.data : SettingsSchema.parse({})
    return this.cached
  }

  async update(update: PrivacySettingsUpdate): Promise<PrivacySettings> {
    const current = this.get()
    const next: PrivacySettings = {
      ...current,
      ...(update.level ? { level: update.level } : {}),
      ...(update.names ? { names: update.names } : {}),
      ...(update.neverReadSites
        ? {
            neverReadSites: [
              ...new Set(update.neverReadSites.map(normaliseSite)),
            ].filter(Boolean),
          }
        : {}),
    }
    await this.write(next)
    return next
  }

  /** Private details kept from the AI this week. */
  keptThisWeek(): number {
    const { kept } = this.get()
    return kept.week === isoWeek(this.now()) ? kept.count : 0
  }

  /** Adds details labelled for the first time; a detail seen again in a later turn is not new. */
  async addKept(newDetails: number): Promise<void> {
    if (newDetails <= 0) return
    const current = this.get()
    const week = isoWeek(this.now())
    const count =
      (current.kept.week === week ? current.kept.count : 0) + newDetails
    await this.write({ ...current, kept: { week, count } })
  }

  private async write(settings: PrivacySettings): Promise<void> {
    this.cached = settings
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(settings, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
    await rename(temporary, this.path)
  }
}
