/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Whether a message may go now: the daily caps, quiet hours, follow-up spacing, the 90-day window per
 * company, and the people who asked not to be contacted. Every mode, Automatic included, goes through
 * this, and it answers with the reason in words when it says no.
 */

export type SendRefusal =
  | 'opted-out'
  | 'contacted-recently'
  | 'daily-cap'
  | 'domain-hourly'
  | 'quiet-hours'
  | 'follow-up-too-soon'
  | 'follow-up-limit'
  | 'replied'
  | 'no-channel'

export interface OutreachLimits {
  /** Per site, a day. */
  perSitePerDay: Record<string, number>
  emailPerDay: number
  /** At most this many emails an hour to one domain. */
  emailPerDomainPerHour: number
  followUps: number
  /** Business days between two messages to one person. */
  followUpGapBusinessDays: number
  /** Local hours, [from, to): no sends from 21:00 to 08:00. */
  quietHours: [number, number]
  /** Days before the same company writes to the same person again. */
  recontactDays: number
}

export const DEFAULT_LIMITS: OutreachLimits = {
  perSitePerDay: {
    linkedin: 25,
    'linkedin-recruiter': 25,
    wanted: 20,
    saramin: 20,
    jobkorea: 20,
    remember: 20,
    'naukri-rms': 20,
    foundit: 20,
  },
  emailPerDay: 50,
  emailPerDomainPerHour: 1,
  followUps: 2,
  followUpGapBusinessDays: 4,
  quietHours: [21, 8],
  recontactDays: 90,
}

/**
 * A message answering someone who wrote back (interview times): not a follow-up, so neither the
 * 90-day window nor the follow-up rules apply. Opt-outs, quiet hours and caps still do.
 */
export const REPLY_SEQUENCE = -1

export interface SentMessage {
  personId: string
  /** The site id, or `email`. */
  channel: string
  /** Recipient's email domain, for email. */
  domain?: string
  sentAt: number
  /** 0 for the first message, then 1, 2 for follow-ups. */
  sequence: number
}

export interface PendingSend {
  personId: string
  channel: string
  domain?: string
  sequence: number
  /** The recipient's IANA time zone if they stated a location we can place; else the role's. */
  timeZone: string
}

/** The hour in `timeZone` at `at`. */
export function localHour(at: number, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(new Date(at))
  return Number(hour)
}

export function inQuietHours(
  at: number,
  timeZone: string,
  [from, to]: [number, number],
): boolean {
  const hour = localHour(at, timeZone)
  return from > to ? hour >= from || hour < to : hour >= from && hour < to
}

/** Business days (Mon–Fri) from `from` to `to`, by the calendar in UTC. */
export function businessDaysBetween(from: number, to: number): number {
  let days = 0
  const day = new Date(from)
  day.setUTCHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setUTCHours(0, 0, 0, 0)
  while (day < end) {
    day.setUTCDate(day.getUTCDate() + 1)
    const weekday = day.getUTCDay()
    if (weekday !== 0 && weekday !== 6) days += 1
  }
  return days
}

const sameDay = (a: number, b: number, timeZone: string) => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' })
  return f.format(new Date(a)) === f.format(new Date(b))
}

export function canSend(
  send: PendingSend,
  history: readonly SentMessage[],
  state: { optedOut: boolean; replied: boolean; channelOpen: boolean },
  limits: OutreachLimits,
  now: number,
): SendRefusal | null {
  if (state.optedOut) return 'opted-out'
  if (!state.channelOpen) return 'no-channel'
  const toPerson = history.filter((m) => m.personId === send.personId)
  if (send.sequence === REPLY_SEQUENCE) {
    // Answering them: they wrote back, so the window and follow-up rules do not apply.
  } else if (send.sequence === 0) {
    const last = toPerson.at(-1)
    if (last && now - last.sentAt < limits.recontactDays * 86_400_000) {
      return 'contacted-recently'
    }
  } else {
    if (state.replied) return 'replied'
    if (send.sequence > limits.followUps) return 'follow-up-limit'
    const last = toPerson.at(-1)
    if (
      last &&
      businessDaysBetween(last.sentAt, now) < limits.followUpGapBusinessDays
    ) {
      return 'follow-up-too-soon'
    }
  }
  if (inQuietHours(now, send.timeZone, limits.quietHours)) return 'quiet-hours'
  const today = history.filter(
    (m) => m.channel === send.channel && sameDay(m.sentAt, now, send.timeZone),
  ).length
  const cap =
    send.channel === 'email'
      ? limits.emailPerDay
      : (limits.perSitePerDay[send.channel] ?? 0)
  if (today >= cap) return 'daily-cap'
  if (send.channel === 'email' && send.domain) {
    const recent = history.filter(
      (m) =>
        m.channel === 'email' &&
        m.domain === send.domain &&
        now - m.sentAt < 3_600_000,
    ).length
    if (recent >= limits.emailPerDomainPerHour) return 'domain-hourly'
  }
  return null
}

/** Applies a business policy's caps: a policy can only lower a limit, never raise one. */
export function capLimits(
  limits: OutreachLimits,
  policy:
    | { perSitePerDay?: Record<string, number>; emailPerDay?: number }
    | undefined,
): OutreachLimits {
  if (!policy) return limits
  const perSitePerDay = { ...limits.perSitePerDay }
  for (const [site, cap] of Object.entries(policy.perSitePerDay ?? {})) {
    perSitePerDay[site] = Math.min(perSitePerDay[site] ?? cap, cap)
  }
  return {
    ...limits,
    perSitePerDay,
    emailPerDay: Math.min(
      limits.emailPerDay,
      policy.emailPerDay ?? limits.emailPerDay,
    ),
  }
}

/**
 * A reply that asks not to be written to again. Keywords first, in the languages Talent Scout writes
 * in; a reply this misses is classified by the model behind the privacy gate (5.6).
 */
const OPT_OUT =
  /\b(not interested|no thanks?|no,? thank you|stop|unsubscribe|remove me|don'?t (contact|message|email) me|please don'?t|leave me alone|not looking|opt[- ]?out)\b|그만|연락하지 (마세요|말아)|연락 사양|수신 ?거부|관심 없|사양합니다|नहीं चाहिए|रुचि नहीं/i

export function isOptOut(reply: string): boolean {
  return OPT_OUT.test(reply)
}
