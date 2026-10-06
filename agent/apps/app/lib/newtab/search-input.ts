/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * What the new tab's Search box does with what was typed: open it as an
 * address, or hand it to the browser's default search engine.
 *
 * This is deliberately conservative. Anything with a space is a search, and a
 * bare word with no dot is a search, so "react hooks" and "weather" never turn
 * into a dead http://weather/. An address must either carry a scheme the
 * browser opens, or look like a host (a dot or localhost, an optional port and
 * path).
 */

export type SearchTarget =
  | { kind: 'url'; url: string }
  | { kind: 'search'; text: string }
  | { kind: 'empty' }

const OPENABLE_SCHEMES = new Set([
  'http:',
  'https:',
  'file:',
  'chrome:',
  'about:',
])

// host[:port][/path...]. The host is labels joined by dots with a final
// alphabetic label of 2+ letters, an IPv4 address, or localhost.
const HOST_LIKE =
  /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?::\d{1,5})?(?:[/?#].*)?$/i

export function resolveSearchInput(raw: string): SearchTarget {
  const text = raw.trim()
  if (!text) return { kind: 'empty' }
  if (/\s/.test(text)) return { kind: 'search', text }

  const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(text)?.[1]?.toLowerCase()
  if (scheme && OPENABLE_SCHEMES.has(scheme)) {
    try {
      return { kind: 'url', url: new URL(text).toString() }
    } catch {
      return { kind: 'search', text }
    }
  }

  if (HOST_LIKE.test(text)) {
    const host = text.split(/[:/?#]/, 1)[0].toLowerCase()
    const local = host === 'localhost' || /^(?:127|10|192\.168)\./.test(host)
    try {
      return {
        kind: 'url',
        url: new URL(`${local ? 'http' : 'https'}://${text}`).toString(),
      }
    } catch {
      return { kind: 'search', text }
    }
  }

  return { kind: 'search', text }
}
