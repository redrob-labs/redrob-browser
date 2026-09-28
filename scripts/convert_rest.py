#!/usr/bin/env python3
"""Convert the remaining small hand patches to rules, with a written header and per-run descriptions.

The text itself is taken from the saved patches by patch_to_rules; this file holds the part that has to be
authored. Descriptions are short by design: the reasoning lives in the inline comment the rule inserts, and
saying it twice gives two copies to drift apart. What the description adds is why this file is touched and,
where it matters, what the count is protecting.

    convert_rest.py <saved patches dir>
"""
from __future__ import annotations

import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent

# path -> (header, [one description per change run, in order])
WORK: dict[str, tuple[str, list[str]]] = {
    "chrome/browser/ui/tabs/vertical_tab_strip_state_controller.cc": (
        "The collapse toggle's icon pair: a sidebar-panel glyph, not a hamburger with a chevron.\n\n"
        "Upstream's kMenuOpenIcon / kMenuCloseCustomIcon draws three lines and an arrow, which says "
        "\"menu\". The thing this button does is show and hide a PANEL, and the reference draws exactly "
        "that.",
        ["The expanded state's glyph.", "The collapsed state's glyph. The pair still flips with state and "
         "still respects RTL, because which side the panel docks to is what the icon describes."],
    ),
    "chrome/installer/linux/debian/additional_deps": (
        "Korean font dependencies: the two things the bundled UI face does not carry.\n\n"
        "Measured rather than assumed. Pretendard covers all 11,172 precomposed Hangul syllables, so "
        "ordinary Korean needs nothing -- but it carries ZERO of the conjoining Jamo block and no Hanja, "
        "so Hanja in a document and NFD Hangul (the form macOS filenames use) had nothing to fall back "
        "to. On a minimal install that is tofu boxes in a Korean page.",
        ["Add the fallback packages as recommends."],
    ),
    "chrome/browser/ui/window_feature_controller/window_feature_controller.cc": (
        "This product DOES have a top row, so the toolbar feature stays supported.\n\n"
        "An earlier reading of the reference concluded there was no toolbar, which was wrong: the row is "
        "so quiet -- no fill, no border, no box around the address -- that it does not look like one, but "
        "it is there and it is where you type a URL. Recorded here because the wrong conclusion is easy "
        "to reach twice.",
        ["Keep the toolbar supported rather than refusing it.",
         "The explanation, so the next reader does not redo the mistake."],
    ),
    "chrome/common/importer/profile_import_process_param_traits_macros.h": (
        "One IPC enum range on every platform, now that TYPE_CHROMIUM_BASED is the maximum everywhere.\n\n"
        "This also removes the Windows/non-Windows split the range used to need, which is the kind of "
        "conditional that rots quietly: it was correct only because the old maximum differed per "
        "platform.",
        ["The single range.", "The note recording why the platform split is gone."],
    ),
    "chrome/common/chrome_switches.h": (
        "`--redrob-task=\"...\"`, the switch that starts an agent task from a terminal.\n\n"
        "With a browser already running the process singleton forwards it, which is how `redrob \"...\"` "
        "reaches the session the user is actually in. One way only -- the singleton channel ACKs and "
        "carries no payload back, so nothing is printed; the loopback RPC is the route when an answer "
        "has to reach the terminal.",
        ["Declare the switch."],
    ),
    "chrome/browser/ui/views/tabs/common/tab_view_vertical_layout.cc": (
        "The close button appears on hover and focus, NOT on the active tab.\n\n"
        "Upstream keeps it permanently on the active tab because a horizontal strip has nowhere else to "
        "put it. In a 240px sidebar row the X is the only thing on the trailing edge, so a permanent one "
        "reads as the selected row's decoration rather than as a control.",
        ["Drop active from the condition."],
    ),
    "chrome/browser/ui/browser_web_contents_delegate/browser_web_contents_delegate.cc": (
        "Do not focus the omnibox on our new tab: the prompt field should hold the caret.\n\n"
        "Upstream focuses the omnibox on the NTP because there the NTP's search box IS the omnibox. Here "
        "they are two different fields, so focusing the wrong one sends the first thing you type to a "
        "search engine instead of to the agent.",
        ["Return false for our host, BEFORE the kChromeUINewTabHost branch. Order is load-bearing: our "
         "page is reached through chrome://newtab, which stays the entry's VIRTUAL url, so the later "
         "branch would recognise it as the new tab page and answer true."],
    ),
    "chrome/browser/ui/views/frame/vertical_tab_strip_region_view.h": (
        "The declarations behind the two views this class now owns.",
        ["Forward-declare them rather than including their headers, so this widely-included header does "
         "not drag our targets into everything that sees it.",
         "The accessor BrowserView needs to anchor the tab-search bubble to the magnifier.",
         "The two owned child pointers."],
    ),
    "chrome/browser/ui/layout_constants.cc": (
        "Two vertical-tab measurements, both taken off the reference rather than chosen.",
        ["Row height 36: the reference's selected row measures y 366..397, so 32, plus the 4px of shadow "
         "room VerticalTabStyleViews holds back. Upstream's 30 made tab rows a step shorter than every "
         "row in redrob_sidebar_tokens.h, so the tab list kept a different rhythm from the bookmark list "
         "directly above it.",
         "Horizontal inset 7, so a pill is 240 wide in the 254px column -- the reference's width -- and a "
         "tab's leading edge lands on the same line as a bookmark row's."],
    ),
    "chrome/browser/chrome_browser_main.cc": (
        "Register the colour mixer and the product typeface.",
        ["The two headers.",
         "The mixer goes LAST so our palette is the final word on the ids it names and silent on every id "
         "it does not. The font is registered in ToolkitInitialized because that is after the platform's "
         "font system is up and before any view -- and any cached FontList -- is built; without it the "
         "WebUI surfaces drew in Pretendard while every views surface around them drew in the platform "
         "default, which is two faces in one window."],
    ),
    "chrome/browser/chrome_browser_interface_binders_webui.cc": (
        "Bind the three WebUI page handlers.",
        ["The three headers.", "The binders themselves."],
    ),
    "chrome/browser/profiles/chrome_browser_main_extra_parts_profiles.cc": (
        "Register our keyed-service factories with the others.",
        ["The header.", "The factory registration, in the one function that ensures a service exists "
         "before any profile is built."],
    ),
    "chrome/browser/ui/webui/chrome_web_ui_configs.cc": (
        "Register the WebUI configs for our surfaces.",
        ["The header.", "The config registrations."],
    ),
    "chrome/common/webui_url_constants.h": (
        "The host and URL constants for our surfaces, declared where every other chrome:// host is.",
        ["The constants."],
    ),
    "chrome/browser/ui/views/tabs/vertical/vertical_tab_strip_bottom_container.cc": (
        "The bottom container defers to the sidebar's own foot.",
        ["The change, with its reason inline."],
    ),
    "chrome/chrome_repack_locales.gni": (
        "Pack our locale strings into the same .pak as everything else.",
        ["Our grd in the input list.", "The matching dependency."],
    ),
    "chrome/browser/ui/views/profiles/profile_picker_view.cc": (
        "The profile picker's own adjustment for this shell.",
        ["The change.", "The second half of it."],
    ),
    "ui/webui/resources/tools/build_webui.gni": (
        "Let a build_webui target opt into our shared WebUI assets.",
        ["The hook."],
    ),
    "chrome/common/chrome_paths_linux.cc": (
        "The Linux config directory carries our name, not Chromium's.\n\n"
        "A path is identity: sharing upstream's directory means a real Chromium install and this one read "
        "and write each other's profile.",
        ["The directory name."],
    ),
    "chrome/browser/ui/views/toolbar/toolbar_view.h": (
        "Expose what the sidebar needs from the toolbar.",
        ["The accessor."],
    ),
    "chrome/browser/ui/tabs/vertical_tab_strip_state.h": (
        "The state this product's sidebar adds to the upstream enum.",
        ["The addition."],
    ),
    "chrome/BUILD.gn": (
        "Our sources in the chrome target, through the shared .gni list.",
        ["The dependency."],
    ),
    "chrome/browser/prefs/browser_prefs.cc": (
        "Register our profile preferences with the others.",
        ["The header.", "The registration call."],
    ),
    "components/user_data_importer/common/importer_type.h": (
        "TYPE_CHROMIUM_BASED, the importer type the Chromium-family detection reports.",
        ["The enumerator, appended so no existing value's number changes -- these are persisted."],
    ),
    "chrome/installer/linux/debian/build_repo_package.py": (
        "The repo package's name follows the browser package's.",
        ["The name."],
    ),
    "chrome/utility/importer/importer_creator.cc": (
        "Create the Chromium-family importer for the new type.",
        ["The header.", "The case in the factory."],
    ),
    "chrome/browser/ui/tabs/tab_strip_prefs.cc": (
        "Vertical tabs are the default in this product, not an opt-in.",
        ["The default."],
    ),
    "build/config/siso/main.star": (
        "Load our siso handler, which is what makes a chromium_src override compile in place of an "
        "upstream .cc.",
        ["The import.", "The handler in the config list."],
    ),
    "components/history/core/browser/history_types.h": (
        "The history field the importer needs to carry.",
        ["The field."],
    ),
    "chrome/browser/importer/in_process_importer_bridge.cc": (
        "Pass the imported history through the bridge.",
        ["The call."],
    ),
    "tools/metrics/histograms/metadata/sql/histograms.xml": (
        "Our database name in the histogram variant list, so its metrics are attributed rather than "
        "silently dropped.",
        ["The variant."],
    ),
    "tools/gritsettings/translation_expectations.pyl": (
        "Our grd in the translation expectations, so it is not reported as an untranslated file.",
        ["The entry."],
    ),
    "components/user_data_importer/common/importer_data_types.h": (
        "The data-type bit the Chromium-family importer reports.",
        ["The bit."],
    ),
    "chrome/browser/prefs/BUILD.gn": (
        "The prefs target depends on ours.",
        ["The dependency."],
    ),
    "chrome/browser/BUILD.gn": (
        "The browser target depends on ours.",
        ["The dependency."],
    ),
}


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    saved = pathlib.Path(sys.argv[1])
    failures = []
    for relative, (header, descriptions) in WORK.items():
        patch = saved / (relative.replace("/", "-") + ".patch")
        if not patch.exists():
            print(f"SKIP  {relative}: no saved patch", file=sys.stderr)
            continue
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
            handle.write(header + "\n---\n" + "\n---\n".join(descriptions) + "\n")
            desc_path = handle.name
        built = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "build_rule.py"), relative, desc_path, str(patch)],
            capture_output=True, text=True, cwd=ROOT,
        )
        if built.returncode != 0:
            failures.append((relative, (built.stdout + built.stderr).strip()))
            print(f"BUILD FAILED  {relative}", file=sys.stderr)
            continue
        verified = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "verify_rule.py"), relative, str(patch)],
            capture_output=True, text=True, cwd=ROOT,
        )
        if verified.returncode != 0:
            failures.append((relative, (verified.stdout + verified.stderr).strip()[:600]))
            print(f"VERIFY FAILED  {relative}", file=sys.stderr)
        else:
            print(f"ok  {relative}")
    print(f"\n{len(WORK) - len(failures)}/{len(WORK)} converted")
    for relative, why in failures:
        print(f"\n--- {relative}\n{why}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
