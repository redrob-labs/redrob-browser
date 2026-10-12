#!/usr/bin/env python3
"""Generate the fork's grit strings file and its translations from l10n/*.tsv.

Why generate rather than hand-write. A localized string has to exist in three places that must agree:
the English message in a .grd, the Korean text in a .xtb keyed by a hash of the English, and a
compile-time id in C++ or a $i18n{} key in the WebUI. Hand-maintaining that is how a string ends up
translated in one place and English in another, which is exactly the defect this whole change exists
to remove. So one TSV row per string is the source of truth and everything else is derived --
the same arrangement patches/ and redrob-version.txt already use.

  l10n/*.tsv                              key <TAB> English <TAB> Korean [<TAB> description]
    -> sources/chrome/browser/redrob/resources/redrob_strings.grd
    -> sources/chrome/browser/redrob/resources/translations/redrob_strings_ko.xtb

The .xtb id is a fingerprint of the English text, and grit computes it with
`str(FP.FingerPrint(presentable_content) & 0x7FFFFFFFFFFFFFFF)`. That algorithm is reimplemented here
so `check` works without a Chromium checkout, and cross-checked against grit's own module whenever a
checkout IS present -- because the failure mode of a wrong id is SILENT: grit ignores a translation it
cannot match and falls back to English, so a typo would ship an untranslated UI and a green build.

Placeholders: write $1, $2 in both the English and the Korean column. They become <ph> nodes, which is
the only form grit accepts, and the Korean is free to put them in a different order.
"""

from __future__ import annotations

import hashlib
import pathlib
import re
import sys
import xml.sax.saxutils as sax

ROOT = pathlib.Path(__file__).resolve().parent.parent
L10N = ROOT / "l10n"
OUT_DIR = ROOT / "sources" / "chrome" / "browser" / "redrob" / "resources"
GRD = OUT_DIR / "redrob_strings.grd"
XTB_DIR = OUT_DIR / "translations"
WEBUI_HEADER = OUT_DIR / "redrob_localized_strings.h"

# Every language whose text lives in a TSV column. The column index is the position in this list plus
# two, so English is column 1 and the first translation is column 2.
TRANSLATIONS = ["ko"]

KEY_RE = re.compile(r"^[a-z][A-Za-z0-9]*$")
PH_RE = re.compile(r"\$([1-9])")

GENERATED_BY = "scripts/gen_strings.py"

# The agent extension and the onboarding page: the same row format in their own directory, because they
# are a different consumer. Nothing here goes through grit, so the one-English-per-row rule above does
# not apply -- "Close" on a dialog and "Close" on a panel are one string to grit but two keys here, and a
# translator is entitled to render them differently.
EXT_L10N = L10N / "extension"
EXT_TS = ROOT / "agent" / "packages" / "i18n" / "src" / "messages.generated.ts"
# chrome.i18n reads these for the manifest's own name, title and description, which no page code can
# reach. Only rows in the manifest table go here; every page string goes through EXT_TS.
EXT_LOCALES = ROOT / "agent" / "apps" / "app" / "public" / "_locales"
EXT_MANIFEST_TABLE = "00-manifest.tsv"


def grit_message_id(presentable: str) -> str:
    """grit's message id: the first 64 bits of the md5, read as signed, high bit stripped.

    Reimplemented from tools/grit/grit/extern/{FP,tclib}.py. `presentable` is the message text with
    each placeholder replaced by its <ph name>, which is what grit hashes -- not the $1 form.
    """
    fp = int(hashlib.md5(presentable.encode("utf-8")).hexdigest()[:16], 16)
    if fp & 0x8000000000000000:
        fp = -((~fp & 0xFFFFFFFFFFFFFFFF) + 1)
    return str(fp & 0x7FFFFFFFFFFFFFFF)


def ph_name(index: str) -> str:
    return f"ARG{index}"


def presentable(text: str) -> str:
    """What grit hashes: placeholders shown by name."""
    return PH_RE.sub(lambda m: ph_name(m.group(1)), text)


def grd_body(text: str) -> str:
    """The message body as grit wants it: escaped text, placeholders as <ph> nodes."""
    out: list[str] = []
    pos = 0
    for m in PH_RE.finditer(text):
        out.append(sax.escape(text[pos : m.start()]))
        out.append(f'<ph name="{ph_name(m.group(1))}">${m.group(1)}<ex>{m.group(1)}</ex></ph>')
        pos = m.end()
    out.append(sax.escape(text[pos:]))
    return "".join(out)


