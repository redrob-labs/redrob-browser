#!/usr/bin/env python3
# Copyright 2026 Redrob. Portions copyright The Chromium Authors.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Check that the browser's own colours come from the design system, and that its references still resolve.

Runs offline and in milliseconds, which is why it is separate from vendor_design_system.py: that one
verifies the vendored COPY against the registry and needs the network, this one verifies the browser's USE
of the copy and needs only the tree. A push should not have to reach npm to be told it typed a hex.

Three things are checked.

1. EVERY `ds::light::kFoo` / `ds::dark::kFoo` REFERENCE NAMES A TOKEN THAT EXISTS. A design system release
   that renames or drops a token is otherwise found by the C++ compiler -- three hours into a Chromium
   build, on a self-hosted runner, long after the pin was bumped. The same fact is available here from two
   text files.

2. NO NEW HARDCODED COLOUR APPEARS IN THE CHROME. Colours the design system has no token for are real and
   are allowed, but each must be listed below with a reason, so the count is visible and grows only on
   purpose. This is the check that would have caught the four drifted values this file was written for.

3. THE VENDORED STYLESHEET IS NOT SHADOWED. If one of the browser's own sheets redefines a custom property
   that the vendored design_tokens.css already defines, the later sheet wins and the design system is
   silently overruled for that property -- which looks like the system being adopted while the old value
   is still painted. Shadowing with an IDENTICAL value is reported too: it is a second place the colour is
   decided, and the copies drift apart later, not now.

4. EVERY `var(--foo)` IN OUR SHEETS NAMES A TOKEN THE DESIGN SYSTEM DECLARES. This is check 1 for the CSS
   side, and it is the one that matters most after a pin bump: C++ gets a compiler, CSS gets nothing. An
   undeclared custom property does not fall back or warn -- `color: var(--ink-secondary)` with the token
   gone makes the whole declaration invalid at computed-value time, so the text silently inherits. A
   renamed token would ship as a page that looks subtly unstyled and no build would have failed.

5. EVERY FONT FAMILY OUR STACKS CAN SELECT IS DECLARED AND SHIPPED. build_webui ships only what BUILD.gn
   lists, and a `src: url()` pointing at a file that is not shipped does not fail the build -- the browser
   requests it, gets nothing, and falls through to the next family, which is a different typeface at a
   different weight. This is not hypothetical: the browser used to ship one variable cut as `Pretendard
   Variable` while the design system declared `Pretendard` as six static weights whose files were absent,
   and every weight sat at `status: "error"` in the live page while the build stayed green. Families the
   design system declares but no stack of ours can reach are reported, not required -- the serif and
   display cuts are deliberately not vendored.

6. THE LOGO IS THE SHIPPED LOGO, ON BOTH GROUNDS, UNMODIFIED. Two halves. The artwork is pinned by sha256
   in DESIGN_SYSTEM_PIN.json because nothing in a build reads a PNG's pixels: a re-export at a smaller
   size, a nudged blue or a flattened gradient passes every other check here, and 10-logo.md forbids all
   three. And no rule of ours may put a mask, filter, opacity, background or shadow on a mark selector --
   a mask in a token colour fixes dark-mode contrast by throwing the artwork away, which is the recolor
   the spec names under Incorrect usage, and it reads as ordinary CSS in review. Height and width only;
   the ground is chosen by swapping to the file made for it.

7. THE TWO VENDORED SHEETS LOAD IN THE PINNED ORDER. design_tokens.css holds the values, design_system.css
   holds the 145 component classes -- but the component sheet is not only components: it SUPERSEDES --ink-muted on
   both themes and --surface-sunken on dark, and adds --series-*, --tex-*, --rake-* and --dia-rake. In the
   design system's own order the later sheet wins, which is the intended result. Linked the other way
   round, or with the component sheet missing from a page that uses `.rr-*`, the browser paints the
   superseded values and looks correct while disagreeing with every other Redrob surface. Nothing else can
   catch that: both orders are valid CSS and both build green.

A NOTE ON WHAT "OURS" MEANS. Checks 2, 3 and 4 judge sheets WE write. Both vendored sheets are excluded
from them, because a finding in a file we may not edit is a finding nobody can act on, and a gate whose
output cannot be acted on is one everybody learns to scroll past. The vendored pair is held to the pin
(byte-identical, by vendor_design_system.py) and to check 7 (loaded in order) instead.

8. THE NATIVE HEADER AND THE CSS AGREE ON EVERY TOKEN BOTH DEFINE. One release ships two artifacts -- a C++
   header of literals and a stylesheet -- and every other Redrob product consumes one or the other. This
   browser consumes BOTH, in adjacent pixels: the window chrome paints a muted label from the header while a
   WebUI page paints a placeholder from the CSS. So it is the only surface that can observe them disagree,
   and they do: the header is generated from the token sheet alone and never sees the three roles
   design_system.css supersedes. Nine points per channel is not something anyone spots and no build fails.
   174 of the header's 178 constants are compared; the three known gaps are declared in
   HEADER_CSS_DIVERGENCES with both measured values, so a pin bump that moves either one fails rather than
   sliding under the exemption. The real fix is upstream, in the design system's generator.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
HEADER = ROOT / "sources/chrome/browser/ui/color/redrob_design_tokens.h"
PIN = ROOT / "DESIGN_SYSTEM_PIN.json"
VENDORED_CSS = ROOT / "sources/chrome/browser/resources/redrob/design_tokens.css"
# The component layer, vendored from the same pinned release. It must load AFTER VENDORED_CSS (check 7).
VENDORED_SYSTEM_CSS = ROOT / "sources/chrome/browser/resources/redrob/design_system.css"
# In pin order. Neither is ours to edit, so neither is judged by the checks that police our own sheets.
VENDORED_SHEETS = (VENDORED_CSS, VENDORED_SYSTEM_CSS)
# The one DERIVED vendored artifact: the design system's glyph geometry, re-emitted as a TypeScript table
# because this WebUI has no React and no bundler. Also not ours to edit.
ICON_TABLE = ROOT / "sources/chrome/browser/resources/redrob/design_icons.ts"
CHROME_SOURCES = ROOT / "sources/chrome"

