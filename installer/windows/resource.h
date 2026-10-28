// SPDX-License-Identifier: MIT OR Apache-2.0
// Resource identifiers shared between redrob_browser_setup.rc and redrob_browser_setup.cpp.
#pragma once

// RCDATA
#define IDR_PAYLOAD          101  // the release's Windows zip (absent from the uninstaller)
#define IDR_FONT_SEMIBOLD    104  // deterministic Pretendard SemiBold subset for Latin headings and controls
#define IDR_UNINSTALLER      106  // the payload-less build of this app, written into the install folder
#define IDR_SYMBOL_PNG       107  // res/symbol-white-192.png, the white Redrob symbol
#define IDR_FONT_REGULAR     108  // deterministic Pretendard Regular subset for Latin body text
#define IDR_FONT_HANGUL      109  // deterministic Wanted Sans Regular subset for every Hangul UI run

#define IDI_APPICON          105  // assets/redrob-browser.ico

#define IDR_MANIFEST           1  // per-monitor-v2 DPI + common controls
