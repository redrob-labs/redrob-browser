/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Outreach, the parts with no I/O (Recruit plan §4.3, §4b): what the model is asked when it drafts a
 * message, the notice every first message carries, where Automatic is not offered, the controls that
 * cost money, and the time zone a message's quiet hours are kept in.
 */

/** Model input, not copy. The draft is written with labels; real names go back in on this computer. */
export const DRAFT_SYSTEM = [
  'You write a short, personal first message from a recruiter to one person about one role.',
  'Use only what is given: the role, and the facts quoted from their profile. Do not invent anything about them or the company.',
  'Never mention or allude to age, gender, ethnicity, religion, disability, family, nationality, photos or any personal characteristic.',
  'Keep every label such as [PERSON_1] or [ORG_1] exactly as written. Do not add a greeting line about how you found them or how to opt out: that is added after.',
  'No more than 90 words. Plain text, no subject line, no sign-off.',
].join('\n')

export const FOLLOW_UP_SYSTEM = [
  'You write a brief, polite follow-up from a recruiter to one person who has not replied to the message given.',
  'One or two sentences. Do not repeat the first message. Do not pressure. Keep every label such as [PERSON_1] exactly as written.',
].join('\n')

export function draftPrompt(input: {
  role: { title: string; location?: string | null }
  name: string
  evidence: string[]
  tone?: string
  language: string
  previous?: string
}): string {
  return [
    `Write in this language: ${input.language}`,
    `Role: ${input.role.title}${input.role.location ? `, ${input.role.location}` : ''}`,
    `Their name: ${input.name}`,
    input.evidence.length ? 'What they wrote that fits the role:' : '',
    ...input.evidence.slice(0, 5).map((e) => `- ${e}`),
    input.tone ? `The recruiter's own tone, as an example: ${input.tone}` : '',
    input.previous
      ? `The message they have not answered:\n${input.previous}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** The draft with the notice the plan requires on every first message (GDPR Art. 14). */
export function withNotice(body: string, notice: string): string {
  const text = body.trim()
  return text.includes(notice.trim()) ? text : `${text}\n\n${notice.trim()}`
}

/**
 * Whether Automatic may be offered for a role in this place. Not where a law needs more first: New
 * York City (LL144 bias audit and notice), the EU and the UK (GDPR Art. 22, the AI Act).
 */
const NOT_AUTOMATIC =
  /\b(new york|nyc|manhattan|brooklyn|queens|bronx|staten island|london|uk|united kingdom|england|scotland|wales|ireland|eu|european union|germany|france|spain|italy|netherlands|belgium|sweden|denmark|finland|poland|austria|portugal|czech|greece|hungary|romania|berlin|paris|madrid|amsterdam|dublin|munich|stockholm|warsaw|vienna|lisbon|milan|rome|barcelona|brussels|copenhagen|helsinki|prague)\b|뉴욕|런던|영국|유럽|독일|프랑스|파리|베를린/i

export function automaticAllowed(location: string | null | undefined): boolean {
  return !location || !NOT_AUTOMATIC.test(location)
}

/** Buying InMail credits, unlocking a CV, a paid view: always the recruiter's, never automatic. */
const PAID =
  /\b(buy|purchase|get more|upgrade|unlock( (cv|resume|profile|contact))?|use \d+ credits?|spend credits?|premium|try (premium|recruiter))\b|구매|결제|업그레이드|열람권|이력서 열람|크레딧 사용|유료/i

export function isPaidControl(name: string): boolean {
  return PAID.test(name)
}

/** The text the recruiter approved and the text being typed are the same message. */
export function sameMessage(approved: string, typed: string): boolean {
  const fold = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()
  return fold(approved) === fold(typed)
}

const ZONES: Array<[RegExp, string]> = [
  [
    /seoul|busan|incheon|daegu|daejeon|gwangju|pangyo|korea|서울|부산|인천|대구|대전|광주|판교|한국/i,
    'Asia/Seoul',
  ],
  [
    /bengaluru|bangalore|mumbai|delhi|gurgaon|gurugram|noida|pune|hyderabad|chennai|kolkata|india/i,
    'Asia/Kolkata',
  ],
  [/tokyo|osaka|japan|도쿄/i, 'Asia/Tokyo'],
  [/singapore/i, 'Asia/Singapore'],
  [
    /seattle|san francisco|los angeles|portland|bay area|california|washington state|oregon/i,
    'America/Los_Angeles',
  ],
  [
    /new york|boston|atlanta|miami|toronto|washington,? d\.?c/i,
    'America/New_York',
  ],
  [/chicago|austin|dallas|houston|texas/i, 'America/Chicago'],
  [/denver|colorado/i, 'America/Denver'],
  [/london|united kingdom|\buk\b/i, 'Europe/London'],
  [/berlin|paris|amsterdam|madrid|munich|germany|france/i, 'Europe/Berlin'],
]

/** The recipient's stated place, as a time zone for quiet hours; else the role's; else `fallback`. */
export function timeZoneFor(
  places: Array<string | null | undefined>,
  fallback: string,
): string {
  for (const place of places) {
    if (!place) continue
    const zone = ZONES.find(([pattern]) => pattern.test(place))
    if (zone) return zone[1]
  }
  return fallback
}

/** The recruiter's mailboxes Talent Scout sends from, by their connector names. */
export const EMAIL_CONNECTORS = ['Gmail', 'Outlook Mail'] as const
export type EmailConnector = (typeof EMAIL_CONNECTORS)[number]

/** One approved email being sent: what the connector guard holds the agent to. */
export interface EmailRun {
  connector: EmailConnector
  recipient: string
  body: string
}

// Action names are snake_case or camelCase (gmail_send_email, sendMail), so no word boundaries.
const SENDS = /(send|reply|forward|create_?message)/i
const RECIPIENT_KEYS =
  /^(to|cc|bcc|recipients?|torecipients|ccrecipients|bccrecipients|emailaddress|address)$/i
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text.startsWith('{') && !text.startsWith('[')) return value
  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

function walk(
  value: unknown,
  visit: (key: string, value: unknown) => void,
  key = '',
): void {
  const v = parseMaybeJson(value)
  if (Array.isArray(v)) {
    for (const item of v) walk(item, visit, key)
  } else if (v && typeof v === 'object') {
    for (const [k, inner] of Object.entries(v)) walk(inner, visit, k)
  } else {
    visit(key, v)
  }
}

const stripHtml = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')

/**
 * Whether a connector call may run while an approved email is being sent, and whether it is the send.
 * Discovery calls are allowed; the one action that sends must be on the approved mailbox, to the
 * approved address only (no cc or bcc to anyone else), with the approved text as its body. Anything
 * else that sends is refused.
 */
export function emailCallVerdict(
  toolName: string,
  args: Record<string, unknown>,
  run: EmailRun,
): { allow: false; reason: string } | { allow: true; sends: boolean } {
  if (toolName !== 'execute_action') return { allow: true, sends: false }
  const server = String(args.server_name ?? '')
  const action = `${String(args.category_name ?? '')} ${String(args.action_name ?? '')}`
  if (!SENDS.test(action)) {
    return {
      allow: false,
      reason: 'execute_action: only sending the approved email is allowed now.',
    }
  }
  if (server !== run.connector) {
    return {
      allow: false,
      reason: `execute_action: this email is sent from ${run.connector} only.`,
    }
  }
  const recipients = new Set<string>()
  const texts: string[] = []
  walk(args, (key, value) => {
    if (typeof value !== 'string') return
    if (RECIPIENT_KEYS.test(key))
      for (const m of value.match(EMAIL) ?? []) recipients.add(m.toLowerCase())
    texts.push(value)
  })
  const want = run.recipient.trim().toLowerCase()
  if (recipients.size === 0 || [...recipients].some((r) => r !== want)) {
    return {
      allow: false,
      reason: `execute_action: this email goes to ${run.recipient} only, with no one else copied.`,
    }
  }
  if (!texts.some((t) => sameMessage(run.body, stripHtml(t)))) {
    return {
      allow: false,
      reason:
        'execute_action: the body must be the approved message, exactly as written.',
    }
  }
  return { allow: true, sends: true }
}