# Colours this browser decides for itself, and why the design system cannot supply them. A file may hold a
# raw colour literal ONLY if it is named here. Adding an entry is a deliberate act with a reason attached;
# adding a literal without one fails this check.
# EMPTY, and it should stay that way. Both entries this once held are gone because each turned out to be a
# colour the design system DID describe:
#
#   kPageLight #fcfeff        the content area. `--surface-base`, which is also what the WebUI pages paint,
#                             so two values for one surface were producing a seam at their shared edge.
#   kSidebarWashLight #e9fbff the light sidebar. `.rr-shell__side` gives the rail `--surface-sunken` in
#                             light and `--surface-raised` in dark. The reason that was not obvious is that
#                             the wash half of the rule referenced `--product-browser-wash`, which nothing
#                             declared, so the rule read as though the system had no opinion. It had one.
#
# The lesson worth keeping is the shape of the mistake: "the design system has no token for this" was
# asserted twice, in a comment, with a plausible reason attached, and was wrong both times. An entry here
# needs the SEARCH to have been done -- grep the token sheet AND the component sheet for the surface by
# name -- not a reason why one probably does not exist.
ALLOWED_LOCAL_COLOURS: dict[tuple[str, str], str] = {}


# Tokens where the release's NATIVE HEADER and its CSS disagree, which is an upstream generator gap rather
# than anything this tree decides. design_system.css supersedes three roles that design_tokens.css declares
# first; `dist/native/redrob_tokens.h` is generated from the token sheet alone, so it never sees the
# correction. Every other Redrob product consumes one artifact or the other and cannot notice. This browser
# consumes both -- the C++ chrome paints a muted label from the header while a WebUI page beside it paints a
# placeholder from the CSS -- so it is the only place the disagreement is observable, and check 8 is where it
# gets counted instead of discovered.
#
# THE FIX IS UPSTREAM, in @redrob-labs/ui's native generator: it should resolve tokens through system.css the
# way a browser does. Each entry records both values as measured, so a pin bump that changes either one fails
# rather than sliding under the exemption. Measured against @redrob-labs/ui@1.0.1.
# EMPTY, and that is the point: the three divergences this table existed for are FIXED at their source
# in @redrob-labs/ui 1.0.2, which this browser now pins.
#
# What they were. The design system generates its native C++ header from its token sheet alone, which is
# correct -- that is the token sheet. But its component sheet redeclared two roles at root scope, so one
# release shipped two different answers for three colours: a native consumer read the header and got one,
# a web consumer loaded both sheets and got the other, nine points per channel apart.
#
#   light --ink-muted       0xFF7C8390 -> 0xFF686E78
#   dark  --ink-muted       0xFF7C8390 -> 0xFF838A97
#   dark  --surface-sunken  0xFF000000 -> 0xFF1C1F26
#
# All three were accessibility corrections, not preferences: --ink-muted light was below AA on every
# light ground in the system (3.81:1 / 3.62:1 / 3.37:1) and --surface-sunken dark put the second layer
# 7.51 L* BELOW the page, reversing the dark elevation ladder so a well read as a hole.
#
# This browser is the only surface that could observe the split, because it is the only one that paints
# from BOTH artifacts -- window chrome from the header, WebUI pages from the CSS, in adjacent pixels.
# Upstream now carries `supersession:check`, which fails a release whose two sheets disagree about a
# token they both declare, so the class of defect is closed rather than just this instance of it.
#
# Leaving the entries here after the fix would be worse than never having had them: an exemption that
# names a divergence which no longer exists silently permits that divergence to come BACK. So check 8
# fails on a stale entry as well as on an unlisted one -- which is how this table got emptied, rather
# than by anyone remembering to.
HEADER_CSS_DIVERGENCES: dict[tuple[str, str], dict[str, str]] = {}


def tokens_in_header() -> dict[str, set[str]]:
    if not HEADER.exists():
        sys.exit(f"{HEADER.relative_to(ROOT)} is missing. Run: python3 scripts/vendor_design_system.py --update")
    text = HEADER.read_text(encoding="utf-8")
    out: dict[str, set[str]] = {}
    for theme in ("light", "dark"):
        marker = f"namespace {theme} {{"
        if marker not in text:
            sys.exit(f"the vendored header has no `{theme}` namespace; the design system's output shape changed")
        block = text.split(marker, 1)[1].split(f"}}  // namespace {theme}", 1)[0]
        out[theme] = set(re.findall(r"constexpr uint32_t (k\w+)\s*=", block))
    return out


def check_references(available: dict[str, set[str]]) -> list[str]:
    problems: list[str] = []
    referenced = 0
    for path in sorted(CHROME_SOURCES.rglob("*.cc")) + sorted(CHROME_SOURCES.rglob("*.h")):
        if path == HEADER:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in re.finditer(r"\bds::(light|dark)::(k\w+)\b", text):
            referenced += 1
            theme, name = match.group(1), match.group(2)
            if name not in available[theme]:
                line = text.count("\n", 0, match.start()) + 1
                near = ", ".join(sorted(n for n in available[theme] if n.lower().startswith(name[:5].lower()))) or "none"
                problems.append(
                    f"{path.relative_to(ROOT)}:{line}: ds::{theme}::{name} is not in the vendored header "
                    f"(closest names: {near})"
                )
    print(f"  token references resolved: {referenced}")
    return problems


def check_no_new_literals() -> list[str]:
    """A colour literal is allowed only where ALLOWED_LOCAL_COLOURS says so, by file and constant name."""
    problems: list[str] = []
    allowed_names = {(f, n) for (f, n) in ALLOWED_LOCAL_COLOURS}
    found: set[tuple[str, str]] = set()
    pattern = re.compile(
        r"constexpr\s+SkColor\s+(\w+)\s*=\s*SkColorSet(?:A?RGB)\(|"   # named constant
        r"(SkColorSet(?:A?RGB)\(\s*0x)",                              # anonymous, inline
    )
    for path in sorted(CHROME_SOURCES.rglob("*.cc")) + sorted(CHROME_SOURCES.rglob("*.h")):
        if path == HEADER:
            continue
        relative = str(path.relative_to(ROOT))
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in pattern.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            if match.group(1):
                key = (relative, match.group(1))
                found.add(key)
                if key not in allowed_names:
                    problems.append(
                        f"{relative}:{line}: {match.group(1)} is a hardcoded colour. Use a design-system "
                        f"token (ds::light::k... / ds::dark::k...), or add it to ALLOWED_LOCAL_COLOURS in "
                        f"{pathlib.Path(__file__).name} with the reason no token can supply it."
                    )
            else:
                problems.append(
                    f"{relative}:{line}: an inline SkColorSetRGB literal. A colour needs a name and a "
                    f"reason before it needs a value -- name it and either use a token or declare it in "
                    f"ALLOWED_LOCAL_COLOURS."
                )
    for key in sorted(allowed_names - found):
        problems.append(
            f"{key[0]}: ALLOWED_LOCAL_COLOURS still lists {key[1]}, which no longer exists. Remove the "
            f"entry -- a stale exemption silently permits a future literal of the same name."
        )
    print(f"  declared browser-local colours: {len(found & allowed_names)} of {len(allowed_names)} allowed")
    return problems


