/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Interview times (Recruit plan §4.5), the parts with no I/O: reading busy times out of what a calendar
 * connector returned, proposing free slots inside the role's interview hours, and writing them in the
 * candidate's time zone. Video interviews are never recorded or analysed; this only finds a time.
 */

export interface Interval {
  start: number
  end: number
}

export interface InterviewHours {
  /** Local hours in the recruiter's zone, [from, to): 10 to 17 by default. */
  from: number
  to: number
  /** Minutes: 30 by default. */
  length: number
  /** How many times to offer: 3. */
  count: number
  /** Business days ahead to start and stop looking. */
  firstDay: number
  lastDay: number
}

export const DEFAULT_HOURS: InterviewHours = {
  from: 10,
  to: 17,
  length: 30,
  count: 3,
  firstDay: 1,
  lastDay: 7,
}

function toTime(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const t = Date.parse(value)
    return Number.isNaN(t) ? null : t
  }
  if (value && typeof value === 'object') {
    const v = value as {
      dateTime?: unknown
      date?: unknown
      timeZone?: unknown
    }
    if (typeof v.dateTime === 'string') {
      // Outlook gives a zone-less dateTime with timeZone "UTC" by default.
      const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(v.dateTime)
      const zone = typeof v.timeZone === 'string' ? v.timeZone : ''
      return toTime(
        hasZone || !/^utc$/i.test(zone || 'UTC')
          ? v.dateTime
          : `${v.dateTime}Z`,
      )
    }
    if (typeof v.date === 'string') return toTime(`${v.date}T00:00:00Z`)
  }
  return null
}

/**
 * Busy intervals in whatever a calendar connector returned: Google's freeBusy (`calendars.*.busy`),
 * Outlook's getSchedule (`value[].scheduleItems`), or a plain list of events with `start` and `end`.
 * Events marked free or transparent, and cancelled ones, are not busy.
 */
export function parseBusy(result: unknown): Interval[] {
  const out: Interval[] = []
  const visit = (value: unknown, depth: number) => {
    if (depth > 8 || !value) return
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          visit(JSON.parse(trimmed), depth + 1)
        } catch {}
      }
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    if (typeof value !== 'object') return
    const v = value as Record<string, unknown>
    if ('start' in v && 'end' in v) {
      const free =
        v.transparency === 'transparent' ||
        v.showAs === 'free' ||
        v.status === 'free' ||
        v.status === 'cancelled' ||
        v.isCancelled === true
      const start = toTime(v.start)
      const end = toTime(v.end)
      if (!free && start !== null && end !== null && end > start)
        out.push({ start, end })
      return
    }
    for (const inner of Object.values(v)) visit(inner, depth + 1)
  }
  visit(result, 0)
  return mergeIntervals(out)
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start - b.start)
  const out: Interval[] = []
  for (const i of sorted) {
    const last = out.at(-1)
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end)
    else out.push({ ...i })
  }
  return out
}

/** The UTC instant of a wall-clock time in `timeZone`. */
export function zonedTime(
  y: number,
  m: number,
  d: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const guess = Date.UTC(y, m, d, hour, minute)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(new Date(guess))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const shown = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
  )
  return guess - (shown - guess)
}

function localDate(at: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(new Date(at))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    y: Number(get('year')),
    m: Number(get('month')) - 1,
    d: Number(get('day')),
    weekday: get('weekday'),
  }
}

/**
 * Free slots inside the interview hours, on business days from `firstDay` to `lastDay` ahead, in the
 * recruiter's zone. Spread out: at most one slot per day until every day has one, earliest first.
 */
export function proposeSlots(
  busy: readonly Interval[],
  now: number,
  timeZone: string,
  hours: InterviewHours = DEFAULT_HOURS,
): Interval[] {
  const days: Interval[][] = []
  let businessDay = 0
  for (let offset = 1; offset <= 21 && businessDay < hours.lastDay; offset++) {
    const { y, m, d, weekday } = localDate(now + offset * 86_400_000, timeZone)
    if (weekday === 'Sat' || weekday === 'Sun') continue
    businessDay += 1
    if (businessDay < hours.firstDay) continue
    const free: Interval[] = []
    for (
      let minute = hours.from * 60;
      minute + hours.length <= hours.to * 60;
      minute += hours.length
    ) {
      const start = zonedTime(
        y,
        m,
        d,
        Math.floor(minute / 60),
        minute % 60,
        timeZone,
      )
      const slot = { start, end: start + hours.length * 60_000 }
      if (!busy.some((b) => slot.start < b.end && b.start < slot.end))
        free.push(slot)
    }
    if (free.length) days.push(free)
  }
  const out: Interval[] = []
  for (
    let round = 0;
    out.length < hours.count && days.some((d) => d[round]);
    round++
  ) {
    for (const day of days) {
      // Mid-morning first on the first round, so the offer is not three 10:00s.
      const slot = round === 0 ? day[Math.min(2, day.length - 1)] : day[round]
      if (slot && !out.some((o) => o.start === slot.start)) out.push(slot)
      if (out.length >= hours.count) break
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

/** "Tue 14 Oct, 14:00–14:30 (Asia/Seoul)", in `locale` and the candidate's zone. */
export function formatSlot(
  slot: Interval,
  timeZone: string,
  locale: string,
): string {
  const day = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(slot.start)
  const time = (t: number) =>
    new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(t)
  return `${day}, ${time(slot.start)}–${time(slot.end)} (${timeZone})`
}

/**
 * Which offered slot a reply picks: by number ("2", "option 2", "두 번째") or by the time it names
 * ("14:00", "2pm"). Null when it is not clear: then the recruiter picks.
 */
export function chosenSlot(
  reply: string,
  slots: readonly Interval[],
  timeZone: string,
): number | null {
  const ordinals: Array<[RegExp, number]> = [
    [/\b(1st|first|option 1|#1)\b|첫 ?번째|1번/i, 0],
    [/\b(2nd|second|option 2|#2)\b|두 ?번째|2번/i, 1],
    [/\b(3rd|third|option 3|#3)\b|세 ?번째|3번/i, 2],
  ]
  const hits = new Set<number>()
  for (const [pattern, index] of ordinals)
    if (index < slots.length && pattern.test(reply)) hits.add(index)
  const times = [
    ...reply.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|시)?\b/gi),
  ]
  slots.forEach((slot, index) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(slot.start)
    const h = Number(parts.find((p) => p.type === 'hour')?.value)
    const min = Number(parts.find((p) => p.type === 'minute')?.value)
    for (const t of times) {
      let hour = Number(t[1])
      const minute = Number(t[2] ?? 0)
      if (!t[2] && !t[3]) continue
      if (/pm/i.test(t[3] ?? '') && hour < 12) hour += 12
      if (hour === h && minute === min) hits.add(index)
    }
  })
  return hits.size === 1 ? ([...hits][0] ?? null) : null
}
