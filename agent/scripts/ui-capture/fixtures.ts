/**
 * Fixture data for the capture harness's stub agent server.
 *
 * Every shape here is the one the CLIENT reads, not a guess at the server: each block names the
 * client file that destructures it. A fixture that drifts from the client renders an empty state or
 * throws, and the harness would then be capturing a screen nobody sees.
 *
 * Times are relative to NOW, which the harness also pins the page clock to, so "2 hours ago" is the
 * same string on every run and a capture can be compared with the last one.
 */

export const NOW = Date.UTC(2026, 9, 9, 9, 0, 0)
const h = (n: number) => NOW - n * 3_600_000

export type FixtureLocale = 'en' | 'ko'

/**
 * What a PERSON wrote -- task names, prompts, chat turns, run results -- is in the person's language, so
 * the Korean captures carry Korean user content. Otherwise every Korean screen would report the fixture's
 * English as untranslated UI. Names of products, providers and third-party catalogues stay as they are
 * served: those reach a Korean user in English too.
 */
const USER: Record<FixtureLocale, Record<string, string>> = {
  en: {
    job1: 'Morning digest',
    job1q: 'Summarise the newest posts on the sites I bookmarked under Reading',
    job2: 'Price watch',
    job2q: 'Check the price of the monitor in my Shopping bookmarks',
    job3: 'Inbox triage',
    job3q: 'List unread messages that ask me for a decision',
    run1: 'Three new posts.',
    run1final:
      'Three new posts since yesterday, two about browser engines and one release note.',
    run1log: 'Opened example.com/reading',
    run2err: 'The mail account is not connected',
    conv1:
      'Compare the three laptops in my open tabs on battery life and weight.',
    conv1a:
      'I read all three product pages. The lightest is 1.12 kg with an 18-hour battery rating; the other two are 1.29 kg and 1.36 kg at 15 and 20 hours. If weight matters most, the first one wins; if battery matters most, the third does.',
    conv2: 'Summarise this PDF in five bullets',
    conv3: 'Fix the failing test in utils.ts',
  },
  ko: {
    job1: '아침 요약',
    job1q: '읽을거리 북마크에 있는 사이트의 새 글을 요약해 줘',
    job2: '가격 확인',
    job2q: '쇼핑 북마크에 있는 모니터 가격을 확인해 줘',
    job3: '받은편지함 정리',
    job3q: '내 결정이 필요한 읽지 않은 메일을 정리해 줘',
    run1: '새 글 세 개.',
    run1final:
      '어제 이후 새 글이 세 개 올라왔습니다. 브라우저 엔진 관련 글이 두 개, 릴리스 노트가 하나입니다.',
    run1log: 'example.com/reading을 열었습니다',
    run2err: '메일 계정이 연결되어 있지 않습니다',
    conv1: '열려 있는 탭의 노트북 세 대를 배터리 시간과 무게로 비교해 줘.',
    conv1a:
      '세 제품 페이지를 모두 읽었습니다. 가장 가벼운 제품은 1.12kg에 배터리 18시간이고, 나머지 두 제품은 1.29kg·15시간, 1.36kg·20시간입니다. 무게가 가장 중요하다면 첫 번째, 배터리가 가장 중요하다면 세 번째 제품이 낫습니다.',
    conv2: '이 PDF를 다섯 줄로 요약해 줘',
    conv3: 'utils.ts에서 실패하는 테스트를 고쳐 줘',
  },
}

const provider = (
  id: string,
  type: string,
  name: string,
  modelId: string,
  contextWindow: number,
) => ({
  id,
  kind: 'llm',
  type,
  name,
  baseUrl: null,
  headers: null,
  modelId,
  supportsImages: true,
  contextWindow,
  temperature: 0.5,
  hasApiKey: true,
  hasAccessKeyId: false,
  hasSecretAccessKey: false,
  hasSessionToken: false,
  resourceName: null,
  region: null,
  reasoningEffort: null,
  reasoningSummary: null,
  createdAt: h(240),
  updatedAt: h(48),
})

const redrob = provider(
  'prov-redrob',
  'redrob-console',
  'Redrob Console',
  'redrob/auto',
  200_000,
)
const second = provider(
  'prov-compatible',
  'openai-compatible',
  'Team gateway',
  'gpt-4o',
  128_000,
)

const text = (id: string, role: 'user' | 'assistant', value: string) => ({
  id,
  role,
  parts: [{ type: 'text', text: value }],
})

