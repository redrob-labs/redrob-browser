# Redrob Browser

[English](README.md)

Redrob Browser는 사람과 에이전트가 같이 쓰는 웹 브라우저예요. 사람이 웹서핑하는 탭을 에이전트도
읽고 조작해요. 둘 다 명령줄에서 부를 수 있어요.

엔진은 Rust로 직접 만들어요. 빌드할 Chromium 소스가 없어요.

## 상태

0.1.0을 만들고 있어요. 지금 엔진은 페이지를 열고 JavaScript를 실행해요. 모든 탭을 Chrome DevTools
Protocol과 MCP로 조작할 수 있어요. 창, 주소창, 탭, 북마크, 프로필, 비밀번호 금고, Chrome에서
가져오기, 개발자 도구, 동영상은 만드는 중이에요.

## 빌드

```bash
cargo build --release -p obscura-cli --features render
./target/release/redrob-browser --help
```

## 명령줄에서 쓰기

```bash
redrob-browser serve --port 9222   # Playwright, Puppeteer, 에이전트용 CDP 서버
redrob-browser mcp                 # MCP 서버
redrob-browser fetch https://example.com --dump markdown
```

## 언어

영어와 한국어

## 라이선스

Apache-2.0. Redrob Browser는 [Obscura](https://github.com/h4ckf0r0day/obscura)를 포크했어요.
[NOTICE](NOTICE)와 [UPSTREAM.md](UPSTREAM.md)를 보세요.

Copyright 2026 Janghoon Lee (Redrob) and contributors
