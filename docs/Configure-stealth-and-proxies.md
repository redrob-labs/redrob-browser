## Stealth mode

```bash
obscura fetch https://example.com --stealth
obscura serve --stealth
obscura scrape url1 url2 --stealth
obscura mcp --stealth
```

`--stealth` is a global flag, so it works before or after the subcommand and applies to `fetch`, `serve`, `scrape`, and `mcp`. In a `scrape` run each worker inherits it.

Every release build sends Chrome's TLS and HTTP/2 fingerprint (the wreq/BoringSSL
transport: ClientHello, ALPN, cipher and extension order, HTTP/2 settings), with or
without `--stealth`. The request keeps the engine's own identity: the User-Agent of the
host OS (or `--user-agent`), the matching `sec-ch-ua*` client hints and any CDP
overrides. `OBSCURA_IMPERSONATE_TLS=0` falls back to the rustls transport.

What `--stealth` adds:

- The Windows Chrome identity on the wire and in `navigator`, whatever the host OS.
- A tracker blocklist that drops requests to known analytics and fingerprinting endpoints.

A source build gets the Chrome transport with the `stealth` feature:

```bash
cargo build --release -p obscura-cli --bins --features render,stealth
```

Without the feature (`--features render` alone) the transport is reqwest/rustls and
`--stealth` only blocks trackers.

## What stealth handles

- Basic bot detection that checks TLS fingerprint or User-Agent.
- Sites that rely on third-party analytics being reachable.

## What stealth does not handle

- Cloudflare interactive challenges.
- Datadome and Akamai bot manager active challenges.
- CAPTCHAs.
- IP-based rate limiting (use proxies).
- **Passive TCP/IP stack fingerprinting.** Classifiers that inspect the raw SYN
  packet (tcp_options order, window size, window scaling, ip_id) can distinguish
  Linux from macOS even when the TLS and HTTP layers are identical, because those
  fields are set by the OS kernel, not by Obscura. The same binary on Linux
  (`tcp_options: "M1460,S,T,N,W10"`, window 64240) and macOS
  (`tcp_options: "M1460,N,W6,N,N,T,S,E,E"`, window 65535) produces a different
  passive fingerprint. Obscura operates in userspace and cannot override these
  kernel defaults. If TCP/IP passive detection is a concern, run Obscura inside
  a container or VM whose kernel matches the target fingerprint, or route
  connections through a proxy whose TCP stack presents the desired profile.

## Proxies

HTTP proxy:

```bash
obscura fetch https://example.com --proxy http://proxy.example.com:8080
obscura serve --proxy http://proxy.example.com:8080
```

With auth:

```bash
obscura fetch https://example.com --proxy http://user:pass@proxy.example.com:8080
```

SOCKS5:

```bash
obscura fetch https://example.com --proxy socks5://proxy.example.com:1080
```

## Custom User-Agent

```bash
obscura fetch https://example.com --user-agent "Mozilla/5.0 (...) ..."
obscura serve --user-agent "Mozilla/5.0 (...) ..."
```

Default UA matches a recent Chrome on the build platform.

## Browser profile, timezone, and geolocation

The engine presents one of a built-in pool of realistic browser profiles (a mix of Windows and macOS, recent Chrome versions). Each profile keeps `navigator.platform`, `navigator.userAgentData` (platform and platform version), and the UA string internally consistent, so the surfaces a site fingerprints agree with each other. There is no GPU renderer among them: `canvas.getContext('webgl')` returns `null`, so a page cannot read a renderer string at all.

A single stable profile is used by default. One IP cycling through different identities is itself a signal, so rotation is opt-in:

```bash
OBSCURA_PROFILE=2 obscura serve          # pin a specific profile by index
OBSCURA_ROTATE_PROFILE=1 obscura serve   # random profile per browser context
```

Timezone is driven by the process zone so `Date` (`getTimezoneOffset`, `toString`) and `Intl.DateTimeFormat` report the same region. Default is `Europe/Berlin`; set it to match the exit IP:

```bash
OBSCURA_TIMEZONE=America/New_York obscura serve
```

`navigator.geolocation` reports configurable coordinates. Set them as `lat,lon` and keep them consistent with the timezone and proxy region:

```bash
OBSCURA_GEOLOCATION="40.7128,-74.0060" obscura serve
```

Keep these aligned. A rotated or mismatched profile carries no matching TLS or timezone fingerprint, so when you pin a proxy region or TLS fingerprint, leave rotation off and set the timezone and geolocation to the same region. See [Environment variables](Environment-variables.md) for the full list.

## Combine

```bash
obscura serve \
  --stealth \
  --proxy http://user:pass@proxy.example.com:8080 \
  --user-agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ..."
```
