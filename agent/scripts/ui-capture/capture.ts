#!/usr/bin/env bun
/**
 * Captures every screen of the extension, the onboarding page and the claw cockpit, in both themes and
 * both languages,
 * measures each against the design system, and holds the result to a committed baseline.
 *
 *   bun run ui:capture                    capture, compare with baseline.json, exit 1 on any change
 *   bun run ui:capture --update-baseline  capture and rewrite baseline.json
 *   bun run ui:capture --only settings    only the surfaces whose id contains "settings"
 *
 * Needs the built apps (`bun run build:agent`, `bun run build:app-onboard`, and `bun run build` in
 * apps/claw-app) and Playwright's Chromium
 * (`bunx playwright install chromium`). Writes screenshots and report.{json,md} to `.ui-capture/`.
 *
 * WHY A RATCHET. Today's screens are off the design system, so a gate that demanded zero findings would
 * fail on every pull request and teach everyone to ignore it. baseline.json records today's counts
 * instead. A count that RISES fails: that is a regression. A count that FALLS also fails until the
 * baseline is rewritten in the same pull request: a baseline that is higher than reality silently
 * permits the fixed defect to come back, which is the same rule check 8 applies to its exemptions.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { type BrowserContext, chromium, type Page } from 'playwright'
import { type AuditResult, audit, type Finding, focusedRing } from './audit'
import { NOW, storageSeed } from './fixtures'
import { startStaticServer, startStubServer } from './server'
import { browserShim } from './shim'

const AGENT = resolve(import.meta.dir, '..', '..')
const EXTENSION = join(AGENT, 'apps/app/dist/chrome-mv3')
const ONBOARD = join(AGENT, 'apps/app-onboard/dist')
const CLAW = join(AGENT, 'apps/claw-app/dist/chrome-mv3')
const TOKENS = resolve(AGENT, '..', 'redrob/design_tokens.json')
const BASELINE = join(import.meta.dir, 'baseline.json')
const OUT = join(AGENT, '.ui-capture')

type Theme = 'light' | 'dark'
type Locale = 'en' | 'ko'
type Metrics = Record<(typeof METRICS)[number], number>

const METRICS = [
  'offPalette',
  'contrast',
  'focusMissing',
  'roundIcons',
  'foreignIcons',
  'untranslated',
  'fonts',
] as const

interface Surface {
  id: string
  kind: 'extension' | 'onboarding' | 'claw'
  path: string
  width: number
  height: number
  /** Onboarding steps are reached by pressing the primary action this many times. */
  advance?: number
  /**
   * An overlay opened through real input before measuring: a menu, a dialog, a tooltip. A resting screen
   * never shows one, so without these the overlays were never measured at all.
   */
  open?: { click?: string; hover?: string; wait: string }
}

const page = (id: string, path: string): Surface => ({
  id,
  kind: 'extension',
  path: `app.html#${path}`,
  width: 1280,
  height: 800,
})
/**
 * A claw cockpit screen. Its own extension in its own context, reading the same stub server through the
 * same port pref, so the screens are populated: running and finished sessions, skills, connections.
 */
