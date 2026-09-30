#!/usr/bin/env python3
# Copyright 2026 Redrob. Portions copyright The Chromium Authors.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Copy the Redrob design system's resolved values into this source tree, and fail when the copy drifts.

WHY A COPY AT ALL. Every other Redrob product imports `@redrob-labs/ui` and reads its tokens through
`var()`. This one cannot. The window chrome -- tabs, sidebar, toolbar -- is painted by C++ views, which
has no CSS engine and therefore no `var(--surface-base)` to resolve; and the WebUI pages are assembled by
`build_webui` from files that are already in the tree when the build starts, so there is no node_modules
and no resolver to ask. The values have to arrive as literals, in the tree, before the build.

WHY A GATE. A copy that nobody checks is the failure this whole exercise exists to prevent: the browser
goes on painting last season's blue while the website, the console and the docs move, and nothing reports
it because a hardcoded colour is always internally consistent. Before this script the tree held a
hand-transcribed palette that had already drifted from the design system in four places -- the Red ramp's
first three steps and Blue 1 -- by one to thirteen points per channel. Nothing was broken; that is the
point. Drift of that size is invisible on screen and permanent in code.

WHAT IT REFUSES TO DO. It does not translate, round, re-derive or "fix" anything. Each destination file is
the upstream artifact byte for byte, with a provenance banner prepended where the format allows a comment.
Any transformation here would be a second place where a colour is decided, which is the thing being
removed. A vendored file is therefore never edited by hand: edit the design system, release it, re-pin.

USAGE
  python3 scripts/vendor_design_system.py              # check; exits 1 on drift. What CI runs.
  python3 scripts/vendor_design_system.py --update     # rewrite the vendored files from the pinned release
  python3 scripts/vendor_design_system.py --update --accept-new-integrity
                                                      # first fetch of a newly pinned version, which is
                                                      # the only case where the hash is not yet known

Needs nothing but a bare interpreter and network access to the registry, like the rest of this
repository's tooling.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import pathlib
import re
import sys
import tarfile
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PIN = ROOT / "DESIGN_SYSTEM_PIN.json"
REGISTRY = "https://registry.npmjs.org"

# Marker that makes a vendored file recognisable as vendored from its first line, so someone who opens it
# to change a colour is told where the colour actually lives before they change anything.
BANNER_LEAD = "VENDORED FROM THE REDROB DESIGN SYSTEM -- DO NOT EDIT."

# How a comment is written in each destination format. A file whose suffix is absent from this table is
# copied with no banner rather than with a banner in the wrong syntax: JSON has no comment form, and a
# `//` line at the top of a .json file makes it unparseable for every consumer.
COMMENT_STYLES = {
    ".h": ("// ", ""),
    ".css": ("/* ", " */"),
    ".ts": ("// ", ""),
}


# ---------------------------------------------------------------------------------------------------
# Icon geometry.
#
# The design system ships its 252 glyphs as a REACT MODULE -- `name: (p) => svg(p, [h('path', {d: …})])`.
# This browser's WebUI is TypeScript under Trusted Types with no React, no bundler and no node_modules at
# build time, and assigning `innerHTML` there throws. So a glyph cannot be imported; its geometry has to
# arrive as DATA, in the source tree, before the build -- exactly as the two stylesheets and the eight
# fonts already do.
#
# This is therefore the one vendored artifact that is DERIVED rather than copied: the module is parsed and
# re-emitted as a frozen table. That makes the transform itself a thing that can be wrong, so it is
# deliberately narrow -- it reads only `h("tag", { … })` calls and copies each attribute VERBATIM, never
# reformatting a number or rounding a coordinate. It refuses on anything it does not recognise instead of
# silently emitting a glyph with a missing element, because a dropped `<path>` is a glyph that still draws.
#
# The frame is transcribed from the module's own `svg()` helper rather than retyped, so the ten rules in
# 45-icons.md -- 24x24 box, stroke 2, BUTT caps, miter joins at limit 3 -- come from the delivery and not
# from anyone's memory of them.
# ---------------------------------------------------------------------------------------------------

