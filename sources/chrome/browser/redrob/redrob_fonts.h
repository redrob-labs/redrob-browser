// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_REDROB_FONTS_H_
#define CHROME_BROWSER_REDROB_REDROB_FONTS_H_

namespace redrob {

// Makes the product's own typeface the one views draws with.
//
// This exists because the browser was rendering in two different faces at once. The WebUI surfaces -- the new
// tab, Settings, onboarding -- load Pretendard Variable out of their resource packs, while every views
// surface next to them -- the sidebar's rows, the address row, menus -- took whatever the platform's default
// UI font happened to be, which on this Linux host is DejaVu Sans. Two faces in one window is not a
// typography choice, it is an unfinished one.
//
// Called once, early in browser startup and before any FontList is built. Safe to call when the font cannot
// be found: it logs and leaves the platform default in place, because a browser that renders in the wrong
// face is a great deal better than one that fails to start.
void RegisterUiFont();

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_REDROB_FONTS_H_
