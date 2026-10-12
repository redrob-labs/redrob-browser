/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * What the claw-server answers, for the claw cockpit's capture scenes. The shapes are the generated DTOs
 * in @browseros/claw-api, so a field the server adds or renames fails the typecheck here first.
 *
 * As in fixtures.ts: what a PERSON or an agent wrote -- task names, summaries, skill bodies -- is in the
 * capture's language; names of sites, tools and harnesses are not translated.
 */

import type {
  CockpitStats,
  ConnectionList,
  Dispatch,
  SessionDetail,
  SessionList,
  SessionSummary,
  SkillDetail,
  SkillList,
} from '@browseros/claw-api'
import { type FixtureLocale, NOW } from './fixtures'

const MIN = 60_000
const HOUR = 60 * MIN

const copy = {
  en: {
    inbox: 'Triage the inbox and draft replies',
    inboxSummary: 'Drafted four replies; two need your signature.',
    prices: 'Compare streaming prices',
    pricesSummary:
      'Netflix, Disney plus, Hulu, Max and Apple TV, cheapest first.',
    booking: 'Book a table for Friday',
    loginReason: 'Sign in to Resy to continue',
    loginDetails: 'The booking page asks for an account.',
    resume: 'the reservation form',
    inboxTab: 'Inbox',
    expense: 'File the May expense report',
    skillDesc: 'Check the inbox and draft what is owed',
    skillBody:
      '# inbox-sweep\n\n1. Open the inbox.\n2. Read every unread thread from the last day.\n3. Draft a reply where one is owed.',
  },
  ko: {
    inbox: '받은편지함 정리하고 답장 초안 쓰기',
    inboxSummary: '답장 초안 네 개를 썼습니다. 두 개는 서명이 필요합니다.',
    prices: '스트리밍 요금 비교',
    pricesSummary:
      'Netflix, Disney plus, Hulu, Max, Apple TV를 저렴한 순으로 정리했습니다.',
    booking: '금요일 저녁 예약하기',
    loginReason: '계속하려면 Resy에 로그인하세요',
    loginDetails: '예약 페이지에서 계정을 요구합니다.',
    resume: '예약 양식',
    inboxTab: '받은편지함',
    expense: '5월 경비 보고서 제출',
    skillDesc: '받은편지함을 확인하고 답할 메일 초안을 쓰기',
    skillBody:
      '# inbox-sweep\n\n1. 받은편지함을 엽니다.\n2. 지난 하루 동안 읽지 않은 스레드를 모두 읽습니다.\n3. 답장이 필요한 곳에 초안을 씁니다.',
  },
} as const

function sessions(c: (typeof copy)[FixtureLocale]): SessionSummary[] {
  return [
    {
      sessionId: 'live-1',
      harness: 'Claude Code',
      color: '#2B52FF',
      slug: 'claude-code',
      label: 'CLAUDE-CODE',
      name: c.inbox,
      site: 'mail.google.com',
      startedAt: NOW - 6 * MIN,
      durationMs: 6 * MIN,
      dispatchCount: 14,
      toolSequence: ['navigate', 'read', 'click', 'type'],
      status: 'live',
      errorCount: 0,
      live: {
        state: 'active',
        browserTabs: [
          {
            browserTabId: 11,
            url: 'https://mail.google.com/mail/u/0/#inbox',
            title: c.inboxTab,
            toolCount: 14,
            lastToolName: 'type',
            lastActivityAt: NOW - 10_000,
            recentTools: [
              { name: 'read', at: NOW - 40_000 },
              { name: 'type', at: NOW - 10_000 },
            ],
          },
        ],
      },
    },
    {
      sessionId: 'live-2',
      harness: 'Codex',
      color: '#8944FF',
      slug: 'codex',
      label: 'CODEX',
      name: c.booking,
      site: 'resy.com',
      startedAt: NOW - 3 * MIN,
      durationMs: 3 * MIN,
      dispatchCount: 6,
      toolSequence: ['navigate', 'click'],
      status: 'live',
      errorCount: 0,
      live: {
        state: 'idle',
        browserTabs: [
          {
            browserTabId: 12,
            url: 'https://resy.com/cities/sf',
            title: 'Resy',
            toolCount: 6,
            recentTools: [{ name: 'click', at: NOW - 60_000 }],
          },
        ],
        helpRequest: {
          requestId: 'help-1',
          reason: c.loginReason,
          details: c.loginDetails,
          resumeHint: c.resume,
          kind: 'login',
          browserTabId: 12,
          url: 'https://resy.com/login',
          requestedAt: NOW - 90_000,
        },
      },
    },
    {
      sessionId: 'done-1',
      harness: 'Cursor',
      color: '#00864A',
      slug: 'cursor',
      label: 'CURSOR',
      name: c.prices,
      site: 'netflix.com',
      taskSummary: c.pricesSummary,
      startedAt: NOW - 2 * HOUR,
      endedAt: NOW - 2 * HOUR + 4 * MIN,
      durationMs: 4 * MIN,
      dispatchCount: 22,
      toolSequence: ['navigate', 'read', 'navigate', 'read'],
      status: 'done',
      errorCount: 0,
      tokenUsage: {
        inputTokenEstimate: 41_000,
        outputTokenEstimate: 3_200,
        totalTokenEstimate: 44_200,
      },
    },
    {
      sessionId: 'failed-1',
      harness: 'Claude Code',
      color: '#2B52FF',
      slug: 'claude-code',
      label: 'CLAUDE-CODE',
      name: c.expense,
      site: 'concur.com',
      startedAt: NOW - 26 * HOUR,
      endedAt: NOW - 26 * HOUR + 9 * MIN,
      durationMs: 9 * MIN,
      dispatchCount: 31,
      toolSequence: ['navigate', 'type', 'click'],
      status: 'failed',
      errorCount: 2,
    },
    {
      sessionId: 'cancelled-1',
      harness: 'OpenCode',
      color: '#AE5100',
      slug: 'opencode',
      label: 'OPENCODE',
      name: c.inbox,
      site: 'mail.google.com',
      startedAt: NOW - 3 * 24 * HOUR,
      endedAt: NOW - 3 * 24 * HOUR + 2 * MIN,
      durationMs: 2 * MIN,
      dispatchCount: 5,
      toolSequence: ['navigate'],
      status: 'cancelled',
      errorCount: 0,
    },
  ]
}

