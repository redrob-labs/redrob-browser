#!/usr/bin/env bun
/**
 * Fails on a user-visible string written in code instead of in l10n/extension/*.tsv.
 *
 *   bun run check:ui-strings
 *
 * A hard-coded string is not a style problem: it is a screen that is English for a Korean user, on a
 * green build, and the UI capture's `untranslated` count only sees the ones a fixture happens to render.
 * This reads the source, so it also sees the error message, the empty state and the dialog nobody opened.
 *
 * What counts: JSX text with letters in it; a string literal in an attribute a person reads
 * (placeholder, title, aria-label, alt, label, ...); a string literal under one of those keys in an
 * object; and the first argument of toast(). Names of products, providers and platforms are allowed as
 * written. A line can opt out with an `i18n-ignore` comment on it or the line above, for text that is
 * genuinely not language (a keyboard key name, a sample of code).
 *
 * ENFORCED lists the directories already migrated. Each migration PR adds its own, so the gate covers
 * exactly what has been done and cannot be skipped for what has.
 */

import { readFileSync } from 'node:fs'
import { Glob } from 'bun'
import { parseSync } from 'oxc-parser'

const ENFORCED = ['apps/app-onboard/src', 'apps/app/screens/sidepanel']

const ATTRS = new Set([
  'placeholder',
  'title',
  'aria-label',
  'alt',
  'label',
  'description',
  'tooltip',
  'aria-description',
  'emptyMessage',
  'heading',
  'subtitle',
  'confirmText',
  'cancelText',
  'helperText',
  'buttonText',
])
const PROPS = new Set([
  'label',
  'title',
  'description',
  'placeholder',
  'message',
  'emptyMessage',
  'heading',
  'subtitle',
  'tooltip',
  'helperText',
  'buttonText',
  'hint',
])
const SKIP_TAGS = new Set(['code', 'pre', 'kbd', 'Kbd', 'style', 'script'])
// Names stay as written in every language.
const NAMES = new Set([
  'Redrob',
  'Redrob Code',
  'Redrob Console',
  'Redrob Browser',
  'OpenAI',
  'Anthropic',
  'Google',
  'Google Gemini',
  'Gemini',
  'Gemini CLI',
  'Mistral',
  'DeepSeek',
  'xAI Grok',
  'Ollama',
  'OpenRouter',
  'Moonshot Kimi',
  'Qwen',
  'Qwen Code',
  'Cohere',
  'Perplexity',
  'Groq',
  'Claude',
  'Claude Code',
  'Codex',
  'GitHub',
  'GitHub Copilot',
  'OpenClaw',
  'Hermes',
  'Chrome',
  'macOS',
  'Windows',
  'Linux',
  'ChatGPT',
  'MCP',
  'API',
  'URL',
  'OAuth',
])
const LETTERS = /[A-Za-z]{2,}/

interface Finding {
  file: string
  line: number
  text: string
}

const lineOf = (src: string, offset: number) =>
  src.slice(0, offset).split('\n').length

const SENTENCE = /^[A-Z][a-z’']*(\s+[A-Za-z0-9$’'.,:!?-]+)+/

/** Sentence-shaped string literals and template literals in an expression, not descending into JSX or calls. */
// biome-ignore lint/suspicious/noExplicitAny: an ESTree walk
function sentences(node: any): { start: number; text: string }[] {
  if (!node || typeof node !== 'object') return []
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return SENTENCE.test(node.value.trim())
      ? [{ start: node.start, text: node.value }]
      : []
  }
  if (node.type === 'TemplateLiteral') {
    const text = node.quasis
      .map((q: { value: { cooked: string } }) => q.value.cooked)
      .join('$')
    return SENTENCE.test(text.trim()) ? [{ start: node.start, text }] : []
  }
  if (node.type === 'ConditionalExpression')
    return [...sentences(node.consequent), ...sentences(node.alternate)]
  if (node.type === 'LogicalExpression')
    return [...sentences(node.left), ...sentences(node.right)]
  if (node.type === 'BinaryExpression' && node.operator === '+')
    return [...sentences(node.left), ...sentences(node.right)]
  return []
}