# Which design-system glyph plays which part in this browser. Every entry is justified from 45-icons.md in
# docs/UX-PROGRAMME.md; the two that were previously recorded as having no equivalent are `steered` and
# `thinking`, and both do:
#
#   steered  -> `route`, the Evidence group's staircase. The spec's own note is "beads on a line lose to a
#               staircase (`route` has no beads)". A steer is the run's path turning.
#   thinking -> `pulse`. NOT `sparkle`, which the spec reserves ("`sparkle` is for generated content
#               only"), and not `spark` ("use sparingly"). The glyph being replaced is a bare circle, which
#               the spec lists BY NAME as a way an icon fails: "a primitive rather than a thing".
#
# `pending` is not a judgement call either -- the spec says "`pending` is three dots, not a clock" and
# distinguishes it from `clock` as "a time vs a wait with no time", which is what a queued message is.
# React prop name -> SVG attribute name, as an explicit TABLE rather than a camelCase-to-kebab RULE.
#
# The rule was tried first and is wrong: SVG attribute names are case-sensitive and `viewBox` is one of the
# handful that are genuinely camelCase, so the rule emitted `view-box`, which the parser ignores -- every
# glyph would have rendered at the default 0 0 300 150 viewBox and been invisibly mis-scaled. Enumerating
# them means an attribute nobody anticipated FAILS the vendor step instead of being silently mangled.
SVG_ATTRIBUTES = {
    "viewBox": "viewBox",
    "fill": "fill",
    "stroke": "stroke",
    "strokeWidth": "stroke-width",
    "strokeLinecap": "stroke-linecap",
    "strokeLinejoin": "stroke-linejoin",
    "strokeMiterlimit": "stroke-miterlimit",
    "focusable": "focusable",
    "aria-hidden": "aria-hidden",
    "d": "d",
    "points": "points",
    "x": "x",
    "y": "y",
    "x1": "x1",
    "y1": "y1",
    "x2": "x2",
    "y2": "y2",
    "cx": "cx",
    "cy": "cy",
    "r": "r",
    "rx": "rx",
    "ry": "ry",
    "width": "width",
    "height": "height",
    "transform": "transform",
}


def svg_attribute(name: str, where: str) -> str:
    attribute = SVG_ATTRIBUTES.get(name)
    if attribute is None:
        sys.exit(
            f"{where}: the icon module uses the attribute {name!r}, which is not in SVG_ATTRIBUTES. Add it "
            f"with its correct SVG spelling -- do NOT let this script guess, because SVG attribute names "
            f"are case-sensitive and a mangled one is ignored rather than rejected."
        )
    return attribute


ICONS = [    "alert",          # a task that cannot be found
    "blocked",        # kRefused
    "browser",        # kOpenedPage
    "camera",         # kCapturedScreenshot
    "chevronDown",    # the composer selects' own caret
    "chevronLeft",    # back, out of an open task
    "close",          # withdraw a queued message
    "history",        # kSearchedMemory
    "key",            # kUsedCredential
    "list",           # kPlanned
    "pending",        # kQueuedMessage
    "pulse",          # kThinking
    "repeat",         # kRoutine
    "route",          # kSteered
    "save",           # kSavedArtifact
    "search",         # the settings page's filter field
    "shieldCheck",    # the permission mode control
    "split",          # kSpawnedSubagents
]