const claw = (id: string, path: string): Surface => ({
  id,
  kind: 'claw',
  path: `newtab.html#${path}`,
  width: 1280,
  height: 800,
})
const SURFACES: Surface[] = [
  page('home', '/home'),
  page('home-chat', '/home/chat'),
  // A conversation with both voices in it, restored from the fixtures, so message bubbles are measured.
  page('chat-conversation', '/home/chat?conversationId=conv-1'),
  page('home-personalize', '/home/personalize'),
  page('scheduled', '/scheduled'),
  page('connect-apps', '/connect-apps'),
  page('settings-ai', '/settings/ai'),
  page('settings-chat', '/settings/chat'),
  page('settings-mcp', '/settings/mcp'),
  page('settings-customization', '/settings/customization'),
  page('settings-diagnostics', '/settings/diagnostics'),
  page('settings-search', '/settings/search'),
  page('onboarding-ai', '/onboarding/ai'),
  {
    ...page('overlay-menu', '/settings/ai'),
    open: {
      // The row's actions button, by its name in either language (stActionsFor).
      click:
        '[aria-label="Actions for Team gateway"], [aria-label="Team gateway 작업"]',
      wait: '[role="menu"]',
    },
  },
  {
    ...page('overlay-dialog', '/scheduled'),
    open: {
      click: 'button:has-text("New Task"), button:has-text("새 작업")',
      wait: '[role="dialog"]',
    },
  },
  {
    // A message action's tooltip (Copy), in the restored conversation. The app sidebar's tooltips render
    // only while it is folded, and hover or focus unfolds it; the side panel's mode switch is named by
    // title, as the system's ComposerMode is, so neither can stand in.
    ...page('overlay-tooltip', '/home/chat?conversationId=conv-1'),
    open: {
      hover: '[data-slot="tooltip-trigger"]:has(.sr-only):visible',
      wait: '[data-slot="tooltip-content"]',
    },
  },
  {
    id: 'sidepanel-chat',
    kind: 'extension',
    path: 'sidepanel.html',
    width: 400,
    height: 800,
  },
  {
    id: 'sidepanel-history',
    kind: 'extension',
    path: 'sidepanel.html#/history',
    width: 400,
    height: 800,
  },
  {
    id: 'onboard-welcome',
    kind: 'onboarding',
    path: '/',
    width: 1280,
    height: 800,
    advance: 0,
  },
  {
    id: 'onboard-import',
    kind: 'onboarding',
    path: '/',
    width: 1280,
    height: 800,
    advance: 1,
  },
  {
    id: 'onboard-agent',
    kind: 'onboarding',
    path: '/',
    width: 1280,
    height: 800,
    advance: 2,
  },
  claw('claw-cockpit', '/'),
  claw('claw-audit', '/audit'),
  claw('claw-task', '/audit/done-1'),
  claw('claw-skills', '/skills'),
  claw('claw-skill', '/skills/inbox-sweep'),
  claw('claw-mcp', '/mcp'),
]

const args = process.argv.slice(2)
const updateBaseline = args.includes('--update-baseline')
const only = args.includes('--only')
  ? args[args.indexOf('--only') + 1]
  : undefined

/** Every colour token for one theme as "r,g,b,a", the form audit() normalises computed colours to. */
function palette(theme: Theme): string[] {
  const data = JSON.parse(readFileSync(TOKENS, 'utf8')) as {
    tokens: { kind: string; light: string; dark: string }[]
  }
  const out = new Set<string>(['255,255,255,1', '0,0,0,1'])
  for (const t of data.tokens) {
    if (t.kind !== 'color') continue
    const v = t[theme].trim()
    const hex = v.match(/^#([0-9a-f]{3,8})$/i)
    if (hex) {
      let x = hex[1]
      if (x.length <= 4) x = [...x].map((c) => c + c).join('')
      const n = (i: number) => parseInt(x.slice(i, i + 2), 16)
      const a = x.length === 8 ? Number((n(6) / 255).toFixed(2)) : 1
      out.add(`${n(0)},${n(2)},${n(4)},${a}`)
      continue
    }
    const rgba = v.match(/^rgba?\(([^)]+)\)$/)
    if (rgba) {
      const p = rgba[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number)
      out.add(`${p[0]},${p[1]},${p[2]},${Number((p[3] ?? 1).toFixed(2))}`)
    }
  }
  return [...out]
}

/**
 * Waits until the page has stopped changing, not for a fixed time. Lists load through SWR and animate
 * in, so a fixed pause measures a different frame on a slower host -- which is exactly how the first
 * hosted run disagreed with the host that wrote the baseline by one list row.
 */
/** How long the stub server has been idle; replaced once it is running. */
let serverIdleFor = () => Number.POSITIVE_INFINITY

