# UI capture

Renders every screen of the agent extension (`apps/app`), the first-run page (`apps/app-onboard`) and
the claw cockpit (`apps/claw-app`) in light and dark, English and Korean. It measures each one against the design system and compares the
counts with `baseline.json`.

```sh
bun run build:agent && bun run build:app-onboard && (cd apps/claw-app && bun run build)
bunx playwright install chromium
bun run ui:capture                     # compare with the baseline; exit 1 on any difference
bun run ui:capture --update-baseline   # rewrite the baseline after an intended change
bun run ui:capture --only settings     # just the surfaces whose id contains "settings"
```

Screenshots and `report.md` (each finding, with the element it was found on) are written to
`.ui-capture/`. CI uploads them as the `ui-capture` artifact.

## What is measured

All measurements read computed style in the rendered page.

| metric | counts |
|---|---|
| `offPalette` | Distinct colours, as `property: colour` pairs, that match no colour token in the active theme. Covers text, background, border, outline and SVG fill/stroke |
| `contrast` | Text below WCAG AA (4.5:1, or 3:1 for large text), measured against its composited background |
| `focusMissing` | Controls reached by Tab that show no focus ring |
| `roundIcons` | SVG icons drawn with round caps or joins. The design system's icons never use them |
| `foreignIcons` | Icons from lucide or tabler, not from the design system |
| `untranslated` | In Korean captures: visible English text that is not a name, code or URL |
| `fonts` | No loaded Pretendard face, plus every font face that failed to load |

## Why the baseline is a ratchet

Today's screens are not on the design system yet, so a gate demanding zero would fail every PR.
`baseline.json` holds today's counts instead:
- A count that **rises** fails, because that is a regression.
- A count that **falls** also fails until the baseline is lowered in the same PR. Otherwise a stale
  baseline would let the fixed defect come back unnoticed.

## How it runs without the browser

The real extension needs `chrome.browserOS` and a running agent server, and stock Chromium has neither.
- `shim.ts` provides the API calls the screens make.
- `server.ts` serves `fixtures.ts`, using the response shapes the client code actually reads.
- The claw cockpit is loaded as its own extension in its own profile. It reads the same
  `browseros.server.server_port` pref, so the same server answers its `/api/v1/*` routes from
  `claw-fixtures.ts`: two running sessions (one waiting for help), three finished ones, two skills,
  the MCP connections and audit storage. A running card's live preview is a drawn SVG page.

A route the fixtures don't answer is listed in the report, so a screen that starts reading something new
is noticed instead of quietly rendering an empty state. The onboarding page already has a mock bridge of
its own when it runs outside Chromium's WebUI; the harness uses that.
