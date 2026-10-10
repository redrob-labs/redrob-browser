/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: MIT
 *
 * Ported from Redrob Cowork, apps/server/src/privacy/labels.ts (MIT).
 */

/*
 * Privacy labels: private details become typed, consistent labels such as [PERSON_1] in what the
 * model reads, and go back to the real values in what the person reads and in what tools receive.
 *
 * Patterns come from the app's own redact.ts (apps/app/src/react-app/desk/privacy), which this
 * supersedes on the send path: the same shapes with the same checksums, plus what the plan adds:
 *   - one label per entity, every form of it included: the policy's names list groups forms
 *     (`김지원 | Jiwon Kim`), and Korean honorifics and particles stay outside the match
 *     (`[PERSON_1]님은`), so 김지원, 김지원님 and Jiwon Kim are all PERSON_1;
 *   - PERSON and ORG for listed names, NAME kept as an alias so older chats still restore;
 *   - amounts, percentages, clause numbers and ordinary dates are kept, because the work is about
 *     them; the policy can require rounding amounts or shifting dates instead. A rounded amount is
 *     a label with its approximation, `[AMOUNT_1](≈₩12,000,000)`, so the exact figure comes back
 *     in the answer and the privacy_compute tool (compute.ts) can still work with it;
 *   - restore tolerates the ways a model garbles a label: `[PERSON 1]`, `PERSON_1`, `［PERSON_1］`.
 *
 * Pure and dependency-free, so the server and its tests use the same code.
 */

export type PrivacyLevel = 'off' | 'standard' | 'high' | 'strict'

export type LabelCategory =
  | 'EMAIL'
  | 'RRN'
  | 'BRN'
  | 'CARD'
  | 'PHONE'
  | 'ACCOUNT'
  | 'ADDRESS'
  | 'PERSON'
  | 'ORG'
  | 'TITLE'
  | 'AMOUNT'

export type PrivacyRules = {
  level: PrivacyLevel
  /** One entry per person or organisation, every form of it. */
  names: readonly (readonly string[])[]
  transforms?: {
    roundAmounts?: boolean
    shiftDates?: boolean
    titlesNearNames?: boolean
  }
}

/** One chat's labels. Lives in redrob-server's memory only; see gate.ts. */
export type LabelMap = {
  /** `[PERSON_1]` -> the value it stands for, in the form it first appeared. */
  byLabel: Record<string, string>
  /** Normalised value -> label, so every form of an entity gets the same one. */
  byValue: Record<string, string>
  /** Days added to dates when the policy shifts them. Fixed per chat. */
  dateShiftDays: number
}

export function emptyLabelMap(dateShiftDays = 0): LabelMap {
  return { byLabel: {}, byValue: {}, dateShiftDays }
}

const STANDARD: LabelCategory[] = ['EMAIL', 'RRN', 'CARD', 'PHONE']
const HIGH: LabelCategory[] = [
  ...STANDARD,
  'ACCOUNT',
  'ADDRESS',
  'BRN',
  'PERSON',
  'ORG',
]

export const LEVEL_CATEGORIES: Record<PrivacyLevel, readonly LabelCategory[]> =
  {
    off: [],
    standard: STANDARD,
    // The names an admin listed are protected from High up: listing them is the request.
    high: HIGH,
    strict: [...HIGH, 'TITLE'],
  }

const digits = (value: string) => value.replace(/\D/g, '')

function validRrn(match: string): boolean {
  const value = digits(match)
  if (value.length !== 13) return false
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  if (!/[1-8]/.test(value[6] ?? '')) return false
  if (/\d{6}-\d{7}/.test(match)) return true
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5]
  const sum = weights.reduce(
    (total, weight, index) => total + weight * Number(value[index]),
    0,
  )
  return (11 - (sum % 11)) % 10 === Number(value[12])
}

function validBrn(match: string): boolean {
  const value = digits(match)
  if (value.length !== 10) return false
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5]
  let sum = weights.reduce(
    (total, weight, index) => total + weight * Number(value[index]),
    0,
  )
  sum += Math.floor((Number(value[8]) * 5) / 10)
  return (10 - (sum % 10)) % 10 === Number(value[9])
}