async function settle(p: Page) {
  // Data first: a screen whose second request arrives after the DOM has gone quiet (a list's labels
  // fetched separately from the list) was captured with or without them depending on the host.
  for (let waited = 0; serverIdleFor() < 800 && waited < 8000; waited += 100)
    await p.waitForTimeout(100)
  await p.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  await p.evaluate(() => document.fonts.ready.then(() => undefined))
  await p.evaluate(
    () =>
      new Promise<void>((done) => {
        const quietFor = 600
        let timer = setTimeout(finish, quietFor)
        const observer = new MutationObserver(() => {
          clearTimeout(timer)
          timer = setTimeout(finish, quietFor)
        })
        const cap = setTimeout(finish, 8000)
        function finish() {
          observer.disconnect()
          clearTimeout(cap)
          done()
        }
        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        })
      }),
  )
  // Then let any running animation land; under reduced motion that is all of them at once.
  // Infinite ones (a spinner) never finish and are skipped.
  await p.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) =>
          Number.isFinite(
            a.effect?.getComputedTiming().endTime ?? Number.POSITIVE_INFINITY,
          ),
        )
        .map((a) => a.finished.catch(() => undefined)),
    ).then(() => undefined),
  )
}

async function focus(p: Page): Promise<Finding[]> {
  await p
    .locator('body')
    .click({ position: { x: 1, y: 1 } })
    .catch(() => {})
  // A ring drawn with a transitioning box-shadow reads as whatever frame the transition is on when it is
  // sampled, which made this count differ by host speed. With transitions off the read is the end state.
  await p
    .addStyleTag({
      content:
        '*,*::before,*::after{transition:none!important;animation-duration:0s!important}',
    })
    .catch(() => {})
  const misses = new Map<string, Finding>()
  const seen = new Set<string>()
  for (let i = 0; i < 25; i++) {
    await p.keyboard.press('Tab')
    await p.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    )
    const r = await p.evaluate(focusedRing)
    if (!r) break
    if (seen.has(r.key)) break
    seen.add(r.key)
    if (!r.ring) misses.set(r.key, r.finding)
  }
  return [...misses.values()]
}

async function openContext(
  theme: Theme,
  locale: Locale,
  port: number,
  ext = EXTENSION,
) {
  const dir = join(OUT, `.profile-${profileName(ext)}-${theme}-${locale}`)
  rmSync(dir, { recursive: true, force: true })
  const ctx = await chromium.launchPersistentContext(dir, {
    headless: true,
    channel: 'chromium',
    locale: locale === 'ko' ? 'ko-KR' : 'en-US',
    colorScheme: theme,
    reducedMotion: 'reduce',
    args: [
      `--disable-extensions-except=${ext}`,
      `--load-extension=${ext}`,
      `--lang=${locale === 'ko' ? 'ko' : 'en-US'}`,
    ],
  })
  await ctx.addInitScript(browserShim(port, theme))
  let [sw] = ctx.serviceWorkers()
  if (!sw) sw = await ctx.waitForEvent('serviceworker')
  const id = new URL(sw.url()).host
  if (ext !== EXTENSION) return { ctx, id, dir }
  // Seeded from an extension page: Playwright's service-worker evaluate does not see `chrome.storage`.
  const seeder = await ctx.newPage()
  await seeder.goto(`chrome-extension://${id}/manifest.json`)
  await seeder.evaluate(
    (seed) =>
      (
        globalThis as unknown as {
          chrome: { storage: { local: { set(v: object): Promise<void> } } }
        }
      ).chrome.storage.local.set(seed),
    storageSeed,
  )
  await seeder.close()
  return { ctx, id, dir }
}

const profileName = (ext: string) => (ext === CLAW ? 'claw' : 'app')

async function advanceOnboarding(p: Page, times: number) {
  for (let i = 0; i < times; i++) {
    // Welcome's primary action, then the import step's "skip" -- the path that needs no import source.
    const name = i === 0 ? /get started|시작/i : /skip|건너뛰기|나중에/i
    await p.getByRole('button', { name }).first().click({ timeout: 5000 })
    await settle(p)
  }
}