export function fixturesFor(locale: FixtureLocale): Record<string, unknown> {
  const u = USER[locale]
  const conversationMessages = [
    text('u1', 'user', u.conv1),
    text('a1', 'assistant', u.conv1a),
  ]

  // Path → JSON body. `apps/app` destructures one wrapper key per route; none returns a bare array.
  return {
    // modules/llm-providers/llm-providers.api.ts
    '/providers': { providers: [redrob, second] },
    '/providers/default': { provider: redrob },
    // modules/schedules/schedules.api.ts
    '/scheduled-jobs': {
      jobs: [
        {
          id: 'job-1',
          name: u.job1,
          query: u.job1q,
          scheduleType: 'daily',
          scheduleTime: '09:00',
          scheduleInterval: null,
          enabled: true,
          providerId: 'prov-redrob',
          lastRunAt: h(24),
          createdAt: h(400),
          updatedAt: h(24),
        },
        {
          id: 'job-2',
          name: u.job2,
          query: u.job2q,
          scheduleType: 'hourly',
          scheduleTime: null,
          scheduleInterval: null,
          enabled: false,
          providerId: null,
          lastRunAt: null,
          createdAt: h(200),
          updatedAt: h(200),
        },
        {
          id: 'job-3',
          name: u.job3,
          query: u.job3q,
          scheduleType: 'minutes',
          scheduleTime: null,
          scheduleInterval: 30,
          enabled: true,
          providerId: 'prov-compatible',
          lastRunAt: h(1),
          createdAt: h(100),
          updatedAt: h(1),
        },
      ],
    },
    '/scheduled-job-runs': {
      runs: [
        {
          id: 'run-1',
          jobId: 'job-1',
          status: 'completed',
          startedAt: h(24),
          completedAt: h(24) + 62_000,
          result: u.run1,
          finalResult: u.run1final,
          executionLog: u.run1log,
          toolCalls: [
            {
              id: 'tc-1',
              name: 'navigate_page',
              input: { url: 'https://example.com/reading' },
              output: { ok: true },
              timestamp: new Date(h(24) + 5_000).toISOString(),
            },
          ],
          error: null,
        },
        {
          id: 'run-2',
          jobId: 'job-3',
          status: 'failed',
          startedAt: h(2),
          completedAt: h(2) + 12_000,
          result: null,
          finalResult: null,
          executionLog: null,
          toolCalls: null,
          error: u.run2err,
        },
        {
          id: 'run-3',
          jobId: 'job-3',
          status: 'running',
          startedAt: h(0.1),
          completedAt: null,
          result: null,
          finalResult: null,
          executionLog: null,
          toolCalls: null,
          error: null,
        },
      ],
    },
    // modules/mcp/managed-mcp-servers.hooks.ts -- `servers` must be an array: ConnectMCP filters it.
    '/klavis/servers': {
      servers: [
        { name: 'Gmail', description: 'Read, search and send email' },
        { name: 'Google Calendar', description: 'Read and manage events' },
        { name: 'Slack', description: 'Read channels and send messages' },
        { name: 'Notion', description: 'Search and edit pages' },
      ],
      count: 4,
    },
    '/klavis/user-integrations': {
      integrations: [
        { name: 'Gmail', is_authenticated: true },
        { name: 'Slack', is_authenticated: false },
      ],
      count: 2,
    },
    // modules/agents/agents.hooks.ts
    '/agents': {
      agents: [
        {
          id: 'agent-code',
          name: 'Redrob Code',
          type: 'custom',
          workingDirectory: '/home/user/projects/site',
          createdAt: h(300),
          updatedAt: h(30),
        },
      ],
    },
    // modules/conversations/conversations.hooks.ts
    '/conversations': {
      conversations: [
        {
          id: 'conv-1',
          lastUserMessage: u.conv1,
          targetType: 'browseros',
          lastMessagedAt: h(0.5),
          createdAt: h(0.6),
          updatedAt: h(0.5),
        },
        {
          id: 'conv-2',
          lastUserMessage: u.conv2,
          targetType: 'browseros',
          lastMessagedAt: h(26),
          createdAt: h(26),
          updatedAt: h(26),
        },
        {
          id: 'conv-3',
          lastUserMessage: u.conv3,
          targetType: 'custom',
          agentId: 'agent-code',
          lastMessagedAt: h(80),
          createdAt: h(80),
          updatedAt: h(80),
        },
      ],
    },
    '/conversations/conv-1': {
      conversation: {
        id: 'conv-1',
        targetType: 'browseros',
        lastUserMessage: conversationMessages[0].parts[0].text,
        lastMessagedAt: h(0.5),
        createdAt: h(0.6),
        updatedAt: h(0.5),
        messages: conversationMessages,
      },
    },
    // screens/mcp-settings/*.hooks.ts
    '/mcp-manager/tools': {
      tools: [
        { name: 'navigate_page', description: 'Open a URL in the active tab' },
        { name: 'take_screenshot', description: 'Capture the visible page' },
        { name: 'read_page', description: 'Read the text of the active tab' },
      ],
    },
    '/mcp-manager/agents': {
      agents: [
        {
          id: 'redrob-code',
          displayName: 'Redrob Code',
          installed: true,
          linked: true,
          configPath: '~/.config/redrob/mcp.json',
        },
        {
          id: 'editor',
          displayName: 'Code editor',
          installed: true,
          linked: false,
          configPath: '~/.editor/mcp.json',
        },
      ],
    },
    '/health': { status: 'ok', cdpConnected: true },
    '/system/health': { status: 'ok', cdpConnected: true },
    '/status': { status: 'ok', cdpConnected: true, can_update: false },
    '/system/diagnostics': { version: '0.1.6', os: 'Linux', osVersion: '6.1' },
  }
}

/** OAuth status is per provider and bare (modules/llm-providers/oauth-status.hooks.ts). */
export const oauthStatus = (provider: string) => ({
  authenticated: false,
  provider,
})

/** POST /acpx/probe, bare (modules/agents/acp-agent-probe.hooks.ts). */
export const acpProbe = {
  models: [{ id: 'redrob/auto', name: 'Redrob Auto' }],
  reasoning: { values: ['low', 'medium', 'high'], defaultValue: 'medium' },
  supportsConfigOption: true,
  agentInfo: { name: 'redrob-code', title: 'Redrob Code', version: '1.0.0' },
  protocolVersion: 1,
}

/** chrome.storage.local seeded before any page loads, so no first-run popup covers a screen. */
export const storageSeed: Record<string, unknown> = {
  firstRunConfettiShown: true,
  importHintDismissedAt: NOW,
  changelogShownVersions: [
    '0.1.0',
    '0.1.1',
    '0.1.2',
    '0.1.3',
    '0.1.4',
    '0.1.5',
    '0.1.6',
  ],
}
