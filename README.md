# Redrob Browser

[한국어](README.ko.md)

Redrob Browser is an agentic web browser that you and your agent share: you browse, the agent reads
and acts on the same tabs, and both can be driven from the command line.

It runs on its own engine, written in Rust. There is no Chromium checkout to build.

## Status

Version 0.1.0 is in development. The engine loads pages, runs JavaScript, and exposes every tab over
the Chrome DevTools Protocol and MCP. The window, address bar, tabs, bookmarks, profile, password
vault, Chrome import, developer tools and video are being built.

## Build

```bash
cargo build --release -p obscura-cli --features render
./target/release/redrob-browser --help
```

## Drive it from the command line

```bash
redrob-browser serve --port 9222   # CDP server for Playwright, Puppeteer or your agent
redrob-browser mcp                 # MCP server
redrob-browser fetch https://example.com --dump markdown
```

## Languages

English and Korean.

## Licence

Apache-2.0. Redrob Browser is a fork of [Obscura](https://github.com/h4ckf0r0day/obscura); see
[NOTICE](NOTICE) and [UPSTREAM.md](UPSTREAM.md).

Copyright 2026 Janghoon Lee (Redrob) and contributors
