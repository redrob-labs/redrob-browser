/**
 * The page-side stand-in for `chrome.browserOS`, which only the Redrob browser provides.
 *
 * Stock Chromium has no such namespace, so without it every screen dies looking for the agent server's
 * port. The shim answers the handful of calls the screens make (lib/browseros/adapter.ts) with
 * callbacks, the way the real API does, and points both port prefs at the stub server.
 *
 * Returned as a string because it is injected with addInitScript, before any of the page's own code.
 */
export function browserShim(port: number): string {
  return `(() => {
  if (!globalThis.chrome || !chrome.runtime || chrome.browserOS) return;
  const prefs = {
    'browseros.server.mcp_port': ${port},
    'browseros.server.proxy_port': ${port},
    'browseros.server.server_port': ${port},
    'browseros.vertical_tabs_enabled': true,
  };
  const later = (fn, ...args) => typeof fn === 'function' && setTimeout(() => fn(...args), 0);
  chrome.browserOS = {
    getPref: (name, cb) => later(cb, { key: name, type: typeof prefs[name], value: prefs[name] ?? null }),
    setPref: (name, value, a, b) => { prefs[name] = value; later(typeof a === 'function' ? a : b, true); },
    getVersionNumber: (cb) => later(cb, '155.0.8059.26'),
    getBrowserosVersionNumber: (cb) => later(cb, '0.46.0.0'),
    logMetric: (...args) => later(args.find((x) => typeof x === 'function')),
    choosePath: (_options, cb) => later(cb, null),
  };
})();`
}
