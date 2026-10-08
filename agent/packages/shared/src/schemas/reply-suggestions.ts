/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Reply suggestions: up to three short follow-ups, in the user's voice, rendered as chips under
 * the assistant's last message. Two sources feed the same chips:
 *
 * - the built-in agent's `suggest_replies` tool, whose sentinel output is `{type, replies}`;
 * - an external (ACP) agent that cannot call our tools and instead ends its text with
 *   `[OPTIONS: a | b | c]`. That line is stripped from the text and turned into chips, so it
 *   never reaches the user as raw brackets.
 *
 * Both paths go through `normalizeSuggestedReplies`, so the chip list obeys one rule.
 */

export const MAX_SUGGESTED_REPLIES = 3

export const REPLY_SUGGESTIONS_TYPE = 'reply_suggestions' as const

export interface ReplySuggestions {
  type: typeof REPLY_SUGGESTIONS_TYPE
  replies: string[]
}

/** Trim, drop blanks and case-insensitive duplicates, cap at three. */
export function normalizeSuggestedReplies(
  replies: readonly string[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of replies) {
    const reply = raw.trim()
    if (!reply) continue
    const key = reply.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(reply)
    if (out.length === MAX_SUGGESTED_REPLIES) break
  }
  return out
}

// A whole trailing line (optionally followed by blank lines) of the form `[OPTIONS: a | b]`.
// Anchored to the end so an options line quoted mid-answer is left alone.
const TRAILING_OPTIONS_LINE =
  /(?:^|\n)[ \t]*\[OPTIONS:\s*([^\]\n]*)\][ \t]*\s*$/i

export interface SplitOptionsLineResult {
  /** The text with the options line removed; unchanged when none was found. */
  text: string
  /** Parsed replies, empty when the text carried no usable options line. */
  replies: string[]
}

/**
 * Split a trailing `[OPTIONS: a | b | c]` line off an assistant text. Returns the text untouched
 * and no replies when the line is absent, malformed, or holds no usable option.
 */
export function splitTrailingOptionsLine(text: string): SplitOptionsLineResult {
  const match = TRAILING_OPTIONS_LINE.exec(text)
  if (!match) return { text, replies: [] }
  const replies = normalizeSuggestedReplies(match[1].split('|'))
  if (replies.length === 0) return { text, replies: [] }
  return { text: text.slice(0, match.index).replace(/\s+$/, ''), replies }
}