def derive_icons(module: bytes) -> bytes:
    """Parse the delivery's React icon module into a frozen TypeScript geometry table."""
    text = module.decode("utf-8")

    # The shared frame, read out of the module's own svg() helper.
    helper = re.search(r"function svg\(props, children\) \{.*?Object\.assign\(\{([^}]*)\}", text, re.S)
    if helper is None:
        sys.exit("could not find the icon module's svg() helper; the package layout changed")
    frame: dict[str, str] = {}
    for m in re.finditer(r"(?:'(?P<q>[^']+)'|(?P<b>[A-Za-z]+)):\s*(?:'(?P<s>[^']*)'|(?P<n>[0-9.]+))", helper.group(1)):
        name = m.group("q") or m.group("b")
        literal = m.group("s") if m.group("s") is not None else m.group("n")
        if name in ("width", "height"):
            continue  # sized by CSS here (1em), not by the element
        frame[svg_attribute(name, "icon frame")] = literal

    for required in ("viewBox", "stroke-width", "stroke-linecap", "stroke-linejoin"):
        if required not in frame:
            sys.exit(f"the icon module's frame no longer declares {required}; refusing to guess it")
    if frame["stroke-linecap"] != "butt":
        sys.exit(f"the icon module's frame declares stroke-linecap {frame['stroke-linecap']!r}, not butt")

    glyphs: dict[str, list] = {}
    for name in ICONS:
        entry = re.search(r"^ {4}" + re.escape(name) + r": \(p\) => svg\(p, (.*)\),$", text, re.M)
        if entry is None:
            sys.exit(f"the icon module has no glyph named {name!r}; the pin's icon list is out of date")

        body = entry.group(1)
        elements = []
        for call in re.finditer(r'h\("(?P<tag>\w+)",\s*\{(?P<attrs>[^{}]*)\}\)', body):
            attributes = []
            for attr in re.finditer(
                r'(?:"(?P<q>[^"]+)"|(?P<b>\w+)):\s*(?:"(?P<s>[^"]*)"|(?P<n>-?[0-9.]+))', call.group("attrs")
            ):
                key = attr.group("q") or attr.group("b")
                if key == "key":
                    continue  # React's list key; it is not geometry and does not belong in the DOM
                literal = attr.group("s") if attr.group("s") is not None else attr.group("n")
                attributes.append((svg_attribute(key, f"glyph {name!r}"), literal))
            elements.append((call.group("tag"), attributes))

        # A glyph with no element would render as nothing while every gate stayed green.
        if not elements:
            sys.exit(f"parsed zero elements out of the glyph {name!r}; the module's shape changed")
        # Every h(...) in the body must have been consumed. A glyph that lost one still draws.
        if body.count("h(") != len(elements):
            sys.exit(
                f"the glyph {name!r} contains {body.count('h(')} elements but only {len(elements)} parsed; "
                "refusing to emit a glyph with a missing part"
            )
        glyphs[name] = elements

    lines = [
        "/* eslint-disable */",
        "// The 16 design-system glyphs this browser draws, as data.",
        "//",
        "// DERIVED, not copied: the delivery ships these as a React module, and this is a WebUI under",
        "// Trusted Types with no React and no bundler, where assigning innerHTML throws. Every attribute",
        "// below is verbatim from that module -- no coordinate has been reformatted or rounded.",
        "",
        "export type IconElement = [string, Record<string, string>];",
        "",
        "// The frame every glyph shares, read from the delivery's own svg() helper rather than retyped.",
        "// 45-icons.md: 24x24 box on a 20px live area, stroke 2 unscaled, BUTT caps ('Never round'),",
        "// miter joins at limit 3. Size comes from CSS (1em), so width/height are deliberately absent.",
        "export const ICON_FRAME: Record<string, string> = {",
    ]
    for key, value in frame.items():
        lines.append(f"  {json.dumps(key)}: {json.dumps(value)},")
    lines += ["};", "", "export const ICONS: Record<string, IconElement[]> = {"]
    for name, elements in glyphs.items():
        parts = []
        for tag, attributes in elements:
            attrs = ", ".join(f"{json.dumps(k)}: {json.dumps(v)}" for k, v in attributes)
            parts.append(f"[{json.dumps(tag)}, {{{attrs}}}]")
        lines.append(f"  {name}: [{', '.join(parts)}],")
    lines += ["};", ""]
    return "\n".join(lines).encode("utf-8")


DERIVATIONS = {"icons": derive_icons}

