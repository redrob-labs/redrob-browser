/**
 * Redrob app bridge -- VENDORED COPY.
 *
 * Source of truth: redrob-code `packages/app-bridge/src/index.ts` plus the app-bridge section of
 * `packages/sdk/js/src/daemon.ts`, folded into one file so an app needs nothing from npm beyond
 * `@redrob-labs/sdk` (already published; only `connectOrStart` is used), `@modelcontextprotocol/sdk`
 * and `zod`. Do not edit here; change it upstream and copy the file again. Protocol:
 * redrob-code `docs/APP-BRIDGE.md`.
 */
import { randomUUID } from "node:crypto"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js"
import { parseWithCompat, toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js"
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { connectOrStart, type DaemonConnection, type DaemonOptions } from "@redrob-labs/sdk/daemon"

/** A JSON Schema object describing the tool's arguments (`type: "object"`). */
export type JsonSchema = { readonly type: "object"; readonly [key: string]: unknown }

/** What a tool handler may answer: a plain string becomes one text content block. */
export type ToolResult = string | CallToolResult

export type ToolDef = {
  /** The app's own tool name; the engine shows it under `app:<name>`. Short and verb-first. */
  readonly name: string
  readonly description: string
  /**
   * The arguments: a zod object schema (v3 or v4, validated before the handler runs) or a JSON
   * Schema object (passed to the engine as is, not validated here). Omitted: no arguments.
   */
  readonly input?: AnySchema | JsonSchema
  readonly handler: (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>
}

export type StartAppBridgeOptions = {
  /** The app's name; normalised by the engine to `[a-z0-9._-]`, at most 64 characters. */
  readonly name: string
  readonly version?: string
  readonly tools: readonly ToolDef[]
  /** A daemon connection to use. Omitted: `connectOrStart(daemon)` from `@redrob-labs/sdk/daemon`. */
  readonly connect?: DaemonConnection
  /** Options for `connectOrStart` when `connect` is not given. */
  readonly daemon?: DaemonOptions
  /** URL path the MCP server answers on. Default `/mcp`. */
  readonly path?: string
}

export type AppBridgeHandle = {
  /** The loopback port the MCP server listens on. */
  readonly port: number
  /** The MCP URL the daemon was given, `http://127.0.0.1:<port>/mcp`. */
  readonly url: string
  /** The current registration id with the daemon; changes after a daemon restart. */
  readonly id: string
  /** Replace the tool set; every connected client is told `tools/list_changed`. */
  readonly setTools: (tools: readonly ToolDef[]) => void
  /** Unregister from the daemon, close every MCP session, stop listening. Safe to call twice. */
  readonly stop: () => Promise<void>
}

const NO_ARGS: JsonSchema = { type: "object", properties: {} }

function isZodSchema(input: AnySchema | JsonSchema): input is AnySchema {
  return typeof input === "object" && input !== null && ("_def" in input || "_zod" in input || "~standard" in input)
}

function inputSchema(def: ToolDef): JsonSchema {
  if (!def.input) return NO_ARGS
  if (isZodSchema(def.input)) return toJsonSchemaCompat(def.input, { strictUnions: true }) as JsonSchema
  return def.input
}

function toCallResult(result: ToolResult): CallToolResult {
  if (typeof result === "string") return { content: [{ type: "text", text: result }] }
  return result
}

function failure(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] }
}

type Session = { readonly server: McpServer; readonly transport: StreamableHTTPServerTransport }

/**
 * Serve `tools` over MCP on 127.0.0.1 and bridge the server into the shared daemon. Resolves once
 * the daemon has accepted the registration; rejects when the daemon cannot be reached or refuses
 * the app (the HTTP server is closed again in that case).
 */