function check(file: string): Finding[] {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  const ignored = (line: number) =>
    /i18n-ignore/.test(lines[line - 1] ?? '') ||
    /i18n-ignore/.test(lines[line - 2] ?? '')
  const out: Finding[] = []
  const report = (offset: number, text: string) => {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (!LETTERS.test(clean) || NAMES.has(clean)) return
    const line = lineOf(src, offset)
    if (!ignored(line)) out.push({ file, line, text: clean.slice(0, 70) })
  }
  const tag = (el: {
    openingElement?: {
      name?: { type: string; name?: string; property?: { name: string } }
    }
  }) => {
    const n = el.openingElement?.name
    return n?.type === 'JSXIdentifier'
      ? (n.name ?? '')
      : (n?.property?.name ?? '')
  }

  // biome-ignore lint/suspicious/noExplicitAny: an ESTree walk
  const visit = (n: any, inSkipped: boolean) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const c of n) visit(c, inSkipped)
      return
    }
    const skipped =
      inSkipped || (n.type === 'JSXElement' && SKIP_TAGS.has(tag(n)))
    if (n.type === 'JSXText' && !skipped) report(n.start, n.value)
    if (
      n.type === 'JSXExpressionContainer' &&
      n.expression?.type === 'Literal' &&
      typeof n.expression.value === 'string' &&
      !skipped
    ) {
      report(n.start, n.expression.value)
    }
    if (
      n.type === 'JSXAttribute' &&
      ATTRS.has(n.name?.name) &&
      n.value?.type === 'Literal'
    )
      report(n.value.start, String(n.value.value))
    if (
      n.type === 'Property' &&
      !n.computed &&
      PROPS.has(n.key?.name ?? n.key?.value) &&
      n.value?.type === 'Literal' &&
      typeof n.value.value === 'string'
    ) {
      const v: string = n.value.value
      if (/\s/.test(v) || /^[A-Z][a-z]/.test(v)) report(n.value.start, v)
    }
    // A sentence handed to the UI some other way: returned by a label helper, or chosen inside a JSX
    // expression (`{busy ? 'Looking for profiles' : 'Pick a profile'}`). Only SENTENCE-shaped strings --
    // a capitalised word followed by more words -- so class names, ids and keys never match.
    if (
      n.type === 'ReturnStatement' ||
      (n.type === 'JSXExpressionContainer' && !skipped)
    ) {
      const target = n.type === 'ReturnStatement' ? n.argument : n.expression
      for (const s of sentences(target)) report(s.start, s.text)
    }
    if (n.type === 'CallExpression') {
      const c = n.callee
      const isToast =
        (c?.type === 'Identifier' && c.name === 'toast') ||
        (c?.type === 'MemberExpression' && c.object?.name === 'toast')
      const a0 = n.arguments?.[0]
      if (isToast && a0?.type === 'Literal' && typeof a0.value === 'string')
        report(a0.start, a0.value)
    }
    for (const k in n)
      if (k !== 'parent' && typeof n[k] === 'object') visit(n[k], skipped)
  }
  visit(parseSync(file, src).program, false)
  return out
}

const findings: Finding[] = []
let files = 0
for (const root of ENFORCED) {
  for await (const rel of new Glob('**/*.{ts,tsx}').scan(root)) {
    if (/\.test\.|\.stories\.|messages\.generated/.test(rel)) continue
    files++
    findings.push(...check(`${root}/${rel}`))
  }
}

if (findings.length) {
  for (const f of findings)
    console.error(`${f.file}:${f.line}: hard-coded UI string "${f.text}"`)
  console.error(
    `\n${findings.length} hard-coded string(s). Add a row to l10n/extension/*.tsv, run scripts/gen_strings.py,`,
  )
  console.error(
    "and use t('key') from @browseros/i18n. Mark text that is not language with an i18n-ignore comment.",
  )
  process.exit(1)
}
console.log(
  `check-ui-strings: ${files} file(s) in ${ENFORCED.join(', ')}, no hard-coded UI strings`,
)
