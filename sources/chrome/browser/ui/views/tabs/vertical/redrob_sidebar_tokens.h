// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_SIDEBAR_TOKENS_H_
#define CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_SIDEBAR_TOKENS_H_

#include "ui/color/color_id.h"

// The sidebar's design tokens -- the views counterpart of the WebUI's tokens.css, and the same two-layer
// idea: a value is defined ONCE here and named for what it is FOR, so a rule that wants "the height of a
// row" asks for kRowHeight instead of picking 28 because 28 looked right on the surface being edited.
//
// Every number below was MEASURED off the reference screenshot before any of this code was written, and the
// comment on each says what was measured. Where a value is a judgement rather than a measurement it says so
// -- a number presented as measured when it was chosen is worse than an obviously arbitrary one, because
// the next person will not re-check it.
//
// COLOUR IS NOT HERE, on purpose. A views colour has to come from the ColorProvider or it cannot follow the
// theme or dark mode, so the tokens for colour are ui::ColorIds and their VALUES live in one place --
// redrob_color_mixer.cc. What this file carries is the ROLE MAPPING: which id plays which part in the
// sidebar, so the mapping is readable in one place without duplicating the values.
namespace redrob::sidebar_tokens {

// ---------- geometry ----------

// The reference column is 254px wide and its tint ends at x=253. Not enforced here: the user can drag the
// column, so this is the shape the metrics below were derived at rather than a width to impose.
inline constexpr int kReferenceColumnWidth = 254;

// A row's own height, measured from the selected row's white pill: y 366..397 inclusive.
inline constexpr int kRowHeight = 32;

// Row pitch measured between the text tops of four consecutive bookmark rows (121, 154, 191, 226) is 33-37,
// so 35 -- which leaves 3px between one 32px row and the next.
inline constexpr int kRowSpacing = 3;

// The selected row's pill starts at x=6 in a 254px column, so the rows are inset from the column's edges
// rather than filling them. Its right edge measured 245, i.e. 9 from the far side; 6 is used for both,
// because an asymmetric inset at this size is more likely to be antialiasing than intent.
inline constexpr int kRowInset = 6;

// Row content starts at x=15 (the Gmail favicon's left edge) and the pill starts at 6, so the pill's own
// leading padding is 9.
inline constexpr int kRowPaddingLeading = 9;

// The favicon on a bookmark row measured 14px of ink at x 15..28 inside a 16px box, and its label starts at
// x=38 -- so 8px between the box and the text.
inline constexpr int kFaviconSize = 16;
inline constexpr int kFaviconLabelSpacing = 8;

// Section labels ("Bookmarks", "Tabs"): the gap from the label's bottom to the first row's text top measured
// 26px. Split as 16 above the label and 10 below it -- a judgement, since one measured gap cannot say how it
// divides, and putting more of it above is what groups a label with the rows it heads rather than with the
// rows above it.
inline constexpr int kSectionGapAbove = 16;
inline constexpr int kSectionGapBelow = 10;

// The selected row's pill: straight edge reached 8px below the top of the shape.
inline constexpr int kRowCornerRadius = 8;

// The header row's two trailing controls: both glyphs measured 12px, and the compose button's circle 28px
// with its right edge 9px from the column's edge.
inline constexpr int kHeaderGlyphSize = 12;
inline constexpr int kComposeButtonSize = 28;

// ---------- type ----------

// Cap heights measured at 1x: section labels 9px, row labels 10px. Expressed as a DELTA from the platform's
// own default UI font rather than an absolute size, because the sidebar sits beside native controls and a
// hardcoded pixel size stops following the user's font settings.
inline constexpr int kSectionLabelSizeDelta = -1;
inline constexpr int kRowLabelSizeDelta = 0;

// ---------- colour roles ----------
//
// Which ColorId plays which part. The values are in redrob_color_mixer.cc.

// The column's ground. `--surface-sunken` in light, `--surface-raised` in dark, which is what the design
// system's own `.rr-shell__side` paints. It used to be a browser-local cyan #e9fbff; see the note in
// redrob_color_mixer.cc for why that was wrong and why it looked justified.
inline constexpr ui::ColorId kSurface = ui::kColorFrameActive;

// A row's label when it is the thing you are looking at. Measured #090b0c, which is the brand's own
// --rr-black to within a point.
inline constexpr ui::ColorId kRowForeground = ui::kColorSysOnSurface;

// A section label, and a row that is present but not current. Measured #737373 -- a neutral grey. The brand
// grey is used rather than that exact value: same role, our palette, and the difference is a hair of hue at
// this lightness.
inline constexpr ui::ColorId kMutedForeground = ui::kColorLabelForegroundSecondary;

// The compose button's raised circle, which reads as white on the wash.
inline constexpr ui::ColorId kRaisedSurface = ui::kColorSysBaseContainerElevated;

}  // namespace redrob::sidebar_tokens

#endif  // CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_SIDEBAR_TOKENS_H_