export async function startAppBridge(options: StartAppBridgeOptions): Promise<AppBridgeHandle> {
  const path = options.path ?? "/mcp"
  let tools = new Map(options.tools.map((t) => [t.name, t] as const))
  const sessions = new Map<string, Session>()

  const newServer = (): McpServer => {
    const server = new McpServer(
      { name: options.name, version: options.version ?? "0.0.0" },
      { capabilities: { tools: { listChanged: true } } },
    )
    server.server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [...tools.values()].map((t) => ({ name: t.name, description: t.description, inputSchema: inputSchema(t) })),
    }))
    server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const def = tools.get(request.params.name)
      if (!def) return failure(`Unknown tool: ${request.params.name}`)
      let args: Record<string, unknown> = request.params.arguments ?? {}
      if (def.input && isZodSchema(def.input)) {
        try {
          args = parseWithCompat(def.input, args) as Record<string, unknown>
        } catch (cause) {
          return failure(`Invalid arguments for ${def.name}: ${cause instanceof Error ? cause.message : String(cause)}`)
        }
      }
      try {
        return toCallResult(await def.handler(args))
      } catch (cause) {
        return failure(cause instanceof Error ? cause.message : String(cause))
      }
    })
    return server
  }

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname !== path) {
      res.writeHead(404).end()
      return
    }
    try {
      const sessionId = req.headers["mcp-session-id"]
      if (typeof sessionId === "string") {
        const session = sessions.get(sessionId)
        if (!session) {
          res.writeHead(404, { "content-type": "application/json" }).end(
            JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null }),
          )
          return
        }
        await session.transport.handleRequest(req, res)
        return
      }
      if (req.method !== "POST") {
        res.writeHead(405, { allow: "POST" }).end()
        return
      }
      // No session yet: this must be `initialize`. The transport answers 400 itself when it is not,
      // in which case `onsessioninitialized` never fires and the pair is dropped below.
      const server = newServer()
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { server, transport })
        },
        onsessionclosed: (id) => {
          sessions.delete(id)
        },
      })
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId)
      }
      await server.connect(transport)
      await transport.handleRequest(req, res)
      if (!transport.sessionId) await server.close().catch(() => undefined)
    } catch (cause) {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" }).end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: cause instanceof Error ? cause.message : String(cause) },
            id: null,
          }),
        )
      }
    }
  })

  const port = await new Promise<number>((resolve, reject) => {
    httpServer.once("error", reject)
    httpServer.listen(0, "127.0.0.1", () => resolve((httpServer.address() as AddressInfo).port))
  })
  const mcpUrl = `http://127.0.0.1:${port}${path}`

  const closeAll = async () => {
    const open = [...sessions.values()]
    sessions.clear()
    await Promise.all(open.map((s) => s.server.close().catch(() => undefined)))
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    httpServer.closeAllConnections?.()
  }

  let bridge: Awaited<ReturnType<typeof bridgeApp>>
  try {
    const connection = options.connect ?? (await connectOrStart(options.daemon))
    bridge = await bridgeApp(connection, {
      name: options.name,
      mcpUrl,
      ...(options.version !== undefined ? { version: options.version } : {}),
      tools: [...tools.keys()],
    })
  } catch (cause) {
    await closeAll()
    throw cause
  }

  let stopped = false
  return {
    port,
    url: mcpUrl,
    get id() {
      return bridge.id
    },
    setTools: (next) => {
      tools = new Map(next.map((t) => [t.name, t] as const))
      for (const session of sessions.values()) session.server.sendToolListChanged()
    },
    stop: async () => {
      if (stopped) return
      stopped = true
      await bridge.stop()
      await closeAll()
    },
  }
}

// ---------------------------------------------------------------------------------------------
// The app bridge: hand the daemon the app's own MCP tool server. docs/APP-BRIDGE.md.
// ---------------------------------------------------------------------------------------------

type BridgedApp = {
  readonly id: string
  readonly name: string
  readonly mcpUrl: string
  readonly pid: number
  readonly version?: string
  readonly tools?: readonly string[]
  readonly registeredAt: number
  readonly lastSeen: number
}

type BridgedAppList = { readonly apps: readonly BridgedApp[]; readonly ttlMs: number }

type AppRegistration = { readonly id: string; readonly ttlMs: number }