def strip_css_comments(text: str) -> str:
    """CSS with its comments removed, by a scanner rather than a regex.

    A regex strip runs to the next `*/` anywhere in the file the moment a `/*` appears inside a string or
    a url(), which silently deletes real rules and makes every check that reads the result pass.
    """
    out_chars: list[str] = []
    i, n, in_comment = 0, len(text), False
    while i < n:
        if in_comment:
            if text.startswith("*/", i):
                in_comment = False
                i += 2
                continue
            i += 1
            continue
        if text.startswith("/*", i):
            in_comment = True
            i += 2
            continue
        out_chars.append(text[i])
        i += 1
    return "".join(out_chars)


def _is_global_selector(selector: str) -> bool:
    """Does this selector set a property for the whole document?

    Shadowing is only shadowing at document scope. `[data-density="compact"]` declares
    --control-height-md too, but as an opt-in a container switches on -- reporting it as a conflict with
    the root value is reporting the feature. Six of the eight findings this check first produced against
    the vendored component sheet were exactly that, which is how the blindness was found.

    A part is global when nothing SELECTIVE is left after removing the root handles: `:root`, `html`, a
    data-theme attribute, and the functional pseudo-classes those get wrapped in.
    """
    for part in selector.split(","):
        rest = part.strip()
        if not rest:
            continue
        rest = re.sub(r":(?:not|is|where)\([^()]*\)", "", rest)
        rest = re.sub(r"\[data-theme[^\]]*\]", "", rest)
        # `:root` must NOT be matched with a leading \b -- a word boundary needs a word character on one
        # side, and there is none before the colon, so `\b:root\b` never matches and every :root block
        # reads as selective. That mistake made this function report only the [data-theme="dark"] blocks:
        # 26 of design_tokens.css's 174 properties, and it looked plausible.
        rest = re.sub(r":root\b", "", rest)
        rest = re.sub(r"\bhtml\b", "", rest)
        if rest.strip():
            return False
    return True


def custom_properties(path: pathlib.Path, global_only: bool = False) -> dict[str, list[str]]:
    """Every custom property a sheet DECLARES, with EVERY value declared for it.

    All of them, not the last one: a themed token is declared once per theme block, so returning a single
    value would make this report say "the design system says #292e37" when that is merely its dark value.
    Declarations only -- a var() use is not a declaration.

    With global_only, declarations inside a selective block are skipped. That is the right reading for
    shadowing and the wrong one for "may this sheet use var(--x)", so it is a flag rather than the
    default: a sheet that declares --x anywhere may legitimately read it back.
    """
    stripped = strip_css_comments(path.read_text(encoding="utf-8"))
    found: dict[str, list[str]] = {}
    if not global_only:
        for m in re.finditer(r"(--[a-zA-Z][\w-]*)\s*:\s*([^;{}]+);", stripped):
            found.setdefault(m.group(1), []).append(" ".join(m.group(2).split()))
        return found

    # Walk the braces so each declaration is attributed to the selector that owns it. An at-rule
    # (@media, @supports) is transparent: the selectors inside it keep their own scope.
    depth, i, n = 0, 0, len(stripped)
    selector_stack: list[str | None] = []
    pending: list[str] = []
    while i < n:
        ch = stripped[i]
        if ch == "{":
            head = "".join(pending).strip()
            pending = []
            selector_stack.append(None if head.startswith("@") else head)
            depth += 1
            i += 1
            continue
        if ch == "}":
            if selector_stack:
                selector_stack.pop()
            depth = max(0, depth - 1)
            i += 1
            continue
        if ch == ";" or ch == "\n":
            pending = []
            i += 1
            if ch == "\n":
                continue
            continue
        m = re.match(r"(--[a-zA-Z][\w-]*)\s*:\s*([^;{}]*)", stripped[i:])
        owner = next((s for s in reversed(selector_stack) if s is not None), None)
        if m and owner is not None:
            if _is_global_selector(owner):
                found.setdefault(m.group(1), []).append(" ".join(m.group(2).split()))
            i += m.end()
            pending = []
            continue
        pending.append(ch)
        i += 1
    return found


def discover_webui_pages() -> tuple[pathlib.Path, ...]:
    """Our own C++ WebUI pages, FOUND rather than listed.

    This was a hand-written tuple of three paths, and all three surfaces have since been deleted -- the
    agent WebUI (A-7), settings (S-7) and onboarding (O-8). A hand-kept list has two failure modes and
    this file met both: it goes stale downward, naming files that no longer exist, and it goes stale
    upward, so a NEW page is outside all eight checks that read this list until somebody remembers to add
    it. The second is the dangerous one, because the newest page is exactly where an unreviewed token or a
    recolored mark appears first.

    So the set is globbed. An empty result is a real answer -- no C++ page of ours remains -- and the
    checks below say so instead of reporting a pass they did not perform.
    """
    root = ROOT / "sources/chrome/browser/resources"
    return tuple(
        sorted(
            page
            for directory in root.glob("redrob*")
            if directory.is_dir()
            for page in directory.glob("*.html")
        )
    )


WEBUI_PAGES = discover_webui_pages()


def loaded_stylesheets(page: pathlib.Path) -> list[pathlib.Path]:
    """The sheets a page actually links, in link order.

    Read from the HTML rather than from the directory listing, because shadowing is a CASCADE fact: a
    property a sheet declares only overrules the design system if both sheets are loaded, and the later
    link wins. A vendored file sitting in the tree unlinked overrules nothing, and reporting it as a
    conflict would mean this check fails for work that has not happened yet -- which teaches everyone to
    ignore it. It arms itself the moment design_tokens.css is linked.

    The three bundles are separate build targets, so each page links its OWN copy in its own directory.
    Only redrob/ holds the source of the shared copies (see sources/manifest), so a name that does not
    exist beside the page is looked up there.
    """
    if not page.exists():
        return []
    order: list[pathlib.Path] = []
    for m in re.finditer(r"""<link[^>]+href=["']([^"']+\.css)["']""", page.read_text(encoding="utf-8")):
        candidate = page.parent / m.group(1)
        if not candidate.exists():
            candidate = VENDORED_CSS.parent / m.group(1)
        if candidate.exists():
            order.append(candidate)
    return order