def load_pin() -> dict:
    if not PIN.exists():
        sys.exit(f"{PIN.name} is missing; it is what says which design-system release this tree is built against")
    try:
        pin = json.loads(PIN.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        sys.exit(f"{PIN.name} is not valid JSON: {exc}")
    for field in ("package", "version", "files"):
        if not pin.get(field):
            sys.exit(f"{PIN.name} has no {field!r}")
    return pin


def fetch_tarball(package: str, version: str) -> bytes:
    """Download the published tarball for exactly this version.

    The URL is read from the registry's version document rather than assembled from the package name.
    A scoped package's tarball path is not a mechanical function of its name -- npm has changed that
    mapping before -- and guessing it turns a rename into a 404 at build time.
    """
    doc_url = f"{REGISTRY}/{package.replace('/', '%2F')}/{version}"
    try:
        with urllib.request.urlopen(doc_url, timeout=60) as response:
            doc = json.loads(response.read().decode("utf-8"))
    except Exception as exc:  # network, HTTP status, JSON -- the remedy is the same
        sys.exit(f"cannot read the registry document for {package}@{version}: {exc}")

    tarball_url = doc.get("dist", {}).get("tarball")
    if not tarball_url:
        sys.exit(f"{package}@{version} has no dist.tarball in its registry document")
    try:
        with urllib.request.urlopen(tarball_url, timeout=120) as response:
            return response.read()
    except Exception as exc:
        sys.exit(f"cannot download {tarball_url}: {exc}")


def integrity_of(blob: bytes) -> str:
    """npm's integrity form: sha512 of the tarball, base64, prefixed with the algorithm."""
    return "sha512-" + base64.b64encode(hashlib.sha512(blob).digest()).decode("ascii")


def check_integrity(blob: bytes, pinned: str, accept_new: bool) -> str:
    actual = integrity_of(blob)
    if not pinned:
        if not accept_new:
            sys.exit(
                "the pin has no integrity. Re-run with --update --accept-new-integrity to record it, and\n"
                f"put this value in {PIN.name}:\n  {actual}"
            )
        return actual
    if actual != pinned:
        # A published npm version is immutable, so this is never a new release.
        sys.exit(
            "the downloaded tarball does not match the pinned integrity. A published version cannot\n"
            "change, so this is a tampered or corrupted fetch, not an upgrade. Refusing to vendor.\n"
            f"  pinned: {pinned}\n  actual: {actual}"
        )
    return actual


def extract(blob: bytes, wanted: list[str]) -> dict[str, bytes]:
    """Pull exactly the named members out of the package.

    Members are addressed by their full name and read individually, so a path that moved in a new release
    costs that one file and a clear error rather than a silently short result. npm packages put everything
    under `package/`.
    """
    found: dict[str, bytes] = {}
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
        for name in wanted:
            member_name = f"package/{name}"
            try:
                member = tar.getmember(member_name)
            except KeyError:
                sys.exit(f"the package does not contain {member_name}; the pin's file map is out of date")
            if not member.isfile():
                sys.exit(f"{member_name} is not a regular file")
            handle = tar.extractfile(member)
            if handle is None:
                sys.exit(f"{member_name} could not be read from the tarball")
            found[name] = handle.read()
    return found


def with_banner(source: str, destination: pathlib.Path, pin: dict, payload: bytes) -> bytes:
    """Prepend provenance, in the destination format's own comment syntax."""
    style = COMMENT_STYLES.get(destination.suffix)
    if style is None:
        return payload
    open_c, close_c = style
    lines = [
        f"{BANNER_LEAD}",
        f"source: {pin['package']}@{pin['version']}  {source}",
        f"commit: {pin.get('gitHead', 'unrecorded')}",
        "",
        "Regenerate with: python3 scripts/vendor_design_system.py --update",
        "A value changed here is a value that disagrees with every other Redrob product.",
    ]
    banner = "".join(f"{open_c}{line}{close_c}\n" if line else f"{open_c.rstrip()}{close_c}\n" for line in lines)
    return banner.encode("utf-8") + b"\n" + payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--update", action="store_true", help="rewrite the vendored files instead of checking them")
    parser.add_argument(
        "--accept-new-integrity",
        action="store_true",
        help="record the hash of a newly pinned version; only valid with --update and an empty pinned integrity",
    )
    args = parser.parse_args()

    pin = load_pin()
    blob = fetch_tarball(pin["package"], pin["version"])
    actual_integrity = check_integrity(blob, pin.get("integrity", ""), args.accept_new_integrity and args.update)

    # Verbatim copies and derived files are fetched together but written by different rules, so the pin
    # keeps them in separate maps: a reader can see at a glance which files are a byte copy of the release
    # and which ones this script transformed.
    derived_spec = pin.get("derived", {})
    extracted = extract(blob, list(pin["files"].keys()) + [d["source"] for d in derived_spec.values()])

    plan: list[tuple[str, str, bytes]] = []
    for source, relative_destination in pin["files"].items():
        destination = ROOT / relative_destination
        plan.append((source, relative_destination, with_banner(source, destination, pin, extracted[source])))
    for kind, spec in derived_spec.items():
        transform = DERIVATIONS.get(kind)
        if transform is None:
            sys.exit(f"the pin asks for a '{kind}' derivation, which this script does not implement")
        destination = ROOT / spec["destination"]
        payload = transform(extracted[spec["source"]])
        plan.append((spec["source"], spec["destination"], with_banner(spec["source"], destination, pin, payload)))

    drifted: list[str] = []
    written: list[str] = []
    for source, relative_destination, expected in plan:
        destination = ROOT / relative_destination
        if args.update:
            destination.parent.mkdir(parents=True, exist_ok=True)
            if not destination.exists() or destination.read_bytes() != expected:
                destination.write_bytes(expected)
                written.append(relative_destination)
        else:
            if not destination.exists():
                drifted.append(f"{relative_destination}: missing")
            elif destination.read_bytes() != expected:
                have, want = destination.read_bytes(), expected
                drifted.append(
                    f"{relative_destination}: differs from {pin['package']}@{pin['version']} "
                    f"({len(have)} bytes on disk, {len(want)} expected)"
                )

    print(f"{pin['package']}@{pin['version']}  ({len(pin['files'])} vendored files, {len(derived_spec)} derived)")
    print(f"  integrity verified: {actual_integrity[:23]}...")

    if args.update:
        if not pin.get("integrity") and args.accept_new_integrity:
            print()
            print(f"record this in {PIN.name} before committing:")
            print(f'  "integrity": "{actual_integrity}",')
        for name in written:
            print(f"  updated  {name}")
        if not written:
            print("  already up to date; nothing written")
        return 0

    if drifted:
        print()
        print("DRIFT -- a vendored file no longer matches the pinned release:")
        for line in drifted:
            print(f"  {line}")
        print()
        print("Either the file was edited by hand (edit the design system instead and re-pin), or the pin")
        print("moved without the files being regenerated. Fix with:")
        print("  python3 scripts/vendor_design_system.py --update")
        return 1

    print("  no drift")
    return 0


if __name__ == "__main__":
    sys.exit(main())