type AppRegisterInput = {
  /** The app's name; the engine exposes its tools under MCP server `app:<name>`. */
  readonly name: string
  /** The app's MCP server. Must be loopback (127.0.0.1, localhost or [::1]) or the engine answers 400. */
  readonly mcpUrl: string
  readonly pid?: number
  readonly version?: string
  readonly tools?: readonly string[]
}

function appsBase(connection: DaemonConnection): string {
  return `${connection.url.replace(/\/+$/, "")}/v1/apps`
}

async function refuse(response: Response, what: string): Promise<never> {
  const body = await response.text().catch(() => "")
  throw new Error(`The engine refused to ${what} (${response.status})${body ? `: ${body}` : ""}`)
}

const apps = {
  /** `POST /v1/apps/register`. */
  async register(
    connection: DaemonConnection,
    input: AppRegisterInput,
    fetchImpl: typeof fetch = fetch,
  ): Promise<AppRegistration> {
    const response = await fetchImpl(`${appsBase(connection)}/register`, {
      method: "POST",
      headers: { ...connection.headers, "content-type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        mcp_url: input.mcpUrl,
        pid: input.pid ?? process.pid,
        ...(input.version !== undefined ? { version: input.version } : {}),
        ...(input.tools !== undefined ? { tools: input.tools } : {}),
      }),
    })
    if (!response.ok) return refuse(response, "bridge the app")
    return (await response.json()) as AppRegistration
  },

  /** `POST /v1/apps/:id/heartbeat`. Resolves to undefined on 404: the registration is gone, register again. */
  async heartbeat(connection: DaemonConnection, id: string, fetchImpl: typeof fetch = fetch): Promise<BridgedApp | undefined> {
    const response = await fetchImpl(`${appsBase(connection)}/${encodeURIComponent(id)}/heartbeat`, {
      method: "POST",
      headers: connection.headers,
    })
    if (response.status === 404) return undefined
    if (!response.ok) return refuse(response, "keep the bridge alive")
    return (await response.json()) as BridgedApp
  },

  /** `DELETE /v1/apps/:id`. */
  async unregister(connection: DaemonConnection, id: string, fetchImpl: typeof fetch = fetch): Promise<void> {
    const response = await fetchImpl(`${appsBase(connection)}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: connection.headers,
    })
    if (!response.ok && response.status !== 404) return refuse(response, "unbridge the app")
  },

  /** `GET /v1/apps`. */
  async list(connection: DaemonConnection, fetchImpl: typeof fetch = fetch): Promise<BridgedAppList> {
    const response = await fetchImpl(appsBase(connection), { headers: connection.headers })
    if (!response.ok) return refuse(response, "list bridged apps")
    return (await response.json()) as BridgedAppList
  },
}

type AppBridge = {
  /** The current registration id; changes when the bridge had to register again. */
  readonly id: string
  /** Unregister and stop the heartbeat. Safe to call twice. */
  readonly stop: () => Promise<void>
}

/**
 * Register the app's MCP server and keep the registration alive: a heartbeat every third of the
 * daemon's TTL, and a fresh registration when the daemon answers 404 (it restarted, or dropped
 * us). Call `stop()` when the app quits; an app that cannot (it crashed) is dropped after the TTL.
 */
async function bridgeApp(
  connection: DaemonConnection,
  input: AppRegisterInput,
  options: { readonly fetch?: typeof fetch } = {},
): Promise<AppBridge> {
  const fetchImpl = options.fetch ?? fetch
  const registration = await apps.register(connection, input, fetchImpl)
  let id = registration.id
  const every = Math.max(5_000, Math.floor(registration.ttlMs / 3))
  let stopped = false
  const beat = async () => {
    if (stopped) return
    const alive = await apps.heartbeat(connection, id, fetchImpl).catch(() => null)
    if (alive === undefined && !stopped) {
      const again = await apps.register(connection, input, fetchImpl).catch(() => undefined)
      if (again) id = again.id
    }
  }
  const timer = setInterval(() => void beat(), every)
  timer.unref?.()
  return {
    get id() {
      return id
    },
    stop: async () => {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      await apps.unregister(connection, id, fetchImpl).catch(() => undefined)
    },
  }
}
