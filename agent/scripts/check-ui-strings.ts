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

const ENFORCED = [
  'apps/app-onboard/src',
  'apps/app',
  'apps/claw-onboard/src',
  'apps/claw-app',
]

/**
 * Vendored ai-elements and shadcn files that nothing in the app imports, so no person ever reads their
 * text. They are listed rather than translated; the check below fails the moment one of them is imported
 * from outside the list, so a file cannot start rendering while still skipped. An entry ending in `/` is
 * a whole directory.
 */
const NOT_RENDERED: Record<string, string[]> = {
  'apps/app': [
    'components/ai-elements/artifact.tsx',
    'components/ai-elements/chain-of-thought.tsx',
    'components/ai-elements/context.tsx',
    'components/ai-elements/inline-citation.tsx',
    'components/ai-elements/open-in-chat.tsx',
    'components/ai-elements/plan.tsx',
    'components/ai-elements/prompt-input.tsx',
    'components/ai-elements/sources.tsx',
    'components/ai-elements/tool.tsx',
    'components/ai-elements/web-preview.tsx',
    'components/ui/sidebar.tsx',
  ],
  // claw-app vendors the whole ai-elements kit and renders none of it.
  'apps/claw-app': ['components/ai-elements/'],
}
const skippedIn = (root: string, rel: string) =>
  (NOT_RENDERED[root] ?? []).some((e) =>
    e.endsWith('/') ? rel.startsWith(e) : rel === e,
  )

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
  'lede',
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
  // A table column's header (TanStack's column def).
  'header',
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
  'Moonshot AI',
  'Azure',
  'LM Studio',
  'AWS Bedrock',
  'opencode',
  'OpenCode',
  'pi',
  'Claude Desktop',
  'Cursor',
  'VS Code',
  'Antigravity',
  'Zed',
  // A language named in itself (LangSwitch): never translated into the current one.
  'English',
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
  'Firefox',
  'Safari',
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
  if (node.type === 'ParenthesizedExpression') return sentences(node.expression)
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return SENTENCE.test(node.value.trim())
      ? [{ start: node.start, text: node.value }]
      : []
  }
  if (node.type === 'TemplateLiteral') {
    const text = node.quasis
      .map((q: { value: { cooked: string } }) => q.value.cooked)
      .join('$')
    return SENTENCE.test(text.trim()) || UNIT_PHRASE.test(text.trim())
      ? [{ start: node.start, text }]
      : []
  }
  if (node.type === 'ConditionalExpression')
    return [...sentences(node.consequent), ...sentences(node.alternate)]
  if (node.type === 'LogicalExpression')
    return [...sentences(node.left), ...sentences(node.right)]
  if (node.type === 'BinaryExpression' && node.operator === '+')
    return [...sentences(node.left), ...sentences(node.right)]
  return []
}

/**
 * A choice between two capitalised words (`{editing ? 'Update' : 'Create'}`): single words slip past
 * SENTENCE, but when BOTH branches are a capitalised word it is a label, not an id or a class name.
 */
const WORD = /^[A-Z][a-z]+(\.\.\.|…)?$/
/**
 * A value glued to English (`${n}m ago`, `${n} runs`, ` on ${site}`): lowercase, so SENTENCE never saw it, and it
 * only renders once there is data, so no empty-state capture did either.
 */
const UNIT_PHRASE =
  /^(?=.*\$)(?=.*\b[a-z]{2,}\b)(\$[a-z]{0,3}|[a-z]{2,})(\s+(\$[a-z]{0,3}|[a-z]{2,}))+$/

/**
 * A capitalised word as the fallback beside an element or a value (`{selected ? <Pill/> : 'Status'}`,
 * `{site ?? 'Site'}`): the label shown until a choice is made.
 */