def xtb_body(text: str) -> str:
    """A translation refers to a placeholder by name only; its content lives in the .grd."""
    out: list[str] = []
    pos = 0
    for m in PH_RE.finditer(text):
        out.append(sax.escape(text[pos : m.start()]))
        out.append(f'<ph name="{ph_name(m.group(1))}"/>')
        pos = m.end()
    out.append(sax.escape(text[pos:]))
    return "".join(out)


def read_rows() -> list[tuple[str, list[str], str, pathlib.Path, int]]:
    """(key, [english, *translations], description, file, lineno), in TSV file-name order."""
    rows: list[tuple[str, list[str], str, pathlib.Path, int]] = []
    seen: dict[str, str] = {}
    files = sorted(p for p in L10N.glob("*.tsv") if p.name != "locales.tsv")
    if not files:
        sys.exit(f"no string tables in {L10N}")
    for path in files:
        for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not raw.strip() or raw.lstrip().startswith("#"):
                continue
            parts = raw.split("\t")
            if len(parts) < 2 + len(TRANSLATIONS):
                sys.exit(f"{path.name}:{lineno}: expected {2 + len(TRANSLATIONS)} tab-separated "
                         f"columns (key, en, {', '.join(TRANSLATIONS)}), got {len(parts)}")
            key, texts = parts[0].strip(), [p.strip() for p in parts[1 : 2 + len(TRANSLATIONS)]]
            desc = parts[2 + len(TRANSLATIONS)].strip() if len(parts) > 2 + len(TRANSLATIONS) else ""
            if not KEY_RE.match(key):
                sys.exit(f"{path.name}:{lineno}: key {key!r} must be lowerCamelCase")
            if key in seen:
                sys.exit(f"{path.name}:{lineno}: key {key!r} already defined in {seen[key]}")
            seen[key] = f"{path.name}:{lineno}"
            if not texts[0]:
                sys.exit(f"{path.name}:{lineno}: {key} has no English text")
            for lang, text in zip(TRANSLATIONS, texts[1:]):
                if not text:
                    sys.exit(f"{path.name}:{lineno}: {key} has no {lang} text -- an untranslated "
                             f"string must be deliberate, so say so with the English text repeated")
                if sorted(PH_RE.findall(text)) != sorted(PH_RE.findall(texts[0])):
                    sys.exit(f"{path.name}:{lineno}: {key} uses different placeholders in "
                             f"{lang} than in English")
            rows.append((key, texts, desc, path, lineno))

    # Two messages with identical English are ONE string to grit: the message id is a fingerprint of the
    # text, so they share a clique and a second <translation> for the same id trips an assert deep inside
    # xtb_reader. Refusing here says so in one line instead, and the fix is always the same -- delete the
    # second row and point its callers at the first key.
    by_text: dict[str, str] = {}
    for key, texts, _desc, path, lineno in rows:
        text = presentable(texts[0])
        if text in by_text:
            sys.exit(f"{path.name}:{lineno}: {key} has the same English text as {by_text[text]} "
                     f"({texts[0]!r}). grit cannot tell them apart -- drop this row and use "
                     f"{by_text[text]} everywhere instead.")
        by_text[text] = key
    return rows


def ids_name(key: str) -> str:
    return "IDS_REDROB_" + re.sub(r"(?<!^)(?=[A-Z])", "_", key).upper()


def locales() -> list[tuple[str, str]]:
    pairs = []
    for raw in (L10N / "locales.tsv").read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        suffix, lang = raw.split("\t")
        pairs.append((suffix.strip(), lang.strip()))
    return pairs


def render_grd(rows) -> str:
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f"<!-- GENERATED by {GENERATED_BY} from l10n/*.tsv. Do not edit: edit the TSV. -->",
        '<grit base_dir="." latest_public_release="0" current_release="1"',
        '      source_lang_id="en" enc_check="möl">',
        "  <outputs>",
        '    <output filename="grit/redrob_strings.h" type="rc_header">',
        "      <emit emit_type='prepend'></emit>",
        "    </output>",
    ]
    for suffix, lang in locales():
        out.append(f'    <output filename="redrob_strings_{suffix}.pak" '
                   f'type="data_package" lang="{lang}" />')
    out += ["  </outputs>", "  <translations>"]
    for lang in TRANSLATIONS:
        out.append(f'    <file path="translations/redrob_strings_{lang}.xtb" lang="{lang}" />')
    out += ["  </translations>", '  <release seq="1" allow_pseudo="false">', "    <messages fallback_to_english=\"true\">"]
    for key, texts, desc, _path, _line in rows:
        # escape() with an explicit " entity rather than quoteattr(): quoteattr switches to single quotes
        # when the value contains a double quote, and slicing its result off then produces a broken
        # attribute -- which grit reports as an XML parse error 200 lines away from the cause.
        attr = sax.escape(desc or key, {'"': "&quot;"})
        out.append(f'      <message name="{ids_name(key)}" '
                   f'desc="{attr}">{grd_body(texts[0])}</message>')
    out += ["    </messages>", "  </release>", "</grit>", ""]
    return "\n".join(out)