async function captureOne(
  ctx: BrowserContext,
  s: Surface,
  base: string,
  theme: Theme,
  locale: Locale,
) {
  const p = await ctx.newPage()
  await p.setViewportSize({ width: s.width, height: s.height })
  await p.clock.setFixedTime(NOW)
  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(e.message.slice(0, 200)))
  await p.goto(
    s.kind === 'onboarding' ? `${base}${s.path}` : `${base}/${s.path}`,
  )
  await settle(p)
  if (s.advance) await advanceOnboarding(p, s.advance)
  if (s.open) {
    const target = p.locator(s.open.click ?? s.open.hover ?? '').first()
    if (s.open.click) await target.click()
    else {
      await target.hover()
    }
    await p
      .locator(s.open.wait)
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
    await settle(p)
  }
  const name = `${s.id}.${theme}.${locale}.png`
  await p.screenshot({ path: join(OUT, name), fullPage: false })
  const found: AuditResult = await p.evaluate(audit, {
    palette: palette(theme),
    locale,
  })
  // Tabbing would move focus out of, and close, the overlay being measured.
  const focusFindings = s.open ? [] : await focus(p)
  await p.close()
  // Naming Pretendard is not using it: with no face loaded the stack falls through to the platform font
  // in silence. So the check is a LOADED Pretendard face, plus every face that failed to load.
  const pretendardLoaded =
    /^pretendard$/i.test(found.fonts.family) &&
    found.fonts.loaded.some((f) => /^Pretendard /.test(f))
  // Plus every place Hangul is set in a stack without Pretendard: with no Hangul in that face the text
  // draws as empty boxes, which the loaded faces above never show.
  const fontFail =
    found.fonts.failed.length +
    (pretendardLoaded ? 0 : 1) +
    found.hangulFace.length
  const metrics: Metrics = {
    offPalette: found.offPalette.length,
    contrast: found.contrast.length,
    focusMissing: focusFindings.length,
    roundIcons: found.roundIcons.length,
    foreignIcons: found.foreignIcons.length,
    untranslated: found.untranslated.length,
    fonts: fontFail,
  }
  return {
    id: `${s.id}.${theme}.${locale}`,
    screenshot: name,
    metrics,
    errors,
    findings: {
      offPalette: found.offPalette,
      contrast: found.contrast,
      focusMissing: focusFindings,
      roundIcons: found.roundIcons,
      foreignIcons: found.foreignIcons,
      untranslated: found.untranslated,
      fonts: [
        {
          what: `body family ${found.fonts.family}; failed: ${found.fonts.failed.join(', ') || 'none'}`,
          where: found.fonts.loaded.join(', '),
        },
        ...found.hangulFace,
      ],
    },
  }
}

type Result = Awaited<ReturnType<typeof captureOne>>

/** Every surface of one extension, in one theme and language, from a fresh profile. */
async function captureContext(
  ext: string,
  surfaces: Surface[],
  theme: Theme,
  locale: Locale,
  stubPort: number,
  onboardPort: number,
): Promise<Result[]> {
  const out: Result[] = []
  const { ctx, id, dir } = await openContext(theme, locale, stubPort, ext)
  for (const s of surfaces) {
    const base =
      s.kind === 'onboarding'
        ? `http://127.0.0.1:${onboardPort}`
        : `chrome-extension://${id}`
    try {
      const r = await captureOne(ctx, s, base, theme, locale)
      out.push(r)
      console.log(
        `${r.id.padEnd(40)} ${METRICS.map((m) => `${m}=${r.metrics[m]}`).join(' ')}`,
      )
    } catch (e) {
      console.error(
        `${s.id}.${theme}.${locale}: capture failed: ${(e as Error).message.split('\n')[0]}`,
      )
      process.exitCode = 1
    }
  }
  await ctx.close()
  rmSync(dir, { recursive: true, force: true })
  return out
}

