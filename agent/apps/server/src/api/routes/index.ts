import { createDiagnosticsRoute } from './diagnostics'
/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { AcpAgentRuntime } from '../../lib/agents/acp/acp-agent-runtime'
import type { OAuthTokenManager } from '../../lib/clients/oauth/token-manager'
import { JobStore } from '../../lib/jobs/store'
import { PlaybookStore } from '../../lib/playbooks/store'
import { DetectorSource } from '../../lib/privacy/detector-source'
import { PrivacyGate } from '../../lib/privacy/gate'
import { PrivacySettingsStore } from '../../lib/privacy/settings'
import { requireTrustedOrigin } from '../middleware/require-trusted-origin'
import { ConversationRuns } from '../services/conversation-runs'
import type { KlavisService } from '../services/klavis'
import { BrowserMcpModule } from '../services/mcp/browser-mcp-module'
import { setJobReceiptStore } from '../services/mcp/effects/job-receipts'
import { setApplicationRunSource } from '../services/mcp/guards/job-apply'
import { setNeverReadSitesSource } from '../services/mcp/guards/never-read-sites'
import { setPlaybookRunSource } from '../services/mcp/guards/playbook-stops'
import { SmartCompare } from '../services/smart-compare'
import type { Env, HttpServerConfig } from '../types'
import { defaultCorsConfig } from '../utils/cors'
import { requireTrustedAppOrigin } from '../utils/request-auth'
import { createAcpxProbeRoutes } from './acpx-probe'
import { createAgentRoutes } from './agents'
import { createChatRoutes } from './chat'
import { createConversationRoutes } from './conversations'
import { createHealthRoute } from './health'
import { createJobRoutes } from './jobs'
import { createKlavisRoutes } from './klavis'
import { createMcpRoutes } from './mcp'
import { createMcpManagerRoutes } from './mcp-manager'
import { createOAuthRoutes } from './oauth'
import { createPlaybookRoutes } from './playbooks'
import { createPrivacyRoutes } from './privacy'
import { createProviderRoutes } from './provider'
import { createProvidersRoutes } from './providers'
import { createRedrobConsoleRoutes } from './redrob-console'
import { createRefinePromptRoutes } from './refine-prompt'
import { createScheduledJobRunRoutes } from './scheduled-job-runs'
import { createScheduledJobRoutes } from './scheduled-jobs'
import { createShutdownRoute } from './shutdown'
import { createSmartCompareRoutes } from './smart-compare'
import { createStatusRoute } from './status'

interface CreateApiRoutesDeps {
  agentRoutes?: Hono<Env>
  config: HttpServerConfig
  klavis: KlavisService
  onShutdown: () => void
  tokenManager: OAuthTokenManager | null
}