def render_xtb(rows, lang: str) -> str:
    column = 1 + TRANSLATIONS.index(lang) + 1
    out = [
        '<?xml version="1.0" ?>',
        '<!DOCTYPE translationbundle>',
        f"<!-- GENERATED by {GENERATED_BY} from l10n/*.tsv. Do not edit: edit the TSV. -->",
        f'<translationbundle lang="{lang}">',
    ]
    for key, texts, _desc, _path, _line in rows:
        out.append(f'<translation id="{grit_message_id(presentable(texts[0]))}">'
                   f"{xtb_body(texts[column - 1])}</translation>")
    out += ["</translationbundle>", ""]
    return "\n".join(out)


def render_webui_header(rows) -> str:
    """The key -> IDS_ table each WebUI data source hands to AddLocalizedStrings.

    One table for all three pages rather than one per page. A per-page split would have to be kept in step
    with which page uses which string -- and the cost of getting that wrong is a $i18n{} that survives into
    the served HTML as literal text, where the saving is a few kilobytes of strings per page load.
    """
    out = [
        "// Copyright 2026 Redrob. Portions copyright The Chromium Authors.",
        "// Use of this source code is governed by a BSD-style license that can be",
        "// found in the LICENSE file.",
        "",
        f"// GENERATED by {GENERATED_BY} from l10n/*.tsv. Do not edit: edit the TSV.",
        "",
        "#ifndef CHROME_BROWSER_REDROB_RESOURCES_REDROB_LOCALIZED_STRINGS_H_",
        "#define CHROME_BROWSER_REDROB_RESOURCES_REDROB_LOCALIZED_STRINGS_H_",
        "",
        "#include \"chrome/browser/redrob/resources/grit/redrob_strings.h\"",
        "#include \"ui/base/webui/web_ui_util.h\"",
        "",
        "namespace redrob {",
        "",
        "inline constexpr webui::LocalizedString kRedrobLocalizedStrings[] = {",
    ]
    for key, _texts, _desc, _path, _line in rows:
        out.append(f'    {{"{key}", {ids_name(key)}}},')
    out += [
        "};",
        "",
        "}  // namespace redrob",
        "",
        "#endif  // CHROME_BROWSER_REDROB_RESOURCES_REDROB_LOCALIZED_STRINGS_H_",
        "",
    ]
    return "\n".join(out)


def cross_check(rows) -> str | None:
    """Verify our fingerprint against grit's own, when a checkout is here to ask.

    A wrong id fails silently -- grit drops the unmatched translation and the string ships in English
    -- so this is the only cheap way to know the ids are right before a three-hour build.
    """
    grit_dir = ROOT / "chromium" / "src" / "tools" / "grit"
    if not (grit_dir / "grit" / "extern" / "tclib.py").exists():
        return None
    sys.path.insert(0, str(grit_dir))
    try:
        from grit.extern import tclib  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover
        return f"grit is present but not importable: {exc}"
    bad = [key for key, texts, *_ in rows
           if tclib.GenerateMessageId(presentable(texts[0])) != grit_message_id(presentable(texts[0]))]
    if bad:
        return f"fingerprint disagrees with grit for: {', '.join(bad[:5])}"
    return f"ids cross-checked against grit for all {len(rows)} messages"