def check_no_shadowing() -> list[str]:
    if not VENDORED_CSS.exists():
        return [f"{VENDORED_CSS.relative_to(ROOT)} is missing. Run: python3 scripts/vendor_design_system.py --update"]

    # The pair is one unit: design_system.css is vendored too, and it deliberately supersedes two of the
    # token sheet's roles. What must not shadow either of them is a sheet WE write, and only a declaration
    # at document scope counts -- a scoped opt-in like [data-density="compact"] is the feature, not a clash.
    vendored: dict[str, list[str]] = {}
    for sheet in VENDORED_SHEETS:
        if sheet.exists():
            for name, values in custom_properties(sheet, global_only=True).items():
                vendored.setdefault(name, []).extend(values)

    problems: list[str] = []
    armed = 0
    checked: set[pathlib.Path] = set()
    for page in WEBUI_PAGES:
        order = loaded_stylesheets(page)
        linked = [s for s in VENDORED_SHEETS if s in order]
        if not linked:
            print(f"  shadowing: not applicable for {page.name} -- it links neither vendored sheet")
            continue
        armed += 1
        last = max(order.index(s) for s in linked)
        for path in order[last + 1:]:
            if path in checked or path in VENDORED_SHEETS:
                continue
            checked.add(path)
            for name, values in custom_properties(path, global_only=True).items():
                if name in vendored:
                    theirs = " / ".join(dict.fromkeys(vendored[name]))
                    ours = " / ".join(dict.fromkeys(values))
                    same = " (identical value -- still a second place one colour is decided)" \
                        if theirs == ours else \
                        f"\n      design system: {theirs}\n      this sheet:    {ours}"
                    problems.append(
                        f"{path.relative_to(ROOT)}: redeclares {name} AFTER the vendored sheets, so this "
                        f"value wins and the design system is overruled.{same}"
                    )
    print(f"  shadowing: armed on {armed} of {len(WEBUI_PAGES)} pages, {len(checked)} sheet(s) checked "
          f"against {len(vendored)} vendored document-scope properties")
    return problems


def check_vendored_order() -> list[str]:
    """Check 7: both vendored sheets are linked, tokens first, on every page that links either."""
    problems: list[str] = []
    if not VENDORED_SYSTEM_CSS.exists():
        return [
            f"{VENDORED_SYSTEM_CSS.relative_to(ROOT)} is missing. Run: "
            f"python3 scripts/vendor_design_system.py --update"
        ]
    pages = 0
    for page in WEBUI_PAGES:
        order = loaded_stylesheets(page)
        has_tokens, has_system = VENDORED_CSS in order, VENDORED_SYSTEM_CSS in order
        if not has_tokens and not has_system:
            continue
        pages += 1
        if not has_tokens:
            problems.append(
                f"{page.relative_to(ROOT)}: links {VENDORED_SYSTEM_CSS.name} without "
                f"{VENDORED_CSS.name}. The component sheet reads tokens it does not declare, so every "
                f"var() in it is invalid at computed-value time and the components render unstyled."
            )
            continue
        if not has_system:
            problems.append(
                f"{page.relative_to(ROOT)}: links {VENDORED_CSS.name} without "
                f"{VENDORED_SYSTEM_CSS.name}. The component sheet supersedes --ink-muted and "
                f"--surface-sunken, so this page paints values no other Redrob surface uses."
            )
            continue
        if order.index(VENDORED_SYSTEM_CSS) < order.index(VENDORED_CSS):
            problems.append(
                f"{page.relative_to(ROOT)}: links {VENDORED_SYSTEM_CSS.name} BEFORE "
                f"{VENDORED_CSS.name}. Both orders are valid CSS and both build green, but in this one "
                f"the token sheet's superseded --ink-muted and --surface-sunken win."
            )
    # Count pages that PASS, not pages inspected. Printing "3 of 3, tokens first" above a finding saying
    # one of them is in the wrong order is the same defect as the font summary's old "all shipped".
    print(f"  vendored sheet order: {pages - len(problems)} of {pages} page(s) linking the pair load it "
          f"correctly, tokens first")
    return problems


def our_sheets() -> list[pathlib.Path]:
    """Every sheet our pages load, except the vendored pair."""
    sheets: set[pathlib.Path] = set()
    for page in WEBUI_PAGES:
        sheets.update(loaded_stylesheets(page))
    sheets.difference_update(VENDORED_SHEETS)
    return sorted(sheets)


def vendored_declarations() -> set[str]:
    """Every custom property either vendored sheet declares, at any scope.

    Any scope, because this answers "may one of our rules read var(--x)": --control-height-md is declared
    at :root and again under [data-density="compact"], and a rule of ours that reads it is correct either
    way. Scope matters for shadowing, which is a different question and uses global_only.
    """
    names: set[str] = set()
    for sheet in VENDORED_SHEETS:
        if sheet.exists():
            names.update(custom_properties(sheet))
    return names


def check_css_references() -> list[str]:
    """Check 4: a var() in our sheets must name something the vendored pair declares."""
    if not VENDORED_CSS.exists():
        return []
    declared = vendored_declarations()
    problems: list[str] = []
    used = 0
    for path in our_sheets():
        own = set(custom_properties(path))  # a sheet may declare and use its own page-local property
        text = path.read_text(encoding="utf-8")
        for m in re.finditer(r"var\(\s*(--[a-zA-Z][\w-]*)", text):
            used += 1
            name = m.group(1)
            if name in declared or name in own:
                continue
            line = text.count("\n", 0, m.start()) + 1
            problems.append(
                f"{path.relative_to(ROOT)}:{line}: var({name}) names no design-system token and no "
                f"property this sheet declares. An undeclared custom property makes the whole declaration "
                f"invalid at computed-value time, so the rule silently does nothing."
            )
    print(f"  css token references resolved: {used}")
    return problems