/** Composes the BrowserOS HTTP API from the existing route factories. */
export function createApiRoutes(deps: CreateApiRoutesDeps) {
  const { agentRoutes, config, klavis, onShutdown, tokenManager } = deps
  const { browser, browserosId, browserSession, port, resourcesDir, version } =
    config
  const { activity } = config
  const acpRuntime = new AcpAgentRuntime({ serverPort: port, resourcesDir })
  const conversationRuns = new ConversationRuns({ activity })
  const privacyGate =
    config.privacyGate ??
    new PrivacyGate(
      new PrivacySettingsStore(),
      new DetectorSource({ resourcesDir }),
    )
  setNeverReadSitesSource(() => privacyGate.settings.get().neverReadSites)
  const smartCompare = new SmartCompare(browserSession)
  const playbooks = new PlaybookStore()
  setPlaybookRunSource((id) => playbooks.activeRun(id))
  const jobs = new JobStore()
  setApplicationRunSource((id) => jobs.activeRun(id))
  setJobReceiptStore(jobs)
  // One deep module owns every browser-tool lease and execution effect;
  // both /chat and /mcp must share it for loopback calls to recover context.
  const browserMcp = new BrowserMcpModule({
    version,
    browserSession,
    conversationRuns,
    klavis,
    activity,
  })
  const resolvedAgentRoutes =
    agentRoutes ??
    createAgentRoutes({
      onDelete: (agentId) =>
        acpRuntime.closeAllForAgent(agentId, {
          discardPersistentState: true,
        }),
      onUpdate: (agentId) =>
        acpRuntime.closeAllForAgent(agentId, {
          discardPersistentState: true,
        }),
    })

  return (
    new Hono<Env>()
      .use('/*', cors(defaultCorsConfig))
      .use('/*', requireTrustedOrigin())
      .route('/system/health', createHealthRoute({ browser }))
      .route('/system/diagnostics', createDiagnosticsRoute(version))
      .route('/system/shutdown', createShutdownRoute({ onShutdown }))
      // Compatibility aliases for shipped browsers that still probe root paths
      // while the server binary can update independently during OTA.
      .route('/health', createHealthRoute({ browser }))
      .route('/shutdown', createShutdownRoute({ onShutdown }))
      .route('/status', createStatusRoute({ browser, activity }))
      .route('/oauth', oauthRoutes(tokenManager))
      .route('/klavis', createKlavisRoutes({ klavis }))
      .route(
        '/mcp',
        createMcpRoutes({
          browserMcp,
        }),
      )
      .route(
        '/mcp-manager',
        createMcpManagerRoutes({
          getMcpUrl: () => `http://127.0.0.1:${port}/mcp`,
          klavis,
        }),
      )
      .route(
        '/chat',
        createChatRoutes({
          browser,
          browserMcp,
          browserosId,
          klavis,
          aiSdkDevtoolsEnabled: config.aiSdkDevtoolsEnabled,
          serverPort: port,
          resourcesDir,
          activity,
          acpRuntime,
          conversationRuns,
          privacyGate,
        }),
      )
      // Protected routes. The extension-origin auth middleware is applied per
      // path prefix (Hono's `/prefix/*` also matches the bare list route), so
      // unregistered paths stay 404 and public routes are untouched. Routes are
      // mounted directly; the typed client derives per-route types from the
      // factories (see rpc.ts), not from this composition.
      .use('/acpx/probe/*', requireTrustedAppOrigin())
      .use('/agents/*', requireTrustedAppOrigin())
      .use('/conversations/*', requireTrustedAppOrigin())
      // These carry provider credentials in the clear, so they need the
      // localhost + extension-origin check. The blanket requireTrustedOrigin
      // above only rejects a request that carries a disallowed Origin header;
      // one with no Origin at all passes it. /test-provider reuses a saved
      // credential server-side and /refine-prompt drives an outbound LLM call,
      // so they belong here too.
      .use('/providers/*', requireTrustedAppOrigin())
      .use('/redrob-console/*', requireTrustedAppOrigin())
      .use('/test-provider/*', requireTrustedAppOrigin())
      .use('/refine-prompt/*', requireTrustedAppOrigin())
      .use('/scheduled-jobs/*', requireTrustedAppOrigin())
      .use('/scheduled-job-runs/*', requireTrustedAppOrigin())
      // The names a person asked to keep private are in these settings.
      .use('/privacy/*', requireTrustedAppOrigin())
      // Opens tabs in the person's browser: only the extension may ask.
      .use('/compare/*', requireTrustedAppOrigin())
      .use('/playbooks/*', requireTrustedAppOrigin())
      // The résumé and every answer a person gave about themselves.
      .use('/jobs/*', requireTrustedAppOrigin())
      .route('/acpx/probe', createAcpxProbeRoutes({ resourcesDir }))
      .route('/agents', resolvedAgentRoutes)
      .route('/conversations', createConversationRoutes())
      .route('/providers', createProvidersRoutes())
      .route('/redrob-console', createRedrobConsoleRoutes())
      .route('/test-provider', createProviderRoutes({ browserosId }))
      .route(
        '/refine-prompt',
        createRefinePromptRoutes({ browserosId, privacyGate }),
      )
      .route('/privacy', createPrivacyRoutes({ gate: privacyGate }))
      .route('/compare', createSmartCompareRoutes({ compare: smartCompare }))
      .route('/playbooks', createPlaybookRoutes({ store: playbooks }))
      .route('/jobs', createJobRoutes({ store: jobs }))
      .route('/scheduled-jobs', createScheduledJobRoutes())
      .route('/scheduled-job-runs', createScheduledJobRunRoutes())
  )
}

function oauthRoutes(tokenManager: OAuthTokenManager | null) {
  const app = new Hono<Env>()
  if (tokenManager) return app.route('/', createOAuthRoutes({ tokenManager }))

  return app.all('/*', (c) => c.json({ error: 'OAuth not available' }, 503))
}
