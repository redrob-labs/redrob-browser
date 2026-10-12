/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The `hiring` block of a business workspace's signed team policy, as Talent Scout reads it. Without
 * a policy (every non-business user) it is null and nothing changes.
 */

import type { TeamPolicy } from '../privacy/team-policy/policy'

export type HiringPolicy = NonNullable<TeamPolicy['hiring']>

/** Where the policy comes from: the team policy source's verified policy, read on every use. */
export type HiringPolicySource = () => HiringPolicy | null

export const NO_HIRING_POLICY: HiringPolicySource = () => null

/** What the extension is told: enough to explain a limit, nothing about the workspace. */
export function hiringPolicyStatus(policy: HiringPolicy | null) {
  if (!policy) return null
  return {
    automatic: policy.automatic,
    retentionDays: policy.retentionDays ?? 180,
    regions: policy.regions ?? null,
    auditHref: policy.auditHref ?? null,
    noticeHref: policy.noticeHref ?? null,
  }
}