def used_component_classes() -> set[str]:
    """The design system's `.rr-*` classes this browser's markup actually carries.

    The component sheet styles 149 blocks; a page reaches the rules for the ones it uses and no others.
    That distinction is what keeps check 5 honest after the component layer was vendored: `.rr-voice-1`
    names Newsreader in a literal fallback stack, so taking the sheet's mere PRESENCE as reach would
    demand 1.2 MB of serif for text nothing renders -- and taking it as no reach at all would let the
    first `class="rr-voice-1"` ship Georgia silently. So: read the markup.
    """
    used: set[str] = set()
    sources = list(WEBUI_PAGES)
    for page in WEBUI_PAGES:
        sources.extend(sorted(page.parent.glob("*.ts")))
    for path in sources:
        if not path.exists():
            continue
        for m in re.finditer(r"""(?:class|className|classList\.add|setAttribute\(\s*['"]class)[^\n]*""",
                             path.read_text(encoding="utf-8")):
            used.update(re.findall(r"\brr-[a-zA-Z0-9_-]+", m.group(0)))
    return used


def check_fonts() -> list[str]:
    """Check 5: every family a stack we can reach may select must be declared AND shipped."""
    if not VENDORED_CSS.exists():
        return []
    problems: list[str] = []
    bundle = VENDORED_CSS.parent

    def bundle_path(url: str) -> pathlib.Path:
        """Where a chrome:// page would actually fetch this src from.

        The sheet is served at chrome://redrob/design_tokens.css, so `../fonts/x.woff2` does NOT climb out
        of the host -- a URL cannot go above its root, and the browser clamps it to /fonts/x.woff2. Doing
        this with filesystem semantics instead would look for resources/fonts/ and wrongly report every
        font as missing.
        """
        cleaned = url
        while cleaned.startswith(('../', './')):
            cleaned = cleaned.split('/', 1)[1]
        return bundle / cleaned

    faces: dict[str, set[str]] = {}
    for path in our_sheets() + [s for s in VENDORED_SHEETS if s.exists()]:
        for block in re.findall(r"@font-face\s*\{([^{}]*)\}", path.read_text(encoding="utf-8")):
            family = re.search(r"font-family:\s*([^;]+);", block)
            src = re.search(r"url\(\s*['\"]?([^'\")]+)", block)
            if family and src:
                faces.setdefault(family.group(1).strip().strip("'\""), set()).add(src.group(1).strip())

    # Families the user agent provides itself; these correctly have no @font-face and no file.
    ua_provided = {
        "ui-monospace", "ui-sans-serif", "ui-serif", "ui-rounded", "system-ui", "-apple-system",
        "BlinkMacSystemFont", "sans-serif", "serif", "monospace", "cursive", "fantasy",
        # Faces a reader's OS may provide. Named in a stack as a last resort, never shipped by us.
        "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Nirmala UI", "Apple SD Gothic Neo",
        "Malgun Gothic", "Apple Myungjo", "Batang", "Georgia", "Times New Roman", "SFMono-Regular",
        "Menlo", "Consolas",
    }

    vendored: dict[str, list[str]] = {}
    for sheet in VENDORED_SHEETS:
        if sheet.exists():
            for name, values in custom_properties(sheet).items():
                vendored.setdefault(name, []).extend(values)

    def families_in(value: str) -> set[str]:
        """The literal family names a font-family value can select, fallbacks included."""
        out: set[str] = set()
        for family in re.sub(r"var\(\s*--[\w-]+\s*,?", "", value).replace(")", "").split(","):
            family = family.strip().strip("'\"")
            # A bare weight/style keyword from a `font:` shorthand is not a family.
            if family and not re.fullmatch(r"(?:\d+(?:\.\d+)?\S*|italic|normal|bold|oblique)", family):
                out.add(family)
        return out

    stacks: set[str] = set()
    reachable: set[str] = set()

    def harvest(text: str) -> None:
        for m in re.finditer(r"var\(\s*(--font-[\w-]+|--text-[\w-]+)", text):
            name = m.group(1)
            for value in vendored.get(name, [name]):
                inner = re.search(r"var\(\s*(--font-[\w-]+)", value)
                stacks.add(inner.group(1) if inner else name)

    for path in our_sheets():
        text = path.read_text(encoding="utf-8")
        harvest(text)
        for m in re.finditer(r"font-family:\s*([^;}]+)", text):
            reachable.update(families_in(m.group(1)))

    # The component sheet, but only the rules our markup can reach.
    used = used_component_classes()
    reached_rules = 0
    if VENDORED_SYSTEM_CSS.exists():
        system_css = strip_css_comments(VENDORED_SYSTEM_CSS.read_text(encoding="utf-8"))
        for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", system_css):
            selector, body = m.group(1), m.group(2)
            if "font" not in body:
                continue
            if not any(cls in selector for cls in used):
                continue
            reached_rules += 1
            harvest(body)
            for f in re.finditer(r"font-family:\s*([^;}]+)", body):
                reachable.update(families_in(f.group(1)))

    for token in sorted(stacks):
        values = vendored.get(token)
        if not values:
            problems.append(f"var({token}) is used but the design system declares no such token")
            continue
        reachable.update(families_in(values[0]))

    reachable -= ua_provided
    for family in sorted(reachable):
        urls = faces.get(family)
        if urls is None:
            problems.append(
                f"{family!r} can be selected by a stack this browser uses, but no @font-face declares it, "
                f"so it resolves only to whatever the reader happens to have installed locally."
            )
            continue
        missing = sorted(u for u in urls if not bundle_path(u).exists())
        if missing:
            problems.append(
                f"{family!r} is selectable and its face(s) point at {missing}, which are not in "
                f"{bundle.relative_to(ROOT)}. build_webui ships only what BUILD.gn lists, so those 404 at "
                f"runtime and the text silently falls through to the next family. Add them to "
                f"DESIGN_SYSTEM_PIN.json and to every bundle's input_files."
            )

    unreachable = sorted(set(faces) - reachable)
    # Not "all shipped" unconditionally: that text was printed even in the run that listed three missing
    # families right underneath it, so the summary contradicted the findings and the summary is what gets
    # read.
    shipped = len(reachable) - len(problems)
    print(f"  fonts: {len(reachable)} selectable families, {shipped} shipped; "
          f"{len(unreachable)} declared but unreachable ({', '.join(unreachable) or 'none'})")
    print(f"  component classes our markup uses: {len(used)}, reaching {reached_rules} font rule(s) "
          f"in {VENDORED_SYSTEM_CSS.name}")
    return problems