async function main() {
  for (const [dir, cmd] of [
    [EXTENSION, 'bun run build:agent'],
    [ONBOARD, 'bun run build:app-onboard'],
    [CLAW, 'cd apps/claw-app && bun run build'],
  ] as const) {
    if (
      !(await Bun.file(
        join(dir, dir === ONBOARD ? 'index.html' : 'manifest.json'),
      ).exists())
    ) {
      console.error(`missing ${dir}: run \`${cmd}\` first`)
      process.exit(2)
    }
  }
  mkdirSync(OUT, { recursive: true })
  const stub = startStubServer()
  serverIdleFor = stub.idleFor
  const onboard = startStaticServer(ONBOARD)
  const surfaces = SURFACES.filter((s) => !only || s.id.includes(only))
  const results: Result[] = []

  for (const theme of ['light', 'dark'] as const) {
    for (const locale of ['en', 'ko'] as const) {
      stub.setLocale(locale)
      for (const ext of [EXTENSION, CLAW]) {
        const mine = surfaces.filter(
          (s) => (s.kind === 'claw') === (ext === CLAW),
        )
        if (!mine.length) continue
        results.push(
          ...(await captureContext(
            ext,
            mine,
            theme,
            locale,
            stub.port,
            onboard.port,
          )),
        )
      }
    }
  }
  stub.stop()
  onboard.stop()

  writeFileSync(
    join(OUT, 'report.json'),
    `${JSON.stringify({ results, unknownRoutes: [...stub.unknown] }, null, 2)}\n`,
  )
  writeFileSync(join(OUT, 'report.md'), report(results, [...stub.unknown]))

  const current = Object.fromEntries(results.map((r) => [r.id, r.metrics]))
  if (updateBaseline) {
    const merged = only ? { ...readBaseline(), ...current } : current
    writeFileSync(BASELINE, `${JSON.stringify(sortKeys(merged), null, 2)}\n`)
    console.log(
      `\nbaseline.json rewritten: ${Object.keys(merged).length} capture(s)`,
    )
    return
  }
  const problems = compare(readBaseline(), current, only)
  if (problems.length) {
    console.error(`\n${problems.length} difference(s) from baseline.json:`)
    for (const p of problems) console.error(`  ${p}`)
    console.error(
      '\nA rise is a regression. A fall is progress: rewrite the baseline in this PR with --update-baseline.',
    )
    process.exitCode = 1
  } else {
    console.log(`\nmatches baseline.json (${results.length} capture(s))`)
  }
}

function readBaseline(): Record<string, Metrics> {
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8'))
  } catch {
    return {}
  }
}

function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(o).sort(([a], [b]) => a.localeCompare(b)),
  )
}

function compare(
  base: Record<string, Metrics>,
  current: Record<string, Metrics>,
  filter?: string,
): string[] {
  const out: string[] = []
  for (const [id, m] of Object.entries(current)) {
    const b = base[id]
    if (!b) {
      out.push(`${id}: not in the baseline`)
      continue
    }
    for (const k of METRICS) {
      if (m[k] > b[k]) out.push(`${id} ${k}: ${b[k]} -> ${m[k]} (regression)`)
      else if (m[k] < b[k])
        out.push(
          `${id} ${k}: ${b[k]} -> ${m[k]} (improved; lower the baseline)`,
        )
    }
  }
  for (const id of Object.keys(base)) {
    if (!(id in current) && (!filter || id.includes(filter)))
      out.push(`${id}: in the baseline but not captured`)
  }
  return out
}

function report(results: Result[], unknown: [string, number][]): string {
  const lines = [
    '# UI capture report',
    '',
    `| capture | ${METRICS.join(' | ')} | errors |`,
    `|---|${METRICS.map(() => '---:').join('|')}|---:|`,
  ]
  for (const r of results)
    lines.push(
      `| ${r.id} | ${METRICS.map((m) => r.metrics[m]).join(' | ')} | ${r.errors.length} |`,
    )
  const totals = METRICS.map((m) =>
    results.reduce((n, r) => n + r.metrics[m], 0),
  )
  lines.push(
    `| **total** | ${totals.join(' | ')} | ${results.reduce((n, r) => n + r.errors.length, 0)} |`,
    '',
  )
  if (unknown.length)
    lines.push(
      '## Routes the fixtures do not answer',
      '',
      ...unknown.map(([k, n]) => `- \`${k}\` x${n}`),
      '',
    )
  lines.push('## Findings', '')
  for (const r of results) {
    const any =
      METRICS.some((m) => r.findings[m].length && m !== 'fonts') ||
      r.metrics.fonts
    if (!any && !r.errors.length) continue
    lines.push(`### ${r.id}`, '', `![](${r.screenshot})`, '')
    for (const m of METRICS) {
      if (!r.metrics[m]) continue
      lines.push(`- **${m}**`)
      for (const f of r.findings[m].slice(0, 12))
        lines.push(`  - ${f.what} — \`${f.where}\``)
      if (r.findings[m].length > 12)
        lines.push(`  - … ${r.findings[m].length - 12} more`)
    }
    for (const e of r.errors) lines.push(`- **page error** ${e}`)
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

await main()