function validCard(match: string): boolean {
  const value = digits(match)
  if (value.length < 13 || value.length > 19) return false
  let sum = 0
  for (let index = 0; index < value.length; index += 1) {
    let digit = Number(value[value.length - 1 - index])
    if (index % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

type Rule = {
  category: LabelCategory
  pattern: RegExp
  valid?: (match: string) => boolean
  group?: number
}

/** In order: the more specific shapes go first, so a phone pattern never takes an ID number. */
const RULES: Rule[] = [
  {
    category: 'EMAIL',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  { category: 'RRN', pattern: /(?<!\d)\d{6}-?\d{7}(?!\d)/g, valid: validRrn },
  {
    category: 'BRN',
    pattern: /(?<!\d)\d{3}-?\d{2}-?\d{5}(?!\d)/g,
    valid: validBrn,
  },
  {
    category: 'CARD',
    pattern: /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g,
    valid: validCard,
  },
  {
    category: 'PHONE',
    pattern:
      /(?<![\w+])(?:\+82[\s-]?|0)(?:1[016789]|2|[3-6][1-5]|70)[\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)/g,
  },
  {
    category: 'PHONE',
    pattern:
      /\+\d{1,3}[\s.-]?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]?\d{2,4}){1,3}(?!\d)/g,
  },
  {
    category: 'PHONE',
    pattern: /\(\d{3}\)\s?\d{3}-\d{4}(?!\d)|(?<!\d)\d{3}-\d{3}-\d{4}(?!\d)/g,
  },
  {
    category: 'ACCOUNT',
    pattern: /(?<!\d)\d{2,6}-\d{2,6}-\d{2,7}(?:-\d{1,3})?(?!\d)/g,
    valid: (match) => digits(match).length >= 10,
  },
  {
    category: 'ACCOUNT',
    pattern: /(?:계좌|account|acct)[^\d\n]{0,12}(\d{10,16})(?!\d)/gi,
    group: 1,
  },
  {
    category: 'ADDRESS',
    pattern:
      /(?:[가-힣]+(?:특별시|광역시|특별자치시|도|시)\s)?(?:[가-힣]+(?:시|군|구)\s)+[가-힣0-9]+(?:로|길)\s?\d+(?:-\d+)?/g,
  },
  {
    category: 'ADDRESS',
    pattern:
      /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b\.?/g,
  },
]

const ORG_MARKERS =
  /(?:주식회사|\(주\)|㈜|유한회사|재단|법인|그룹|은행|증권|\b(?:Inc|Ltd|LLC|LLP|Corp|Corporation|Co|GmbH|PLC|Bank|Group|Holdings|Robotics|Labs|Partners)\b\.?)/i

/** A listed name is an organisation when one of its forms says so; otherwise a person. */
function nameCategory(forms: readonly string[]): LabelCategory {
  return forms.some((form) => ORG_MARKERS.test(form)) ? 'ORG' : 'PERSON'
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Matching key for a value: case, spacing and width folded, so `Jiwon  Kim` and `jiwon kim` are
 * one entity, and every form of a listed name maps to its group.
 */
function normalise(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Job titles next to a name, at Strict when the policy asks: `CEO [PERSON_1]`, `[PERSON_1] 대표`. */
const TITLE_WORDS =
  '대표이사|대표|사장|부사장|회장|이사|전무|상무|부장|차장|과장|팀장|실장|본부장|원장|교수|변호사|회계사|CEO|CFO|CTO|COO|President|Director|Chairman|Partner'

export type LabelResult = { text: string; found: LabelCategory[] }

type Ctx = {
  map: LabelMap
  groups: Map<string, string>
  found: LabelCategory[]
}

function labelFor(ctx: Ctx, category: LabelCategory, value: string): string {
  const key =
    ctx.groups.get(normalise(value)) ?? `${category}:${normalise(value)}`
  const existing = ctx.map.byValue[key]
  if (existing) return existing
  let index = 1
  while (ctx.map.byLabel[`[${category}_${index}]`] !== undefined) index += 1
  const label = `[${category}_${index}]`
  ctx.map.byLabel[label] = value
  ctx.map.byValue[key] = label
  return label
}

/** Amounts with a currency, rounded to two significant figures. */
const AMOUNT =
  /(?:(₩|\$|USD\s?|KRW\s?|€|£)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s?(원|달러|USD|KRW))/g

function roundSignificant(value: number): number {
  if (value < 100) return value
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1)
  return Math.round(value / magnitude) * magnitude
}

/** An amount already labelled, with its approximation: left as it is, never rounded twice. */
const LABELLED_AMOUNT = /\[AMOUNT_\d+\]\(≈[^)\n]{0,40}\)/g

/** Each amount becomes a label with its rounded value; the map keeps the exact figure. */
function roundAmounts(text: string, ctx: Ctx): string {
  const pattern = new RegExp(`${LABELLED_AMOUNT.source}|${AMOUNT.source}`, 'g')
  return text.replace(
    pattern,
    (
      match,
      prefix: string | undefined,
      before: string | undefined,
      after: string | undefined,
      suffix: string | undefined,
    ) => {
      if (match.startsWith('[AMOUNT_')) return match
      const raw = prefix ? before : after
      if (!raw) return match
      const rounded = roundSignificant(
        Number(raw.replace(/,/g, '')),
      ).toLocaleString('en-US')
      let approximate: string
      if (prefix) approximate = `${prefix}${rounded}`
      else {
        const gap =
          match
            .slice(match.indexOf(raw) + raw.length)
            .match(/^[.\d]*(\s?)/)?.[1] ?? ''
        approximate = `${rounded}${gap}${suffix ?? ''}`
      }
      ctx.found.push('AMOUNT')
      return `${labelFor(ctx, 'AMOUNT', match)}(≈${approximate})`
    },
  )
}

const ISO_DATE = /(?<!\d)(\d{4})([-./])(\d{1,2})\2(\d{1,2})(?!\d)/g
const KO_DATE = /(\d{4})년\s?(\d{1,2})월\s?(\d{1,2})일/g

function shiftDate(
  year: number,
  month: number,
  day: number,
  days: number,
): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  date.setUTCDate(date.getUTCDate() + days)
  return date
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Moves every date by the same number of days, so the gaps between them stay true. */
export function shiftDates(text: string, days: number): string {
  if (!days) return text
  return text
    .replace(
      ISO_DATE,
      (match, y: string, sep: string, m: string, d: string) => {
        const date = shiftDate(Number(y), Number(m), Number(d), days)
        return date
          ? `${date.getUTCFullYear()}${sep}${pad(date.getUTCMonth() + 1)}${sep}${pad(date.getUTCDate())}`
          : match
      },
    )
    .replace(KO_DATE, (match, y: string, m: string, d: string) => {
      const date = shiftDate(Number(y), Number(m), Number(d), days)
      return date
        ? `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`
        : match
    })
}

/** What the detection model may add at each level; patterns and listed names cover the rest. */
export const MODEL_CATEGORIES: Record<PrivacyLevel, readonly LabelCategory[]> =
  {
    off: [],
    standard: [],
    high: ['ADDRESS', 'ORG'],
    strict: ['ADDRESS', 'ORG', 'PERSON'],
  }

/** An entity the detection model found, by value: it is labelled wherever that value appears. */
export type DetectedValue = { category: LabelCategory; value: string }

const ENTITY_CATEGORIES = new Set<LabelCategory>(['PERSON', 'ORG', 'ADDRESS'])

/**
 * Labels one text with the chat's map, which it extends. Texts that already hold labels are left
 * alone where they hold them: a label is not a private detail.
 *
 * `detected` are the model's finds in this text. They are matched after the patterns, so where a
 * pattern and the model overlap the pattern wins (it was checked against a checksum), and they are
 * matched as values, so every mention gets the label, not only the one the model saw. Entities this
 * chat already labelled are matched the same way, so a name the model found once stays labelled in
 * later turns even where the model misses it.
 */
export function labelText(
  text: string,
  rules: PrivacyRules,
  map: LabelMap,
  detected: readonly DetectedValue[] = [],
): LabelResult {
  const allowed = new Set(LEVEL_CATEGORIES[rules.level])
  if (!allowed.size || !text) return { text, found: [] }
  const ctx: Ctx = { map, groups: new Map(), found: [] }

  // Every form of a listed name keys to its group, so all of them share one label.
  const nameForms: Array<{ form: string; category: LabelCategory }> = []
  for (const forms of rules.names) {
    const clean = forms
      .map((form) => form.trim())
      .filter((form) => form.length >= 2)
    if (!clean.length) continue
    const category = nameCategory(clean)
    if (!allowed.has(category)) continue
    const groupKey = `${category}:${normalise(clean[0])}`
    for (const form of clean) {
      ctx.groups.set(normalise(form), groupKey)
      nameForms.push({ form, category })
    }
  }

  // The model's finds and this chat's earlier entities join the listed names. Listed names keep
  // their grouping; a value already grouped is not re-added under another category.
  const known = new Set(nameForms.map((item) => normalise(item.form)))
  const extra: DetectedValue[] = [...detected]
  for (const [label, value] of Object.entries(map.byLabel)) {
    const category = /^\[([A-Z]+)_\d+\]$/.exec(label)?.[1] as
      | LabelCategory
      | undefined
    if (category && ENTITY_CATEGORIES.has(category))
      extra.push({ category, value })
  }
  for (const { category, value } of extra) {
    const form = value.trim()
    if (form.length < 2 || !allowed.has(category) || known.has(normalise(form)))
      continue
    known.add(normalise(form))
    nameForms.push({ form, category })
  }

  let addressesDone = false
  const replaceForms = (
    input: string,
    forms: Array<{ form: string; category: LabelCategory }>,
  ) => {
    if (!forms.length) return input
    // Longest first, so a full name is taken before a part of it. Korean has no word boundaries, so
    // a Korean form matches anywhere and the particle after it stays where it is; a Latin form has
    // to be a whole word, so `Kim` in `Kimchi` is left alone.
    const sorted = [...forms].sort((a, b) => b.form.length - a.form.length)
    const byNorm = new Map(
      sorted.map((item) => [normalise(item.form), item.category]),
    )
    const alternatives = sorted.map(({ form }) => {
      const body = escapeRegExp(form).replace(/\s+/g, '\\s+')
      return /^[A-Za-z]/.test(form) ? `(?<![A-Za-z])${body}(?![A-Za-z])` : body
    })
    return input.replace(new RegExp(alternatives.join('|'), 'giu'), (match) => {
      const category = byNorm.get(normalise(match)) ?? 'PERSON'
      ctx.found.push(category)
      return labelFor(ctx, category, match)
    })
  }

  let next = text
  for (const rule of RULES) {
    if (!allowed.has(rule.category)) continue
    // A whole address the model found goes before the address patterns, which only know the
    // street part: otherwise the pattern takes `테헤란로 152` and leaves `, 12층` behind. Addresses
    // have no checksum, so there is nothing for the pattern to win on.
    if (rule.category === 'ADDRESS' && !addressesDone) {
      next = replaceForms(
        next,
        nameForms.filter((item) => item.category === 'ADDRESS'),
      )
      addressesDone = true
    }
    next = next.replace(rule.pattern, (match: string, ...rest: unknown[]) => {
      const captured = rule.group ? rest[rule.group - 1] : match
      const value = typeof captured === 'string' ? captured : match
      if (rule.valid && !rule.valid(value)) return match
      ctx.found.push(rule.category)
      return match.replace(value, labelFor(ctx, rule.category, value))
    })
  }
  next = replaceForms(
    next,
    nameForms.filter((item) => item.category !== 'ADDRESS' || !addressesDone),
  )

  if (allowed.has('TITLE') && rules.transforms?.titlesNearNames) {
    next = next
      .replace(
        new RegExp(`(${TITLE_WORDS})(\\s*)(\\[(?:PERSON)_\\d+\\])`, 'g'),
        (_m, title: string, gap: string, label: string) => {
          ctx.found.push('TITLE')
          return `${labelFor(ctx, 'TITLE', title)}${gap}${label}`
        },
      )
      .replace(
        new RegExp(`(\\[(?:PERSON)_\\d+\\])(\\s*)(${TITLE_WORDS})`, 'g'),
        (_m, label: string, gap: string, title: string) => {
          ctx.found.push('TITLE')
          return `${label}${gap}${labelFor(ctx, 'TITLE', title)}`
        },
      )
  }

  if (rules.transforms?.roundAmounts) next = roundAmounts(next, ctx)
  if (rules.transforms?.shiftDates) next = shiftDates(next, map.dateShiftDays)

  return { text: next, found: ctx.found }
}

const CATEGORY_ALTERNATION =
  'EMAIL|RRN|BRN|CARD|PHONE|ACCOUNT|ADDRESS|PERSON|ORG|TITLE|AMOUNT|NAME'
/**
 * `[PERSON_1]`, `[PERSON 1]`, `［PERSON_1］`, and a bare `PERSON_1` as a whole word. A bracketed
 * label's approximation, `(≈₩12,000,000)`, goes with it: the exact value replaces both.
 */
const LABEL_PATTERN = new RegExp(
  `[\\[［]\\s*(${CATEGORY_ALTERNATION})[_\\s](\\d+)\\s*[\\]］](?:\\s?\\(≈[^)\\n]{0,40}\\))?|(?<![A-Za-z0-9_])(${CATEGORY_ALTERNATION})_(\\d+)(?![A-Za-z0-9_])`,
  'g',
)

export type RestoreResult = {
  text: string
  restored: number
  unmapped: string[]
}

/**
 * Puts the real values back. A label this chat never made is left as written and reported, so
 * the caller can say an answer holds something it could not resolve instead of passing it silently.
 */
export function restoreText(text: string, map: LabelMap): RestoreResult {
  let restored = 0
  const unmapped: string[] = []
  let next = text
  if (/[[［]|_\d/.test(next)) {
    next = next.replace(
      LABEL_PATTERN,
      (
        match,
        bracketCat?: string,
        bracketNum?: string,
        bareCat?: string,
        bareNum?: string,
      ) => {
        const category = bracketCat ?? bareCat ?? ''
        const number = bracketNum ?? bareNum ?? ''
        const value =
          map.byLabel[`[${category}_${number}]`] ??
          (category === 'NAME' ? map.byLabel[`[PERSON_${number}]`] : undefined)
        if (value === undefined) {
          unmapped.push(match)
          return match
        }
        restored += 1
        return value
      },
    )
  }
  if (map.dateShiftDays) next = shiftDates(next, -map.dateShiftDays)
  return { text: next, restored, unmapped }
}

/** Restores every string inside a JSON value: what tool arguments are. */
export function restoreDeep(value: unknown, map: LabelMap): unknown {
  if (typeof value === 'string') return restoreText(value, map).text
  if (Array.isArray(value)) return value.map((item) => restoreDeep(item, map))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        restoreDeep(item, map),
      ]),
    )
  }
  return value
}

/** The system line that keeps labels intact through the answer. Model input, not copy. */
export const LABEL_INSTRUCTION =
  "Private details in this conversation were replaced with labels such as [PERSON_1], [ORG_1] or [ACCOUNT_1]. The same label always means the same person, organisation or detail. Keep every label exactly as written, brackets included, wherever you use that detail, including in tool calls; the real values are filled in on the person's computer. Do not guess what a label stands for. An amount shown as [AMOUNT_1](≈₩12,000,000) is rounded; for exact arithmetic on amounts, percentages or dates, call the privacy_compute tool with the labels, which works on the real values."