// biome-ignore lint/suspicious/noExplicitAny: an ESTree walk
function fallbackWord(node: any): { start: number; text: string }[] {
  if (node?.type === 'ParenthesizedExpression')
    return fallbackWord(node.expression)
  // biome-ignore lint/suspicious/noExplicitAny: an ESTree walk
  const bare = (b: any): any =>
    b?.type === 'ParenthesizedExpression' ? bare(b.expression) : b
  // biome-ignore lint/suspicious/noExplicitAny: an ESTree walk
  const word = (b: any) =>
    bare(b)?.type === 'Literal' &&
    typeof bare(b).value === 'string' &&
    WORD.test(bare(b).value)
  if (node?.type === 'ConditionalExpression') {
    const out = [node.consequent, node.alternate].filter(word).map(bare)
    return out.length === 1
      ? out.map((b) => ({ start: b.start, text: b.value }))
      : []
  }
  if (
    node?.type === 'LogicalExpression' &&
    ['??', '||'].includes(node.operator)
  )
    return word(node.right)
      ? [{ start: bare(node.right).start, text: bare(node.right).value }]
      : fallbackWord(node.right)
  return []
}
/**
 * Every string a JSX child expression can render (`{run.tokens === undefined ? 'not run' : n}`): a
 * child is always text, so unlike an attribute there is no class name or id to confuse it with, and a
 * lowercase phrase counts as much as a capitalised one.
 */
// biome-ignore lint/suspicious/noExplicitAny: an ESTree walk
function childTexts(node: any): { start: number; text: string }[] {
  if (!node || typeof node !== 'object') return []
  if (node.type === 'ParenthesizedExpression')
    return childTexts(node.expression)
  if (node.type === 'Literal' && typeof node.value === 'string')
    return /[a-z]{3,}/i.test(node.value)
      ? [{ start: node.start, text: node.value }]
      : []
  if (node.type === 'ConditionalExpression')
    return [...childTexts(node.consequent), ...childTexts(node.alternate)]
  if (node.type === 'LogicalExpression')
    return [...childTexts(node.left), ...childTexts(node.right)]
  return []
}
// biome-ignore lint/suspicious/noExplicitAny: an ESTree walk
function wordChoice(node: any): { start: number; text: string }[] {
  if (node?.type !== 'ConditionalExpression') return []
  const pick = [node.consequent, node.alternate]
  return pick.every(
    (b) =>
      b?.type === 'Literal' &&
      typeof b.value === 'string' &&
      WORD.test(b.value),
  )
    ? pick.map((b) => ({ start: b.start, text: b.value }))
    : []
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
    if ((n.type === 'JSXElement' || n.type === 'JSXFragment') && !skipped)
      for (const c of n.children ?? [])
        if (c.type === 'JSXExpressionContainer')
          for (const w of childTexts(c.expression)) report(w.start, w.text)
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
    if (n.type === 'JSXExpressionContainer' && !skipped)
      for (const w of [
        ...wordChoice(n.expression),
        ...fallbackWord(n.expression),
      ])
        report(w.start, w.text)
    if (
      n.type === 'Property' &&
      !n.computed &&
      PROPS.has(n.key?.name ?? n.key?.value)
    )
      for (const w of wordChoice(n.value)) report(w.start, w.text)
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
for (const [root, entries] of Object.entries(NOT_RENDERED)) {
  for await (const other of new Glob('**/*.{ts,tsx}').scan(root)) {
    if (/node_modules|\/dist\/|\.wxt\/|\.output\//.test(other)) continue
    if (skippedIn(root, other)) continue
    const src = readFileSync(`${root}/${other}`, 'utf8')
    for (const e of entries) {
      const stem = e.endsWith('/') ? e : `${e.replace(/\.tsx?$/, '')}'`
      if (src.includes(`/${stem}`))
        findings.push({
          file: `${root}/${other}`,
          line: 1,
          text: `imports ${e}, listed as not rendered: translate it and drop it from NOT_RENDERED`,
        })
    }
  }
}
for (const root of ENFORCED) {
  for await (const rel of new Glob('**/*.{ts,tsx}').scan(root)) {
    if (/\.test\.|\.stories\.|messages\.generated/.test(rel)) continue
    if (/node_modules|\/dist\/|\.wxt\/|\.output\//.test(rel)) continue
    if (skippedIn(root, rel)) continue
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