def resolved_css_tokens() -> dict[str, dict[str, str]]:
    """Every vendored token resolved to a literal, per theme, following var() chains.

    Both vendored sheets, in pin order, so a value design_system.css supersedes resolves to the superseded
    one -- which is what a page actually paints. Dark inherits light where it declares no override, as the
    cascade does. Values that are not a plain hex (rgba, gradients, composites) resolve to None and are
    skipped by the caller rather than guessed at.
    """
    per_theme: dict[str, dict[str, str]] = {"light": {}, "dark": {}}
    for sheet in VENDORED_SHEETS:
        if not sheet.exists():
            continue
        text = strip_css_comments(sheet.read_text(encoding="utf-8"))
        for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", text):
            selector, body = m.group(1).strip(), m.group(2)
            if not _is_global_selector(selector):
                continue
            theme = "dark" if ("dark" in selector or 'not([data-theme="light"])' in selector) else "light"
            for d in re.finditer(r"(--[a-zA-Z][\w-]*)\s*:\s*([^;]+)", body):
                per_theme[theme][d.group(1)] = " ".join(d.group(2).split())
    return {"light": dict(per_theme["light"]), "dark": {**per_theme["light"], **per_theme["dark"]}}


def check_header_matches_css() -> list[str]:
    """Check 8: a token defined in BOTH the native header and the CSS has the same value in both.

    This browser is the only Redrob surface that consumes both artifacts of one release, so it is the only
    one that can see them disagree -- and the disagreement is invisible by construction. The C++ chrome paints
    a muted label from the header; a WebUI page two pixels away paints a placeholder from the CSS; nine points
    per channel apart is not something anyone spots, and no build fails.
    """
    if not HEADER.exists():
        return []
    merged = resolved_css_tokens()

    def resolve(theme: str, name: str, depth: int = 0) -> str | None:
        value = merged[theme].get(name)
        if value is None or depth > 8:
            return None
        chained = re.fullmatch(r"var\(\s*(--[\w-]+)\s*\)", value)
        if chained:
            return resolve(theme, chained.group(1), depth + 1)
        return value if re.fullmatch(r"#[0-9a-fA-F]{6,8}", value) else None

    theme: str | None = None
    problems: list[str] = []
    compared = skipped = 0
    seen: set[tuple[str, str]] = set()
    for raw in HEADER.read_text(encoding="utf-8").splitlines():
        if re.match(r"\s*namespace light\b", raw):
            theme = "light"
            continue
        if re.match(r"\s*namespace dark\b", raw):
            theme = "dark"
            continue
        m = re.search(r"constexpr uint32_t (k\w+) = 0x([0-9A-Fa-f]{8});.*?(--[\w-]+)", raw)
        if not m or theme is None:
            continue
        const, header_value, token = m.group(1), m.group(2).upper(), m.group(3)
        css = resolve(theme, token)
        if css is None:
            skipped += 1
            continue
        compared += 1
        digits = css.lstrip("#").upper()
        want = ("FF" + digits) if len(digits) == 6 else (digits[6:8] + digits[0:6])
        if want == header_value:
            continue
        seen.add((theme, token))
        known = HEADER_CSS_DIVERGENCES.get((theme, token))
        if known is None:
            problems.append(
                f"{HEADER.relative_to(ROOT)}: ds::{theme}::{const} is 0x{header_value} but {token} resolves "
                f"to 0x{want} in the vendored CSS. One release, two artifacts, two different colours -- the "
                f"C++ chrome and a WebUI page would paint the same role differently with every build green. "
                f"Fix it in the design system's generator; if it is a known upstream gap, add it to "
                f"HEADER_CSS_DIVERGENCES in {pathlib.Path(__file__).name} with the reason."
            )
        elif known["css"] != f"0x{want}" or known["header"] != f"0x{header_value}":
            problems.append(
                f"{HEADER.relative_to(ROOT)}: the recorded divergence for ds::{theme}::{const} is stale -- "
                f"it says header {known['header']} / css {known['css']}, the tree says 0x{header_value} / "
                f"0x{want}. Re-read it before updating the entry: the pin moved under it."
            )
    for key in sorted(HEADER_CSS_DIVERGENCES.keys() - seen):
        problems.append(
            f"HEADER_CSS_DIVERGENCES still lists {key[0]}/{key[1]}, which now agrees. Remove the entry -- a "
            f"stale exemption silently permits the divergence coming back."
        )
    print(f"  header vs css: {compared} token(s) compared, {len(HEADER_CSS_DIVERGENCES)} known divergence(s), "
          f"{skipped} not a plain colour")
    return problems


