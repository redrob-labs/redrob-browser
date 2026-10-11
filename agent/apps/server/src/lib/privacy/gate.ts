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
  ALWAYS_LABELLED,
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
import {
  detectedFrom,
  NO_SAVED_SECRETS,
  type SavedSecretScanner,
} from './saved-secrets'
import { type PrivacySettings, PrivacySettingsStore } from './settings'
import type { TeamPolicySource } from './team-policy/source'

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

/** A change the team policy does not allow: the level is locked. */
export class TeamPolicyLockedError extends Error {
  constructor() {
    super('Your team set this level, and only a new team policy changes it.')
    this.name = 'TeamPolicyLockedError'
  }
}

/** What the person is told about their team's policy. Never the policy's names. */
export interface TeamPolicyStatus {
  state: 'active' | 'refused'
  /** Why the device's policy was not applied; the previous one, if any, stays in force. */
  refused?: string
  accountId?: string
  version?: number
  setBy?: string
  level?: PrivacyLevel
  locked: boolean
  /** How many names the team protects, besides the person's own. */
  names: number
}

/** Days dates move by, per chat, when the team shifts them: never zero, so a date never survives. */
function dateShift(): number {
  const days = 7 + Math.floor(Math.random() * 24)
  return Math.random() < 0.5 ? -days : days
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
  /** Present only on a device with a team policy. */
  team: TeamPolicyStatus | null
  /** Whether the browser answered the last saved-secret scan. "unknown" until one has run. */
  savedSecrets: 'on' | 'unavailable' | 'unknown'
  /** Which agents the gate sits in front of. External agents make their own model calls. */
  coverage: { redrobAgent: true; externalAgents: false }
}

export class PrivacyGate {
  private readonly maps = new Map<string, LabelMap>()
  private savedSecretsState: PrivacyGateStatus['savedSecrets'] = 'unknown'

  constructor(
    readonly settings: PrivacySettingsStore = new PrivacySettingsStore(),
    readonly detectors: DetectorSource = new DetectorSource(),
    readonly savedSecrets: SavedSecretScanner = NO_SAVED_SECRETS,
    readonly team: TeamPolicySource | null = null,
  ) {
    team?.onChange(() => void this.applyTeam())
    void this.applyTeam()
    if (this.needsModel(this.settings.get().level)) {
      void this.detectors.ensureDownloaded()
    }
  }

  private needsModel(level: PrivacyLevel): boolean {
    return MODEL_CATEGORIES[level].length > 0
  }

  private teamPrivacy() {
    return this.team?.policy()?.policy.privacy ?? null
  }

  /** An unlocked policy's level is applied once per policy; a locked one is read on every call. */
  private async applyTeam(): Promise<void> {
    const verified = this.team?.policy()
    if (!verified || verified.policy.privacy.locked) return
    await this.settings.applyTeamLevel(
      verified.payloadSha256,
      verified.policy.privacy.level,
    )
    if (this.needsModel(this.level())) void this.detectors.ensureDownloaded()
  }

  rules(): PrivacyRules {
    const { level, names } = this.settings.get()
    const team = this.teamPrivacy()
    if (!team) return { level, names }
    return {
      level: team.locked ? team.level : level,
      names: [...names, ...team.names],
      transforms: team.transforms,
    }
  }

  level(): PrivacyLevel {
    return this.rules().level
  }

  private teamStatus(): TeamPolicyStatus | null {
    const state = this.team?.state()
    if (!state || state.state === 'none') return null
    const verified = this.team?.policy()
    const privacy = verified?.policy.privacy
    return {
      state: state.state,
      ...(state.state === 'refused' ? { refused: state.code } : {}),
      ...(verified
        ? {
            accountId: verified.policy.accountId,
            version: verified.policy.version,
            setBy: verified.policy.setBy.name,
            level: privacy?.level,
          }
        : {}),
      locked: privacy?.locked === true,
      names: privacy?.names.length ?? 0,
    }
  }

  status(): PrivacyGateStatus {
    const settings: PrivacySettings = this.settings.get()
    return {
      level: this.level(),
      names: settings.names,
      neverReadSites: settings.neverReadSites,
      keptThisWeek: this.settings.keptThisWeek(),
      detector: this.detectors.status(),
      team: this.teamStatus(),
      savedSecrets: this.savedSecretsState,
      coverage: { redrobAgent: true, externalAgents: false },
    }
  }

  async update(
    update: Parameters<PrivacySettingsStore['update']>[0],
  ): Promise<PrivacyGateStatus> {
    const team = this.teamPrivacy()
    if (team?.locked && update.level && update.level !== team.level) {
      throw new TeamPolicyLockedError()
    }
    await this.settings.update(update)
    if (this.needsModel(this.level())) void this.detectors.ensureDownloaded()
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
    // Dates move only when the team asks for it; the shift is fixed per chat, so restores agree.
    map = emptyLabelMap(
      this.teamPrivacy()?.transforms.shiftDates ? dateShift() : 0,
    )
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
  async label(conversationId: string, texts: string[]): Promise<LabelOutcome> {
    try {
      const rules = this.rules()
      if (rules.level === 'off')
        return await this.labelSavedOnly(conversationId, texts)
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
        const saved = await this.scanSaved(text)
        // Saved values first: the browser knows them exactly, the model only guesses.
        const result = labelText(text, rules, map, [...saved, ...detected])
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

  private async scanSaved(text: string) {
    if (!text.trim()) return []
    const scan = await this.savedSecrets.scan(text)
    this.savedSecretsState = scan.state === 'ready' ? 'on' : 'unavailable'
    return scan.state === 'ready' ? detectedFrom(text, scan.spans) : []
  }

  /**
   * With Privacy Protection off, saved passwords and saved cards are still labelled: they are
   * "never sent to AI, at any level". Only the browser's finds of those two, no patterns, no names.
   */
  private async labelSavedOnly(
    conversationId: string,
    texts: string[],
  ): Promise<LabelOutcome> {
    const always = new Set(ALWAYS_LABELLED)
    const out: string[] = []
    const found: LabelCategory[] = []
    let map: LabelMap | null = null
    let before = 0
    for (const text of texts) {
      const saved = (await this.scanSaved(text)).filter((d) =>
        always.has(d.category),
      )
      if (!saved.length) {
        out.push(text)
        continue
      }
      if (!map) {
        map = this.map(conversationId)
        before = Object.keys(map.byLabel).length
      }
      const result = labelText(text, { level: 'off', names: [] }, map, saved, {
        categories: ALWAYS_LABELLED,
        patterns: false,
      })
      found.push(...result.found)
      out.push(result.text)
    }
    const newDetails = map ? Object.keys(map.byLabel).length - before : 0
    if (newDetails > 0) await this.settings.addKept(newDetails)
    return {
      texts: out,
      found: [...new Set(found)],
      newDetails,
      detection: 'patterns',
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