function dispatches(sessionId: string): Dispatch[] {
  const base = NOW - 2 * HOUR
  const steps: [string, string, string][] = [
    ['navigate', 'https://www.netflix.com/signup/planform', 'Netflix plans'],
    ['read', 'https://www.netflix.com/signup/planform', 'Netflix plans'],
    ['navigate', 'https://www.disneyplus.com/', 'Disney+'],
    ['read', 'https://www.disneyplus.com/', 'Disney+'],
    ['click', 'https://www.max.com/plans', 'Max plans'],
  ]
  return steps.map(([toolName, url, title], i) => ({
    dispatchId: i + 1,
    createdAt: base + i * 40_000,
    slug: 'cursor',
    label: 'CURSOR',
    sessionId,
    toolName,
    url,
    title,
    argsJson: JSON.stringify({ url }),
    resultMeta: JSON.stringify({ ok: true }),
    durationMs: 800 + i * 120,
  }))
}

const stats: CockpitStats = {
  hasMeasuredStats: true,
  allTime: {
    browserClawTokenEstimate: 1_240_000,
    screenshotFirstTokenEstimate: 6_900_000,
    rawTokenSavingsEstimate: 5_660_000,
    humanTimeSavedMs: 38 * HOUR,
    sessionCount: 212,
    toolCallCount: 4_830,
  },
  last30Days: {
    browserClawTokenEstimate: 310_000,
    screenshotFirstTokenEstimate: 1_720_000,
    rawTokenSavingsEstimate: 1_410_000,
    humanTimeSavedMs: 9 * HOUR,
    sessionCount: 54,
    toolCallCount: 1_180,
  },
  last7Days: {
    browserClawTokenEstimate: 82_000,
    screenshotFirstTokenEstimate: 455_000,
    rawTokenSavingsEstimate: 373_000,
    humanTimeSavedMs: 2.5 * HOUR,
    sessionCount: 13,
    toolCallCount: 290,
  },
}

function skills(c: (typeof copy)[FixtureLocale]): SkillList {
  return {
    items: [
      {
        name: 'inbox-sweep',
        description: c.skillDesc,
        site: 'mail.google.com',
        origin: 'agent',
        version: 3,
        linkedAgents: ['Claude Code', 'Codex'],
        runCount: 9,
        cleanRunCount: 8,
        firstRunTokens: 52_000,
        latestRunTokens: 11_000,
        lastRunAt: NOW - 6 * MIN,
        createdAt: NOW - 20 * 24 * HOUR,
        updatedAt: NOW - 2 * 24 * HOUR,
        tokenSavings: {
          saved: 369_000,
          otherBrowsers: 468_000,
          used: 99_000,
          measuredRunCount: 8,
        },
      },
      {
        name: 'price-check',
        description: c.prices,
        origin: 'manual',
        version: 1,
        linkedAgents: ['Cursor'],
        runCount: 0,
        cleanRunCount: 0,
        createdAt: NOW - 24 * HOUR,
        updatedAt: NOW - 24 * HOUR,
      },
    ],
  }
}

function skillDetail(c: (typeof copy)[FixtureLocale]): SkillDetail {
  const skill = skills(c).items[0]
  return {
    skill,
    body: c.skillBody,
    tokenSavings: skill.tokenSavings ?? {
      saved: 0,
      otherBrowsers: 0,
      used: 0,
      measuredRunCount: 0,
    },
    runs: [
      {
        id: 'r9',
        skillName: skill.name,
        sessionId: 'live-1',
        runNumber: 9,
        agentId: 'claude-code',
        tokens: 11_000,
        durationMs: 6 * MIN,
        toolCount: 14,
        clean: true,
        createdAt: NOW - 6 * MIN,
      },
      {
        id: 'r8',
        skillName: skill.name,
        sessionId: 'done-1',
        runNumber: 8,
        agentId: 'codex',
        tokens: 12_500,
        durationMs: 5 * MIN,
        toolCount: 16,
        clean: false,
        erroredTool: 'click',
        createdAt: NOW - 26 * HOUR,
      },
    ],
  }
}

