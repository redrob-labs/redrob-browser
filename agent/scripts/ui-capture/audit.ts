/**
 * What is measured inside a captured page. Runs in the page via page.evaluate, so it must stay
 * self-contained: no imports, no closures over module scope.
 *
 * Everything is read from COMPUTED style, never from the stylesheet, because the stylesheet is what we
 * wrote and the computed value is what a person sees. A Tailwind opacity modifier, a shadcn default or
 * an inline style all land here as the colour they actually resolve to.
 */

export interface AuditInput {
  /** Every colour the design system declares for the active theme, as `r,g,b,a` with a in 0..1. */
  palette: string[]
  locale: 'en' | 'ko'
}

export interface Finding {
  what: string
  where: string
}

export interface AuditResult {
  offPalette: Finding[]
  contrast: Finding[]
  roundIcons: Finding[]
  foreignIcons: Finding[]
  untranslated: Finding[]
  fonts: { family: string; loaded: string[]; failed: string[] }
}

export function audit(input: AuditInput): AuditResult {
  const palette = new Set(input.palette)

  const describe = (el: Element): string => {
    const parts: string[] = []
    let node: Element | null = el
    for (let i = 0; node && i < 3; i++) {
      let part = node.tagName.toLowerCase()
      const cls =
        typeof node.className === 'string'
          ? node.className.trim().split(/\s+/).slice(0, 2).join('.')
          : ''
      if (cls) part += `.${cls}`
      parts.unshift(part)
      node = node.parentElement
    }
    return parts.join(' > ').slice(0, 160)
  }

  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const s = getComputedStyle(el)
    return (
      s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0
    )
  }

  // `rgb(1, 2, 3)` / `rgba(1, 2, 3, 0.5)` / `color(srgb r g b / a)` -> "r,g,b,a"
  const norm = (value: string): string | null => {
    const v = value.trim()
    if (!v || v === 'transparent' || v === 'none' || v === 'currentcolor')
      return null
    let m = v.match(/^rgba?\(([^)]+)\)$/)
    if (m) {
      const p = m[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number)
      const a = p.length > 3 ? p[3] : 1
      if (a === 0) return null
      return `${p[0]},${p[1]},${p[2]},${Number(a.toFixed(2))}`
    }
    m = v.match(/^color\(srgb ([^)]+)\)$/)
    if (m) {
      const p = m[1]
        .split(/[\s/]+/)
        .filter(Boolean)
        .map(Number)
      const a = p.length > 3 ? p[3] : 1
      if (a === 0) return null
      return `${Math.round(p[0] * 255)},${Math.round(p[1] * 255)},${Math.round(p[2] * 255)},${Number(a.toFixed(2))}`
    }
    // Tailwind 4 resolves its colours, and every `/opacity` modifier, through OKLab -- so most of what
    // shadcn paints computes to oklab()/oklch(), not rgb(). Converted to sRGB (Björn Ottosson's
    // matrices) so it can be compared with the palette at all.
    m = v.match(/^okl(ab|ch)\(([^)]+)\)$/)
    if (m) {
      const p = m[2].split(/[\s/]+/).filter(Boolean)
      const num = (s: string) =>
        s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s)
      const L = num(p[0])
      let A = num(p[1])
      let B = num(p[2])
      if (m[1] === 'ch') {
        const hue = (parseFloat(p[2]) * Math.PI) / 180
        A = num(p[1]) * Math.cos(hue)
        B = num(p[1]) * Math.sin(hue)
      }
      const a = p.length > 3 ? num(p[3]) : 1
      if (a === 0) return null
      const l_ = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
      const m_ = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
      const s_ = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
      const lin = [
        4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
        -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
        -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
      ]
      const enc = (c: number) => {
        const x = Math.min(1, Math.max(0, c))
        return Math.round(
          255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055),
        )
      }
      return `${enc(lin[0])},${enc(lin[1])},${enc(lin[2])},${Number(a.toFixed(2))}`
    }
    return `?${v}`
  }

  // A conversion through OKLab lands within a unit of the original channel, so a token matches at +-1.
  const tuples = Array.from(palette, (s) => s.split(',').map(Number))
  const inPalette = (c: string) => {
    if (palette.has(c)) return true
    if (c.startsWith('?')) return false
    const [r, g, b, a] = c.split(',').map(Number)
    return tuples.some(
      (t) =>
        Math.abs(t[0] - r) <= 1 &&
        Math.abs(t[1] - g) <= 1 &&
        Math.abs(t[2] - b) <= 1 &&
        Math.abs(t[3] - a) <= 0.01,
    )
  }

  const offPalette = new Map<string, Finding>()
  const note = (prop: string, raw: string, el: Element) => {
    const c = norm(raw)
    if (!c || inPalette(c)) return
    const key = `${prop} ${c}`
    if (!offPalette.has(key))
      offPalette.set(key, { what: `${prop}: rgba(${c})`, where: describe(el) })
  }

  const roundIcons: Finding[] = []
  const foreignIcons: Finding[] = []
  const all = Array.from(document.querySelectorAll('body *')).filter(visible)
  for (const el of all) {
    const s = getComputedStyle(el)
    const isSvgPart =
      el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg'
    if (!isSvgPart) {
      note('color', s.color, el)
      note('background-color', s.backgroundColor, el)
      for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
        if (
          parseFloat(s[`border${side}Width`]) > 0 &&
          s[`border${side}Style`] !== 'none'
        ) {
          note('border-color', s[`border${side}Color`], el)
        }
      }
      if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0)
        note('outline-color', s.outlineColor, el)
    } else {
      if (s.fill !== 'none' && !s.fill.startsWith('url('))
        note('fill', s.fill, el)
      if (s.stroke !== 'none' && !s.stroke.startsWith('url('))
        note('stroke', s.stroke, el)
    }
    if (el.tagName.toLowerCase() === 'svg') {
      const cls = el.getAttribute('class') ?? ''
      if (/\b(lucide|tabler-icon)/.test(cls))
        foreignIcons.push({
          what: cls.split(/\s+/).slice(0, 2).join(' '),
          where: describe(el),
        })
      const round = Array.from(el.querySelectorAll('*')).some((p) => {
        const ps = getComputedStyle(p)
        return (
          ps.stroke !== 'none' &&
          (ps.strokeLinecap === 'round' || ps.strokeLinejoin === 'round')
        )
      })
      if (round)
        roundIcons.push({
          what: 'round stroke cap or join',
          where: describe(el),
        })
    }
  }

  // Korean captures: a visible text run of three or more Latin letters that is not a name, a URL or code.
  const untranslated: Finding[] = []
  if (input.locale === 'ko') {
    // Names are never translated (l10n/10-sidebar.tsv): products, providers, platforms, acronyms.
    const allow =
      /^(Redrob|Pretendard|MCP|API|URL|PDF|AI|ID|OAuth|LLM|ACP|CLI|Gmail|Google|Calendar|Slack|Notion|GPT|gpt|redrob\/auto|example\.com|Linux|Console|Code|Auto|Browser|Helper|Chrome|Safe|Storage|macOS|Mac|OpenAI|Anthropic|Gemini|Mistral|DeepSeek|xAI|Grok|Ollama|OpenRouter|Moonshot|Kimi|Qwen|Cohere|Perplexity|Groq|Claude|Codex|GitHub|Copilot|OpenClaw|Hermes|Microsoft|Edge|ChatGPT|utils\.ts)$/
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    )
    const seen = new Set<string>()
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent ?? '').trim()
      const parent = n.parentElement
      if (
        !t ||
        !parent ||
        !visible(parent) ||
        parent.closest('code, pre, kbd, [data-capture-ignore]')
      )
        continue
      const words = (t.match(/[A-Za-z][A-Za-z'’-]{2,}/g) ?? []).filter(
        (w) => !allow.test(w),
      )
      if (words.length === 0 || /^https?:|@|\//.test(t)) continue
      if (seen.has(t)) continue
      seen.add(t)
      untranslated.push({ what: t.slice(0, 80), where: describe(parent) })
    }
  }

  // WCAG 2 contrast, computed here rather than by axe: axe cannot parse oklab()/oklch(), which is what
  // Tailwind 4 resolves to, so it reports most of this UI as "incomplete" and finds nothing. The ground
  // is composited up the ancestor chain; an element over an image or a gradient is skipped, not guessed.
  const contrast: Finding[] = []
  const rgba = (raw: string): number[] | null => {
    const c = norm(raw)
    if (c === null) return [0, 0, 0, 0]
    if (c.startsWith('?')) return null
    return c.split(',').map(Number)
  }
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => {
      const x = v / 255
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const over = (top: number[], under: number[]) => {
    const a = top[3] + under[3] * (1 - top[3])
    if (a === 0) return [0, 0, 0, 0]
    return [0, 1, 2]
      .map((i) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a)
      .concat(a)
  }
  const ground = (el: Element): number[] | null => {
    const layers: number[][] = []
    for (let n: Element | null = el; n; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.backgroundImage !== 'none') return null
      const c = rgba(s.backgroundColor)
      if (!c) return null
      if (c[3] > 0) layers.push(c)
      if (c[3] >= 1) break
    }
    let acc = [255, 255, 255, 1]
    if (layers.length && layers[layers.length - 1][3] < 1) {
      const root = rgba(
        getComputedStyle(document.documentElement).backgroundColor,
      )
      if (root && root[3] > 0) acc = over(root, acc)
    } else if (layers.length) acc = layers.pop() as number[]
    for (const l of layers.reverse()) acc = over(l, acc)
    return acc
  }
  const checked = new Set<Element>()
  const textWalker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
  )
  for (let n = textWalker.nextNode(); n; n = textWalker.nextNode()) {
    const el = n.parentElement
    if (!el || checked.has(el) || !(n.textContent ?? '').trim() || !visible(el))
      continue
    checked.add(el)
    if (el.closest('[disabled], [aria-disabled="true"], [aria-hidden="true"]'))
      continue
    const s = getComputedStyle(el)
    const fg = rgba(s.color)
    const bg = ground(el)
    if (!fg || !bg || fg[3] === 0) continue
    const ink = over(fg, bg)
    const [hi, lo] = [lum(ink), lum(bg)].sort((x, y) => y - x)
    const ratio = (hi + 0.05) / (lo + 0.05)
    const px = parseFloat(s.fontSize)
    const large = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700)
    if (ratio < (large ? 3 : 4.5)) {
      contrast.push({
        what: `${ratio.toFixed(2)}:1 "${(n.textContent ?? '').trim().slice(0, 40)}"`,
        where: describe(el),
      })
    }
  }

  const loaded: string[] = []
  const failed: string[] = []
  document.fonts.forEach((f) => {
    const name = `${f.family.replace(/["']/g, '')} ${f.weight}`
    if (f.status === 'loaded') loaded.push(name)
    else if (f.status === 'error') failed.push(name)
  })
  const family = getComputedStyle(document.body)
    .fontFamily.split(',')[0]
    .replace(/["']/g, '')
    .trim()

  return {
    offPalette: Array.from(offPalette.values()),
    contrast,
    roundIcons,
    foreignIcons,
    untranslated,
    fonts: {
      family,
      loaded: Array.from(new Set(loaded)).sort(),
      failed: Array.from(new Set(failed)).sort(),
    },
  }
}

/**
 * Reads the focused control after the caller has pressed Tab. Returns null when focus is on nothing
 * (the end of the tab order), otherwise the control and whether it shows a ring.
 *
 * The design system's ring is a 2px outline at a 2px offset (`--focus-ring-width`). A box-shadow is
 * accepted as a ring too, because that is how shadcn draws one, so this measures "a ring is visible",
 * not "it is drawn our way" -- the parity checks in phase 3 hold the second line.
 */
export function focusedRing(): {
  key: string
  finding: Finding
  ring: boolean
} | null {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return null
  const s = getComputedStyle(el)
  const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2
  const shadow = s.boxShadow !== 'none' && s.boxShadow !== ''
  const label = (el.getAttribute('aria-label') ?? el.innerText ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 40)
  return {
    key: `${el.tagName}|${label}|${String(el.className ?? '').slice(0, 60)}`,
    finding: {
      what: `${el.tagName.toLowerCase()} "${label}"`,
      where: String(el.className ?? '').slice(0, 80),
    },
    ring: outline || shadow,
  }
}
