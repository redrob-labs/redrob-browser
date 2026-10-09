#!/usr/bin/env bun
/**
 * Fails on an interface icon that is not the Redrob design system's.
 *
 *   bun run check:ui-icons
 *
 * Every icon in the extension and the onboarding page comes from @browseros/icons, which draws the
 * system's glyphs (24 box, stroke 2, butt caps, miter joins, diagonals at 40 degrees). This catches the two
 * ways that stops being true without anyone deciding it:
 *
 *   - an import from another icon set (lucide-react, @tabler/icons-react, react-icons, heroicons), which a
 *     generated shadcn component brings with it by default;
 *   - a round stroke cap or join written into our own markup or CSS, which the system's icon spec rules
 *     out by name ("Never round").
 *
 * Third-party BRAND marks (a provider's logo from @lobehub/icons) are logos, not interface icons, and are
 * not checked here.
 */

import { readFileSync } from 'node:fs'
import { Glob } from 'bun'

const ENFORCED = ['apps/app', 'apps/app-onboard/src']
const FOREIGN =
  /from\s+['"](lucide-react|@tabler\/icons-react|react-icons(\/[^'"]*)?|@heroicons\/[^'"]+)['"]/
const ROUND =
  /stroke-?linecap["':=\s{]+["']?round|stroke-?linejoin["':=\s{]+["']?round|strokeLinecap=["{']+round|strokeLinejoin=["{']+round/i

const findings: string[] = []
let files = 0
for (const root of ENFORCED) {
  for await (const rel of new Glob('**/*.{ts,tsx,css}').scan(root)) {
    if (
      /node_modules|\/dist\/|\.wxt\/|\.output\/|\.test\./.test(`${root}/${rel}`)
    )
      continue
    // Third-party logos drawn as SVG components are artwork, not interface icons: their geometry is the
    // owner's, and redrawing it to our grid would be the "recolor or redraw" every brand guide forbids.
    if (
      /components\/ui\/svgs\/|agent-brand-marks\.tsx$|AgentBrandMarks\.tsx$|open-in-chat\.tsx$/.test(
        rel,
      )
    )
      continue
    files++
    const lines = readFileSync(`${root}/${rel}`, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const where = `${root}/${rel}:${i + 1}`
      const foreign = line.match(FOREIGN)
      if (foreign)
        findings.push(`${where}: icon from ${foreign[1]}; use @browseros/icons`)
      if (ROUND.test(line))
        findings.push(
          `${where}: a round stroke cap or join; the system's icons are butt and miter`,
        )
    })
  }
}

if (findings.length) {
  for (const f of findings) console.error(f)
  console.error(
    `\n${findings.length} problem(s). Add a mapping to agent/packages/icons (and docs/ICONS.md) if a glyph is missing.`,
  )
  process.exit(1)
}
console.log(
  `check-ui-icons: ${files} file(s) in ${ENFORCED.join(', ')}, every icon is the design system's`,
)