def check_brand_artwork() -> list[str]:
    """Check 6: the logo files are the shipped ones, and no rule of ours modifies them."""
    problems: list[str] = []
    try:
        pin = json.loads(PIN.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        return [f"{PIN.name}: cannot read ({error})"]

    entries = pin.get("brand_assets", {}).get("files", {})
    if not entries:
        return [f"{PIN.name}: brand_assets.files is empty -- the logo would ship unpinned"]

    # 6a. Byte identity. Nothing in a build reads a PNG's pixels, so a re-export at a different size, a
    # nudged blue or a flattened gradient passes every other gate in this repo. 10-logo.md forbids all
    # three, and this hash is the only thing that can tell.
    checked = 0
    for relative, spec in sorted(entries.items()):
        path = ROOT / relative
        if not path.exists():
            problems.append(f"{relative}: pinned brand asset is missing")
            continue
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        expected = spec.get("sha256", "")
        if actual != expected:
            problems.append(
                f"{relative}: sha256 {actual[:12]}... does not match the pin ({expected[:12]}...). "
                f"The artwork is never redrawn, restretched, recolored or otherwise modified "
                f"(10-logo.md) -- restore it from {spec.get('delivery_path', 'the delivery')}, or "
                f"update the pin in the same commit if the DELIVERY changed.")
        checked += 1

    # 6b. Both grounds ship. A page that shows only the light file is exactly the defect this replaced:
    # the gradient symbol measured 1.00:1 on the dark page, and nothing failed.
    grounds = {spec.get("ground") for spec in entries.values()}
    for needed in ("light", "dark"):
        if needed not in grounds:
            problems.append(f"brand_assets: no file pinned for the {needed} ground")

    # 6c. No rule of ours modifies the mark. A mask, a filter, an opacity or a background on a mark
    # selector is a recolor or a fade -- both named under Incorrect usage in 10-logo.md -- and each one
    # reads as an ordinary styling tweak in review. The properties are matched inside the declaration
    # block of any selector mentioning the mark, which is why the block is parsed rather than grepped.
    banned = re.compile(r"^\s*(-webkit-)?(mask|mask-image|filter|backdrop-filter|opacity|background|"
                        r"background-image|background-color|box-shadow|text-shadow)\s*:", re.M)
    mark_selector = re.compile(r"(^|[\s,>+~])\.(mark|art-mark)\b(?![-\w])")
    armed = 0
    for sheet in our_sheets():
        stripped = strip_css_comments(sheet.read_text(encoding="utf-8"))
        for match in re.finditer(r"([^{}]*)\{([^{}]*)\}", stripped):
            selector = " ".join(match.group(1).split())
            body = match.group(2)
            # The selector has to name the mark itself. `.art-mark::after` is the plate BEHIND the mark,
            # which carries its own shadow and is not the artwork.
            if not mark_selector.search(selector) or "::" in selector:
                continue
            armed += 1
            for prop in banned.finditer(body):
                problems.append(
                    f"{sheet.relative_to(ROOT)}: `{prop.group(0).strip()}` on `{selector}` modifies the "
                    f"brand artwork. 10-logo.md allows height and width only -- use the file for the "
                    f"ground instead of recoloring or fading the one for the other ground.")

    # A self-check on the strip, because the failure mode of an over-eager comment scanner is a check that
    # passes on everything: a sheet that DOES style the mark and yields no mark rule means the parse lost
    # it rather than that the tree is clean.
    #
    # It has to tell that apart from the other way to find nothing: having no sheet at all, which is now
    # the real state -- all three C++ surfaces are deleted, so there is no page of ours left to style a
    # mark. Reporting a parse bug there would fail every build for a condition that is correct, and
    # reporting a silent pass would hide a genuine parse bug the day a page comes back. So the two are
    # separated and the empty case says what it is.
    sheets = our_sheets()
    if not armed and sheets:
        problems.append(f"check 6c read {len(sheets)} sheet(s) of ours and found no mark rule in any of "
                        "them -- the CSS parse is not reading them, so this check is passing vacuously")
    if not sheets:
        print("  brand: no WebUI sheet of ours remains, so there is no mark rule to check; the pinned "
              f"artwork itself was still verified ({checked} file(s) byte-identical)")
        return problems

    print(f"  brand: {checked} pinned artwork file(s) byte-identical, grounds {sorted(grounds)}, "
          f"{armed} mark rule(s) checked, none modifies the artwork")
    return problems


def check_icon_geometry() -> list[str]:
    """9. EVERY GLYPH IS THE DESIGN SYSTEM'S, AND NOTHING OVERRIDES ITS GEOMETRY.

    Two failure modes, and the second is the reason this check reads CSS as well as markup.

    A HAND-DRAWN GLYPH. `45-icons.md` is ten lines long and exact: a 24x24 box on a 20px live area, stroke
    2 unscaled, BUTT caps ("Never round"), miter joins at limit 3, every diagonal at 40 degrees, dots as a
    2x2 filled square. The delivery ships 252 glyphs drawn to it and a linter of its own. This browser drew
    16 by hand at 16x16 with round caps at stroke 1.3 to 1.6 -- and nothing anywhere could tell, because a
    build does not look at path data. They are now data, vendored from the release, so a literal coordinate
    in our markup or TypeScript means someone has started drawing again.

    A CSS OVERRIDE. This is the subtle one. `fill`, `stroke`, `stroke-width`, `stroke-linecap` and
    `stroke-linejoin` exist BOTH as SVG presentation attributes and as CSS properties, and the CSS wins.
    So a single `stroke-linecap: round` in our sheet silently defeats the vendored frame on every glyph it
    matches: the geometry is correct in the file, correct in the DOM, and wrong on screen. The five icon
    rules in this page all had exactly that before this check existed.

    Also refused: a `rotate: 45deg` or a `transform: rotate(45deg)` on an icon selector. A chevron made of
    two borders turned 45 degrees is a hand-drawn glyph that happens not to be an SVG, and the spec allows
    exactly two 45 degree exceptions (`close` and `spark`), neither of which can be built that way.
    """
    problems: list[str] = []

    if not ICON_TABLE.exists():
        return [
            f"{ICON_TABLE.relative_to(ROOT)} is missing. Run: "
            "python3 scripts/vendor_design_system.py --update"
        ]

    table = ICON_TABLE.read_text(encoding="utf-8")

    # The frame the vendored table declares, which is what every glyph in the page must be drawn on.
    frame = dict(re.findall(r'^\s+"([a-zA-Z-]+)": "([^"]*)",$', table, re.M))
    for attribute, expected in (("viewBox", "0 0 24 24"), ("stroke-width", "2"), ("stroke-linecap", "butt")):
        if frame.get(attribute) != expected:
            problems.append(
                f"design_icons.ts declares {attribute}={frame.get(attribute)!r}, not {expected!r}. The "
                f"vendored frame no longer matches 45-icons.md; re-vendor rather than editing it."
            )

    known = set(re.findall(r"^  ([a-zA-Z]+): \[", table, re.M))
    if not known:
        return ["parsed zero glyphs out of design_icons.ts; the check cannot judge anything"]

    # --- a hand-drawn glyph in our own markup or TypeScript -------------------------------------------
    #
    # Only OUR files. The vendored table is where the geometry is supposed to live, and the two vendored
    # stylesheets are not ours to edit.
    our_webui = sorted(
        p for page in WEBUI_PAGES
        for p in [page, page.with_suffix(".ts")]
        if p.exists() and p != ICON_TABLE
    )

    def coordinates(blob: str) -> list[tuple[str, str]]:
        """The coordinate-bearing attributes, normalised. Structure is deliberately NOT compared.

        The key may be bare (`points=` in markup) or quoted (`"points":` in the generated table), so the
        closing quote is optional -- without that this matched the markup, found nothing in the table, and
        reported every sprite as drifted against an empty list.
        """
        return sorted(
            (key, " ".join(value.split()))
            for key, value in re.findall(
                r'\b(d|points|cx|cy|r|rx|ry|x1|y1|x2|y2)["\']?\s*[:=]\s*["\']([^"\']*)["\']', blob
            )
        )

    # --- a transcribed <symbol> sprite, VERIFIED rather than forbidden --------------------------------
    #
    # The settings page cannot import the vendored table today: design_icons.ts is compiled by the
    # `redrob/` bundle's build_webui target, and a sibling bundle's ts_files are relative to its own
    # directory. So that page carries its two glyphs as an inline <symbol> sprite, transcribed by hand.
    #
    # Transcription is not the problem -- an UNVERIFIED transcription is. A symbol says which vendored
    # glyph it carries with `data-icon`, and every coordinate is compared against the table. Both match the
    # delivery exactly today; without this they would keep matching until the first re-pin moved one, and
    # then disagree with every other Redrob surface with nothing able to see it.
    #
    # Sharing the compiled module across the three bundles is the better answer and is a build change, so
    # it is its own slice in docs/UX-PROGRAMME.md rather than a rider here.
    verified_lines: dict[pathlib.Path, set[int]] = {}
    verified_symbols = 0
    for path in our_webui:
        text = path.read_text(encoding="utf-8")
        verified_lines[path] = set()
        for symbol in re.finditer(r'<symbol\b[^>]*\bdata-icon="([^"]+)"[^>]*>(.*?)</symbol>', text, re.S):
            name, body = symbol.group(1), symbol.group(2)
            first = text.count("\n", 0, symbol.start()) + 1
            verified_lines[path].update(range(first, text.count("\n", 0, symbol.end()) + 2))

            entry = re.search(r"^  " + re.escape(name) + r": (\[.*\]),$", table, re.M)
            if entry is None:
                problems.append(
                    f'{path.relative_to(ROOT)}:{first}: <symbol data-icon="{name}"> names a glyph that is '
                    f"not in design_icons.ts. Add it to ICONS in vendor_design_system.py."
                )
                continue

            if coordinates(body) != coordinates(entry.group(1)):
                problems.append(
                    f'{path.relative_to(ROOT)}:{first}: <symbol data-icon="{name}"> does not match '
                    f"design_icons.ts. Transcribed {coordinates(body)}, vendored "
                    f"{coordinates(entry.group(1))}. Re-transcribe from the table."
                )
            else:
                verified_symbols += 1

    # --- a hand-drawn glyph in our own markup or TypeScript -------------------------------------------
    #
    # Only OUR files. The vendored table is where the geometry is supposed to live, and the two vendored
    # stylesheets are not ours to edit.
    geometry_attribute = re.compile(r"""\b(d|points|cx|cy|r|rx|ry|x1|y1|x2|y2)\s*[:=]\s*['"]""")
    for path in our_webui:
        text = path.read_text(encoding="utf-8")
        for number, line in enumerate(text.split("\n"), start=1):
            if number in verified_lines[path]:
                continue  # inside a <symbol> whose coordinates were compared above
            if line.lstrip().startswith(("//", "*", "/*", "<!--")):
                continue
            if geometry_attribute.search(line):
                problems.append(
                    f"{path.relative_to(ROOT)}:{number}: looks like hand-drawn glyph geometry. Every glyph "
                    f"comes from design_icons.ts -- add the name to ICONS in vendor_design_system.py and "
                    f"use icon('name') or a data-icon shell."
                )

            # A data-icon naming a glyph the table does not carry renders as an empty <svg>. Read per LINE,
            # with the same comment skip, because this page's own documentation shows the attribute.
            for name in re.findall(r'data-icon="([^"]+)"', line):
                if name not in known:
                    problems.append(
                        f'{path.relative_to(ROOT)}:{number}: data-icon="{name}" is not in '
                        f"design_icons.ts, so it would render as an empty box. Add it to ICONS in "
                        f"vendor_design_system.py."
                    )

    # --- a CSS property that overrides the vendored frame --------------------------------------------
    overriding = ("fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit")
    sheets = our_sheets()
    for path in sheets:
        text = strip_css_comments(path.read_text(encoding="utf-8"))
        for selector, body in re.findall(r"([^{}]+)\{([^{}]*)\}", text):
            selector = " ".join(selector.split())
            # Only rules that can match an icon. A `fill` on something else is not this check's business.
            if not re.search(r"\bsvg\b|\bpath\b|\bcircle\b|\brect\b|\bline\b|\bpolyline\b|-caret|-icon", selector):
                continue
            for declaration in body.split(";"):
                if ":" not in declaration:
                    continue
                name, _, value = declaration.partition(":")
                name, value = name.strip(), value.strip()
                if name in overriding:
                    problems.append(
                        f"{path.relative_to(ROOT)}: `{selector}` sets {name}: {value}. CSS beats an SVG "
                        f"presentation attribute, so this overrides the vendored frame and the glyph is "
                        f"drawn to the wrong geometry while the file still says otherwise. Remove it -- "
                        f"design_icons.ts owns fill, stroke and every stroke-* property."
                    )
                if name in ("rotate", "transform") and "45" in value:
                    problems.append(
                        f"{path.relative_to(ROOT)}: `{selector}` sets {name}: {value}. 45-icons.md puts "
                        f"every directional mark on the 40 degree rake and names only two 45 degree "
                        f"exceptions (`close`, `spark`), so this is a hand-drawn glyph. Use a vendored one."
                    )

    print(f"  icons: {len(known)} vendored glyph(s) on a {frame.get('viewBox')} frame, "
          f"stroke {frame.get('stroke-width')} {frame.get('stroke-linecap')} caps; "
          f"{len(our_webui)} of our file(s) and {len(sheets)} sheet(s) checked, "
          f"{verified_symbols} transcribed sprite(s) match the table")
    return problems


def main() -> int:
    print("design-system use:")
    available = tokens_in_header()
    print(f"  vendored tokens: {len(available['light'])} light, {len(available['dark'])} dark")
    problems = (check_references(available) + check_no_new_literals() + check_no_shadowing()
                + check_vendored_order() + check_header_matches_css()
                + check_css_references() + check_fonts() + check_brand_artwork()
                + check_icon_geometry())
    if problems:
        print()
        print(f"{len(problems)} problem(s):")
        for problem in problems:
            print(f"  {problem}")
        return 1
    print("  ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