const connections: ConnectionList = {
  items: [
    {
      harness: 'Claude Code',
      installed: true,
      configPath: '~/.claude.json',
      message: '',
    },
    {
      harness: 'Codex',
      installed: true,
      configPath: '~/.codex/config.toml',
      message: '',
    },
    { harness: 'Cursor', installed: false, message: '' },
    { harness: 'VS Code', installed: false, message: '' },
  ],
}

/** The claw-server's answer to `method path`, or undefined when the capture has no fixture for it. */
export function clawResponse(
  method: string,
  path: string,
  locale: FixtureLocale,
  query: URLSearchParams = new URLSearchParams(),
): unknown {
  const c = copy[locale]
  const all = sessions(c)
  if (method !== 'GET') {
    if (path === '/api/v1/feedback/invitation') return { eligible: false }
    return undefined
  }
  if (path === '/api/v1/system')
    return {
      product: 'claw-server',
      version: '0.5.0',
      url: '',
      capabilities: {},
    }
  if (path === '/api/v1/cockpit/stats') return stats
  if (path === '/api/v1/feedback/invitation') return { eligible: false }
  if (path === '/api/v1/settings/telemetry')
    return { distinctId: 'capture', enabled: true, consent: true }
  if (path === '/api/v1/audit/storage')
    return {
      usage: {
        recordingBytes: 412 * 2 ** 20,
        screenshotBytes: 96 * 2 ** 20,
        totalBytes: 508 * 2 ** 20,
      },
      retention: { mode: 'deleteAfterDays', days: 30 },
    }
  if (path === '/api/v1/connections') return connections
  if (path === '/api/v1/skills') return skills(c)
  if (path === '/api/v1/skills/inbox-sweep') return skillDetail(c)
  if (path === '/api/v1/skills/inbox-sweep/runs')
    return { items: skillDetail(c).runs }
  if (path === '/api/v1/sessions') {
    // The filters the screens send: Running now asks for status=live, the ledger's chips for the rest.
    const status = query.get('status')
    const site = query.get('site')
    const search = query.get('search')?.toLowerCase()
    const items = all.filter(
      (s) =>
        (!status || s.status === status) &&
        (!site || s.site === site) &&
        (!search || JSON.stringify(s).toLowerCase().includes(search)),
    )
    return { items } satisfies SessionList
  }
  const one = path.match(/^\/api\/v1\/sessions\/([^/]+)$/)
  if (one) {
    const session = all.find((s) => s.sessionId === decodeURIComponent(one[1]))
    return session
      ? ({
          session,
          dispatches: dispatches(session.sessionId),
        } satisfies SessionDetail)
      : undefined
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/screenshots$/.test(path))
    return { items: [] }
  if (/^\/api\/v1\/sessions\/[^/]+\/recording$/.test(path))
    return { hasData: false, complete: false, sizeBytes: 0, tabs: [] }
  return undefined
}

/**
 * The live preview a running card polls (`/sessions/{id}/preview`, a JPEG in the real server): a drawn
 * page instead, the same for every capture, so the cockpit's cards show a frame rather than their
 * empty state. It is pixels, not DOM, so nothing in it is measured.
 */
export function clawPreview(path: string): Response | undefined {
  const m = path.match(/^\/api\/v1\/sessions\/([^/]+)\/preview$/)
  if (!m) return undefined
  const seed = [...m[1]].reduce((n, ch) => n + ch.charCodeAt(0), 0)
  const hue = (seed * 47) % 360
  const rows = Array.from(
    { length: 5 },
    (_, i) =>
      `<rect x="40" y="${150 + i * 64}" width="${560 - ((seed + i * 3) % 5) * 60}" height="18" rx="4" fill="#d9dbe0"/>` +
      `<rect x="40" y="${176 + i * 64}" width="${360 - ((seed + i) % 4) * 50}" height="12" rx="4" fill="#eceef1"/>`,
  ).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
<rect width="1280" height="800" fill="#ffffff"/>
<rect width="1280" height="72" fill="hsl(${hue} 55% 42%)"/>
<rect x="40" y="24" width="160" height="24" rx="6" fill="#ffffff" fill-opacity="0.85"/>
<rect x="40" y="104" width="420" height="26" rx="5" fill="#2b2e35"/>
${rows}
<rect x="720" y="104" width="520" height="340" rx="12" fill="hsl(${hue} 40% 94%)"/>
<rect x="760" y="380" width="160" height="40" rx="8" fill="hsl(${hue} 55% 42%)"/>
</svg>`
  return new Response(svg, {
    headers: {
      'access-control-allow-origin': '*',
      'content-type': 'image/svg+xml',
      'cache-control': 'no-store',
    },
  })
}
