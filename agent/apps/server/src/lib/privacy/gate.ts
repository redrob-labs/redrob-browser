/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Privacy Protection: private details become labels such as [EMAIL_1] in everything the model
 * reads, and go back to the real values in what the person reads and in what tools receive.
 *
 * One gate per server. Label maps are per conversation and in memory only, like Cowork's: a
 * restart forgets them, and a conversation resumed after one is labelled again from its
 * (restored) history, so the model sees consistent labels within each run of the server.
 */

import {
  emptyLabelMap,
  type LabelCategory,
  type LabelMap,
  labelText,
  MODEL_CATEGORIES,
  type PrivacyLevel,
  type PrivacyRules,
  restoreDeep,
  restoreText,
} from '@browseros/privacy/labels'
import { DetectorSource, type DetectorStatus } from './detector-source'
import { type PrivacySettings, PrivacySettingsStore } from './settings'

const MAX_CONVERSATIONS = 500

/**
 * Model input, not copy. Cowork's instruction without its privacy_compute sentence: amounts are
 * never rounded here (that is a team-policy transform), so the tool it names does not exist.
 */
export const LABEL_INSTRUCTION =
  "Private details in this conversation were replaced with labels such as [PERSON_1], [EMAIL_1] or [SECRET_1]. The same label always means the same person, organisation or detail. Keep every label exactly as written, brackets included, wherever you use that detail, including in tool calls such as typing into a form: the real values are filled in on the person's computer. Do not guess what a label stands for, and do not ask the person to reveal it."

export class PrivacyGateError extends Error {
  constructor(cause: unknown) {
    super(
      'Privacy Protection could not check this message, so nothing was sent.',
      { cause },
    )
    this.name = 'PrivacyGateError'
  }
}

export interface LabelOutcome {
  texts: string[]
  found: LabelCategory[]
  /** Labels this call created: details the conversation had not shown the model before. */
  newDetails: number
  detection: 'model' | 'patterns'
}

export interface PrivacyGateStatus {
  level: PrivacyLevel
  names: string[][]
  neverReadSites: string[]
  keptThisWeek: number
  detector: DetectorStatus
  /** Which agents the gate sits in front of. External agents make their own model calls. */
  coverage: { redrobAgent: true; externalAgents: false }
}

const ORDER: readonly PrivacyLevel[] = ['off', 'standard', 'high', 'strict']

/**
 * The rules at `minLevel` or above. Other people's details (Talent Scout's candidates) are labelled at
 * High at least, whatever the person's own level: it is their data, not the person's (Recruit plan §4.7).
 */
function atLeast(rules: PrivacyRules, minLevel?: PrivacyLevel): PrivacyRules {
  if (!minLevel || ORDER.indexOf(rules.level) >= ORDER.indexOf(minLevel)) {
    return rules
  }
  return { ...rules, level: minLevel }
}

export class PrivacyGate {
  private readonly maps = new Map<string, LabelMap>()

  constructor(
    readonly settings: PrivacySettingsStore = new PrivacySettingsStore(),
    readonly detectors: DetectorSource = new DetectorSource(),
  ) {
    if (this.needsModel(this.settings.get().level)) {
      void this.detectors.ensureDownloaded()
    }
  }

  private needsModel(level: PrivacyLevel): boolean {
    return MODEL_CATEGORIES[level].length > 0
  }

  rules(): PrivacyRules {
    const { level, names } = this.settings.get()
    return { level, names }
  }

  level(): PrivacyLevel {
    return this.settings.get().level
  }

  status(): PrivacyGateStatus {
    const settings: PrivacySettings = this.settings.get()
    return {
      level: settings.level,
      names: settings.names,
      neverReadSites: settings.neverReadSites,
      keptThisWeek: this.settings.keptThisWeek(),
      detector: this.detectors.status(),
      coverage: { redrobAgent: true, externalAgents: false },
    }
  }

  async update(
    update: Parameters<PrivacySettingsStore['update']>[0],
  ): Promise<PrivacyGateStatus> {
    const next = await this.settings.update(update)
    if (this.needsModel(next.level)) void this.detectors.ensureDownloaded()
    return this.status()
  }

  private map(conversationId: string): LabelMap {
    let map = this.maps.get(conversationId)
    if (map) {
      // Most recently used last, so the oldest conversation is the one dropped at the bound.
      this.maps.delete(conversationId)
      this.maps.set(conversationId, map)
      return map
    }
    // No date shift: that is a team-policy transform, and a shift here would also move the dates
    // back in every restore.
    map = emptyLabelMap(0)
    this.maps.set(conversationId, map)
    while (this.maps.size > MAX_CONVERSATIONS) {
      const oldest = this.maps.keys().next().value
      if (oldest === undefined) break
      this.maps.delete(oldest)
    }
    return map
  }

  hasLabels(conversationId: string): boolean {
    return Object.keys(this.maps.get(conversationId)?.byLabel ?? {}).length > 0
  }

  /** Labels texts for one conversation. Throws PrivacyGateError when it cannot: callers send nothing. */
  async label(
    conversationId: string,
    texts: string[],
    options: { minLevel?: PrivacyLevel } = {},
  ): Promise<LabelOutcome> {
    try {
      const rules = atLeast(this.rules(), options.minLevel)
      if (rules.level === 'off') {
        return { texts, found: [], newDetails: 0, detection: 'patterns' }
      }
      const map = this.map(conversationId)
      const before = Object.keys(map.byLabel).length
      const modelCategories = new Set(MODEL_CATEGORIES[rules.level])
      const detector = modelCategories.size ? await this.detectors.get() : null
      const found: LabelCategory[] = []
      const out: string[] = []
      for (const text of texts) {
        const detected =
          detector && text.trim()
            ? (await this.detectors.detect(detector, text))
                .filter((entity) => modelCategories.has(entity.category))
                .map(({ category, value }) => ({ category, value }))
            : []
        const result = labelText(text, rules, map, detected)
        found.push(...result.found)
        out.push(result.text)
      }
      const newDetails = Object.keys(map.byLabel).length - before
      if (newDetails > 0) await this.settings.addKept(newDetails)
      return {
        texts: out,
        found: [...new Set(found)],
        newDetails,
        detection: detector ? 'model' : 'patterns',
      }
    } catch (error) {
      throw error instanceof PrivacyGateError
        ? error
        : new PrivacyGateError(error)
    }
  }

  /** Labels every string inside a JSON value: what tool-call inputs and JSON results are. */
  async labelDeep(conversationId: string, value: unknown): Promise<unknown> {
    const strings: string[] = []
    collectStrings(value, strings)
    if (!strings.length) return value
    const { texts } = await this.label(conversationId, strings)
    let index = 0
    return replaceStrings(value, () => texts[index++] ?? '')
  }

  restore(conversationId: string, text: string): string {
    const map = this.maps.get(conversationId)
    return map ? restoreText(text, map).text : text
  }

  restoreDeep(conversationId: string, value: unknown): unknown {
    const map = this.maps.get(conversationId)
    return map ? restoreDeep(value, map) : value
  }

  instruction(conversationId: string): string | null {
    return this.hasLabels(conversationId) ? LABEL_INSTRUCTION : null
  }

  forget(conversationId: string): void {
    this.maps.delete(conversationId)
  }
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value))
    for (const item of value) collectStrings(item, out)
  else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out)
  }
}

function replaceStrings(value: unknown, next: () => string): unknown {
  if (typeof value === 'string') return next()
  if (Array.isArray(value))
    return value.map((item) => replaceStrings(item, next))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceStrings(item, next),
      ]),
    )
  }
  return value
}