def read_extension_rows() -> list[tuple[str, list[str], str, pathlib.Path, int]]:
    """The extension's rows: the browser's validation minus the grit-only rule about duplicate English."""
    rows: list[tuple[str, list[str], str, pathlib.Path, int]] = []
    seen: dict[str, str] = {}
    for path in sorted(EXT_L10N.glob("*.tsv")):
        for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not raw.strip() or raw.lstrip().startswith("#"):
                continue
            parts = raw.split("\t")
            where = f"extension/{path.name}:{lineno}"
            if len(parts) < 2 + len(TRANSLATIONS):
                sys.exit(f"{where}: expected {2 + len(TRANSLATIONS)} tab-separated columns "
                         f"(key, en, {', '.join(TRANSLATIONS)}), got {len(parts)}")
            key, texts = parts[0].strip(), [p.strip() for p in parts[1 : 2 + len(TRANSLATIONS)]]
            desc = parts[2 + len(TRANSLATIONS)].strip() if len(parts) > 2 + len(TRANSLATIONS) else ""
            if not KEY_RE.match(key):
                sys.exit(f"{where}: key {key!r} must be lowerCamelCase")
            if key in seen:
                sys.exit(f"{where}: key {key!r} already defined in {seen[key]}")
            seen[key] = where
            if not texts[0]:
                sys.exit(f"{where}: {key} has no English text")
            for lang, text in zip(TRANSLATIONS, texts[1:]):
                if not text:
                    sys.exit(f"{where}: {key} has no {lang} text -- an untranslated string must be "
                             f"deliberate, so say so with the English text repeated")
                if sorted(PH_RE.findall(text)) != sorted(PH_RE.findall(texts[0])):
                    sys.exit(f"{where}: {key} uses different placeholders in {lang} than in English")
            rows.append((key, texts, desc, path, lineno))
    return rows


def render_extension_ts(rows) -> str:
    def table(index: int) -> str:
        # json.dumps is a valid TypeScript string literal, escapes included.
        import json  # noqa: PLC0415
        return "\n".join(f"  {key}: {json.dumps(texts[index], ensure_ascii=False)}," for key, texts, *_ in rows)

    out = [
        f"// GENERATED by {GENERATED_BY} from l10n/extension/*.tsv. Do not edit: edit the TSV.",
        "",
        "const en = {",
        table(0),
        "} as const",
        "",
        "export type MessageKey = keyof typeof en",
        "",
    ]
    for i, lang in enumerate(TRANSLATIONS, 1):
        out += [f"const {lang}: Record<MessageKey, string> = {{", table(i), "}", ""]
    langs = ", ".join(["en", *TRANSLATIONS])
    out += [
        f"export const messages: Record<{' | '.join(json_str(x) for x in ['en', *TRANSLATIONS])}, "
        f"Record<MessageKey, string>> = {{ {langs} }}",
        "",
    ]
    return "\n".join(out)


def json_str(value: str) -> str:
    import json  # noqa: PLC0415
    return json.dumps(value)


def render_extension_locale(rows, index: int) -> str:
    import json  # noqa: PLC0415
    body = {
        key: ({"message": texts[index], "description": desc} if desc else {"message": texts[index]})
        for key, texts, desc, path, _ in rows
        if path.name == EXT_MANIFEST_TABLE
    }
    return json.dumps(body, ensure_ascii=False, indent=2) + "\n"


def generate() -> tuple[dict[pathlib.Path, str], list[tuple[str, list[str], str, pathlib.Path, int]]]:
    rows = read_rows()
    files = {GRD: render_grd(rows), WEBUI_HEADER: render_webui_header(rows)}
    for lang in TRANSLATIONS:
        files[XTB_DIR / f"redrob_strings_{lang}.xtb"] = render_xtb(rows, lang)
    if EXT_L10N.is_dir():
        ext = read_extension_rows()
        files[EXT_TS] = render_extension_ts(ext)
        for i, lang in enumerate(["en", *TRANSLATIONS]):
            files[EXT_LOCALES / lang / "messages.json"] = render_extension_locale(ext, i)
    return files, rows


def main(argv: list[str]) -> int:
    check_only = "--check" in argv
    files, rows = generate()
    stale = [p for p, text in files.items()
             if not p.exists() or p.read_text(encoding="utf-8") != text]
    if check_only:
        note = cross_check(rows)
        if note and "disagrees" in note:
            print(f"gen_strings: {note}", file=sys.stderr)
            return 1
        if stale:
            for p in stale:
                print(f"gen_strings: {p.relative_to(ROOT)} is stale -- run scripts/gen_strings.py",
                      file=sys.stderr)
            return 1
        print(f"gen_strings: {len(rows)} strings, generated files up to date"
              + (f"; {note}" if note else ""))
        return 0
    XTB_DIR.mkdir(parents=True, exist_ok=True)
    for p, text in files.items():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    note = cross_check(rows)
    print(f"gen_strings: {len(rows)} strings -> {GRD.relative_to(ROOT)} + "
          f"{len(TRANSLATIONS)} translation file(s)")
    if note:
        print(f"gen_strings: {note}")
        if "disagrees" in note:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
