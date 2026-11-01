"""Write the CREDITS.html a release package carries: Chromium's credits page from the CEF binary
distribution (every component Chromium includes, with its licence), with entries for CEF itself and
for the cef crate (Rust bindings) added in the same format. The window's About page links it.

    python3 scripts/cef-credits.py <CEF_PATH> <out.html>

CEF's licence is taken verbatim from the distribution's own headers (include/cef_app.h), so it is
the text of the version that ships.
"""

import html
import sys
from pathlib import Path


def cef_licence(cef: Path) -> str:
    lines = []
    for line in (cef / "include" / "cef_app.h").read_text(encoding="utf-8").splitlines():
        if not line.startswith("//") or line.startswith("// ----"):
            break
        lines.append(line[3:] if line.startswith("// ") else line[2:])
    text = "\n".join(lines).strip()
    if "Marshall A. Greenblatt" not in text or "Redistribution" not in text:
        sys.exit("include/cef_app.h does not start with CEF's licence")
    return text


def product(title: str, homepage: str, licence: str) -> str:
    return (
        '<div class="product">\n'
        f'<span class="title">{html.escape(title)}</span>\n'
        f'<span class="homepage"><a href="{html.escape(homepage)}">homepage</a></span>\n'
        '<label class="show" tabindex="0">\n<input type="checkbox" hidden>\n</label>\n'
        f'<div class="license">\n<pre>{html.escape(licence)}\n</pre>\n</div>\n</div>\n'
    )


def main() -> None:
    cef, out = Path(sys.argv[1]), Path(sys.argv[2])
    page = (cef / "CREDITS.html").read_text(encoding="utf-8")
    anchor = "<!-- Chromium <3s the following projects -->"
    if anchor not in page:
        sys.exit("CREDITS.html has an unexpected layout")
    added = product(
        "Chromium Embedded Framework (CEF)",
        "https://bitbucket.org/chromiumembedded/cef",
        cef_licence(cef),
    ) + product(
        "cef (Rust bindings for CEF)",
        "https://github.com/tauri-apps/cef-rs",
        "Copyright the cef-rs contributors.\n"
        "Licensed under the Apache License, Version 2.0 or the MIT License, at your option.",
    )
    out.write_text(page.replace(anchor, anchor + "\n" + added, 1), encoding="utf-8")


if __name__ == "__main__":
    main()
