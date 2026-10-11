/**
 * A stub agent server: fixtures for every route a screen reads on load, nothing else.
 *
 * It is a stub and not the real `apps/server` because the real one needs a model credential, a CDP
 * connection and a database before any screen has content, and a capture that depends on those is a
 * capture of whatever state the host happened to be in. Unknown routes answer 404 and are recorded, so
 * a screen that starts reading a new route shows up in the report instead of silently rendering empty.
 */

import {
  acpProbe,
  comparisonFor,
  type FixtureLocale,
  fixturesFor,
  oauthStatus,
} from './fixtures'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
}

export interface StubServer {
  port: number
  unknown: Map<string, number>
  /** The language the next captures are in; user-authored fixture content follows it. */
  setLocale(locale: FixtureLocale): void
  /** Route bodies for one scene only, laid over the locale's fixtures; null clears them. */
  override(routes: Record<string, unknown> | null): void
  /** Milliseconds since the last request arrived, so a capture can wait for the screen's data to land. */
  idleFor(): number
  stop(): void
}

export function startStubServer(): StubServer {
  const unknown = new Map<string, number>()
  let json = fixturesFor('en')
  let base = json
  let last = Date.now()
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    idleTimeout: 0,
    fetch(req) {
      last = Date.now()
      const url = new URL(req.url)
      const path = url.pathname
      if (req.method === 'OPTIONS')
        return new Response(null, { status: 204, headers: cors })

      if (req.method === 'GET' && path === '/chat/panels') {
        // SSE: one empty assignment set, then held open the way the real server holds it.
        const body = new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: {"assignments":[]}\n\n'))
          },
        })
        return new Response(body, {
          headers: { ...cors, 'content-type': 'text/event-stream' },
        })
      }
      if (req.method === 'GET' && path in json)
        return Response.json(json[path], { headers: cors })
      if (req.method === 'GET' && /^\/oauth\/[^/]+\/status$/.test(path)) {
        return Response.json(oauthStatus(path.split('/')[2]), { headers: cors })
      }
      if (req.method === 'POST' && path === '/compare')
        return Response.json(comparisonFor('KR'), { headers: cors })
      if (req.method === 'POST' && path === '/acpx/probe')
        return Response.json(acpProbe, { headers: cors })

      const key = `${req.method} ${path}`
      unknown.set(key, (unknown.get(key) ?? 0) + 1)
      return Response.json(
        { error: { message: 'not in the capture fixtures' } },
        { status: 404, headers: cors },
      )
    },
  })
  return {
    port: server.port as number,
    unknown,
    setLocale: (locale) => {
      base = fixturesFor(locale)
      json = base
    },
    override: (routes) => {
      json = routes ? { ...base, ...routes } : base
    },
    idleFor: () => Date.now() - last,
    stop: () => server.stop(true),
  }
}

/** Serves a built static app (the onboarding page) from `root`. */
export function startStaticServer(root: string): {
  port: number
  stop(): void
} {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(req) {
      const path = new URL(req.url).pathname
      const file = Bun.file(`${root}${path === '/' ? '/index.html' : path}`)
      if (await file.exists()) return new Response(file)
      return new Response(Bun.file(`${root}/index.html`))
    },
  })
  return { port: server.port as number, stop: () => server.stop(true) }
}
