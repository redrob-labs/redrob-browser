/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Talent Scout's screening (Recruit plan §4.2, §4.7, §4.8).
 *
 * The model is a reader, never an actor: one tool-less call per person per role that can only return
 * the screening JSON. Before it, the person's text goes through the privacy gate at High or above,
 * under `hiring:<role>:<person>`, so names, employers and schools reach it as labels; afterwards the
 * key is forgotten. Its answer is restored to real values only so each quote can be checked against
 * what the person really wrote, and a quote that is not there makes that criterion unknown.
 *
 * If the gate cannot check the text, nothing is sent and the person is left for the recruiter.
 */

import type { Criterion } from '@browseros/hiring/criteria'
import { activeCriteria, refuseCriterion } from '@browseros/hiring/criteria'
import { type Evaluation, evaluate } from '@browseros/hiring/evaluate'
import {
  PROPOSE_SYSTEM,
  parseScreening,
  SCREENING_SYSTEM,
  screeningPrompt,
} from '@browseros/hiring/screening'
import type { Actor, HiringStore } from '../../lib/hiring/store'
import { HiringInputError } from '../../lib/hiring/store'
import { logger } from '../../lib/logger'
import type { PrivacyGate } from '../../lib/privacy/gate'

/** One model call: system and user text in, text out. No tools, by construction. */
export type Complete = (system: string, user: string) => Promise<string>

export type ScreenOutcome =
  | { status: 'screened'; evaluation: Evaluation }
  /** The privacy check failed, or no model is connected: nothing was sent. */
  | { status: 'needs-you'; reason: 'privacy' | 'no-model' | 'model-failed' }

export class HiringScreening {
  constructor(
    private readonly store: HiringStore,
    private readonly gate: Pick<PrivacyGate, 'label' | 'restore' | 'forget'>,
    private readonly complete: Complete | null,
    private readonly now: () => number = Date.now,
  ) {}

  async screen(
    roleId: string,
    personId: string,
    actor: Actor = 'recruiter',
  ): Promise<ScreenOutcome> {
    const role = this.store.getRole(roleId)
    if (!role) throw new HiringInputError('no-role', 'no such role')
    const onRole = this.store
      .peopleOnRole(roleId)
      .find((p) => p.id === personId)
    if (!onRole)
      throw new HiringInputError('no-person', 'this person is not on the role')
    const items = activeCriteria(role.criteria)
    const criteria = { version: role.criteria.version, items }
    const judged = items.filter((c) => !c.check)
    const at = new Date(this.now())

    // Nothing for the model to judge: the device's checks are the whole evaluation.
    if (!judged.length) {
      const evaluation = evaluate(onRole.record, criteria, [], at)
      this.store.setEvaluation(roleId, personId, evaluation, actor)
      return { status: 'screened', evaluation }
    }
    if (!this.complete) return { status: 'needs-you', reason: 'no-model' }

    const key = `hiring:${roleId}:${personId}`
    try {
      let labelled: string
      try {
        const out = await this.gate.label(
          key,
          [screeningPrompt(role, items, onRole.record)],
          {
            minLevel: 'high',
          },
        )
        labelled = out.texts[0] ?? ''
      } catch {
        return { status: 'needs-you', reason: 'privacy' }
      }
      let raw: string
      try {
        raw = await this.complete(SCREENING_SYSTEM, labelled)
      } catch (error) {
        logger.warn('Talent Scout screening failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        return { status: 'needs-you', reason: 'model-failed' }
      }
      const judgements = parseScreening(this.gate.restore(key, raw), items)
      const evaluation = evaluate(onRole.record, criteria, judgements, at)
      this.store.setEvaluation(roleId, personId, evaluation, actor)
      return { status: 'screened', evaluation }
    } finally {
      this.gate.forget(key)
    }
  }

  /** People on the role not yet screened against its current criteria, one after another. */
  async screenRole(
    roleId: string,
    limit = 25,
  ): Promise<Array<{ personId: string } & ScreenOutcome>> {
    const role = this.store.getRole(roleId)
    if (!role) throw new HiringInputError('no-role', 'no such role')
    const due = this.store
      .peopleOnRole(roleId)
      .filter((p) => p.stage !== 'set-aside')
      .filter(
        (p) =>
          p.evaluation?.criteriaVersion !== role.criteria.version ||
          !p.evaluation?.results.some((r) => r.by === 'model'),
      )
      .slice(0, limit)
    const out: Array<{ personId: string } & ScreenOutcome> = []
    for (const person of due) {
      out.push({
        personId: person.id,
        ...(await this.screen(roleId, person.id)),
      })
    }
    return out
  }

  /**
   * Criteria proposed from a job description. Every proposal is "My assumption", off until the
   * recruiter confirms it; wording that names a protected trait or a proxy is returned as refused.
   */
  async propose(description: string): Promise<{
    proposals: Array<Pick<Criterion, 'text' | 'kind' | 'inferred'>>
    refused: Array<{ text: string; reason: string }>
  }> {
    if (!this.complete) return { proposals: [], refused: [] }
    const key = `hiring:propose:${crypto.randomUUID()}`
    try {
      const labelled =
        (await this.gate.label(key, [description])).texts[0] ?? ''
      const raw = this.gate.restore(
        key,
        await this.complete(PROPOSE_SYSTEM, labelled),
      )
      let list: unknown = []
      try {
        list =
          (
            JSON.parse(/\{[\s\S]*\}/.exec(raw)?.[0] ?? '{}') as {
              criteria?: unknown
            }
          ).criteria ?? []
      } catch {
        list = []
      }
      const proposals: Array<Pick<Criterion, 'text' | 'kind' | 'inferred'>> = []
      const refused: Array<{ text: string; reason: string }> = []
      for (const item of Array.isArray(list) ? list.slice(0, 20) : []) {
        const text =
          typeof item?.text === 'string' ? item.text.trim().slice(0, 300) : ''
        if (!text) continue
        const kind = item?.kind === 'must' ? 'must' : 'nice'
        const reason = refuseCriterion(text)
        if (reason) refused.push({ text, reason })
        else proposals.push({ text, kind, inferred: true })
      }
      return { proposals, refused }
    } finally {
      this.gate.forget(key)
    }
  }
}
