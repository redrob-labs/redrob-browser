/**
 * The extension's and the onboarding page's strings, in English and Korean.
 *
 * Every string comes from `l10n/extension/*.tsv` at the repository root, the same one-row-per-string
 * format as the browser's own tables, through `scripts/gen_strings.py` into messages.generated.ts.
 * Never edit that file; `check_repo.py` regenerates it and fails if it differs.
 *
 * Why not chrome.i18n. Two reasons, both disqualifying. The onboarding page is a Chromium WebUI, where
 * `chrome.i18n` does not exist, and one product should not carry two string systems. And chrome.i18n
 * is fixed to the browser's UI language for the life of the process, so the language switch in
 * Settings could not work. The browser's UI language is still the DEFAULT -- it is what
 * navigator.languages reports first -- and a choice made in Settings overrides it.
 *
 * Changing the language reloads the page. Every `t()` runs at render, and a reload is the one way to
 * re-render all of them, including strings already captured in state, without threading a hook through
 * every component.
 */

import { type MessageKey, messages } from './messages.generated'

export type { MessageKey }
export const LOCALES = ['en', 'ko'] as const
export type Locale = (typeof LOCALES)[number]

const STORAGE_KEY = 'redrob.locale'

function stored(): Locale | null {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY)
    return v === 'en' || v === 'ko' ? v : null
  } catch {
    // A sandboxed or private context refuses storage; the browser's language still applies.
    return null
  }
}

/** The Settings choice if one was made, otherwise the first browser language we have strings for. */
export function detectLocale(): Locale {
  const choice = stored()
  if (choice) return choice
  const prefs = globalThis.navigator?.languages ?? [
    globalThis.navigator?.language ?? 'en',
  ]
  for (const lang of prefs) {
    const base = lang.toLowerCase().split('-')[0]
    if (base === 'ko') return 'ko'
    if (base === 'en') return 'en'
  }
  return 'en'
}

let current: Locale = detectLocale()

export function getLocale(): Locale {
  return current
}

/** `null` returns to following the browser's language. Reloads, see the module comment. */
export function setLocale(next: Locale | null): void {
  try {
    if (next) globalThis.localStorage?.setItem(STORAGE_KEY, next)
    else globalThis.localStorage?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to persist into; the reload below still applies the browser's language.
  }
  current = next ?? detectLocale()
  globalThis.location?.reload()
}

/** Whether a language was chosen in Settings, as opposed to inherited from the browser. */
export function hasLocaleChoice(): boolean {
  return stored() !== null
}

/**
 * Sets `<html lang>`. Not cosmetic: the design system breaks Korean lines on words (`[lang="ko"]
 * { word-break: keep-all }`), and a screen reader picks its voice from it.
 */
export function applyDocumentLocale(doc: Document = document): void {
  doc.documentElement.lang = current
}

function lookup(key: MessageKey): string {
  return messages[current][key] ?? messages.en[key] ?? key
}

/** The string for `key` in the current language, with `$1`..`$9` replaced by `subs` in order. */
export function t(key: MessageKey, ...subs: (string | number)[]): string {
  const text = lookup(key)
  if (subs.length === 0) return text
  return text.replace(/\$([1-9])/g, (whole, n: string) => {
    const v = subs[Number(n) - 1]
    return v === undefined ? whole : String(v)
  })
}

/**
 * Like t(), for a sentence that carries elements (generic over the node type, so this package needs no
 * React of its own): `tNodes('helpLink', <a>…</a>)`. The sentence stays
 * one string so a translation can move the element to wherever its grammar needs it -- splitting it
 * around the markup is how a Korean particle ends up detached from its noun.
 */
export function tNodes<N>(key: MessageKey, ...subs: N[]): (string | N)[] {
  const out: (string | N)[] = []
  const text = lookup(key)
  let last = 0
  for (const m of text.matchAll(/\$([1-9])/g)) {
    const index = m.index ?? 0
    if (index > last) out.push(text.slice(last, index))
    const node = subs[Number(m[1]) - 1]
    out.push(node === undefined ? m[0] : node)
    last = index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** English needs a singular and a plural and Korean needs neither: `<key>One` / `<key>Other`. */
export function tCount(base: string, count: number): string {
  const key = (count === 1 ? `${base}One` : `${base}Other`) as MessageKey
  return t(key, count)
}

/** Dates and times in the current language, so a Korean screen does not say "2 hours ago". */
export function formatRelative(
  from: number | Date,
  now: number | Date = Date.now(),
): string {
  const diff = (new Date(from).getTime() - new Date(now).getTime()) / 1000
  const rtf = new Intl.RelativeTimeFormat(current, { numeric: 'auto' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  for (const [unit, seconds] of units) {
    if (Math.abs(diff) >= seconds)
      return rtf.format(Math.round(diff / seconds), unit)
  }
  return rtf.format(Math.round(diff), 'second')
}

export function formatDate(
  value: number | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(current, options).format(new Date(value))
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(current, options).format(value)
}
