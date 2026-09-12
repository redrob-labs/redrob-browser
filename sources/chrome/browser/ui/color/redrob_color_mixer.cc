// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/color/redrob_color_mixer.h"

#include "chrome/browser/ui/color/chrome_color_id.h"
#include "ui/color/color_mixer.h"
#include "ui/color/color_recipe.h"

namespace redrob {
namespace {

// @redrob-design/brand primitives. Named after the token, not after the use, so a reader can check them
// against the brand sheet without translating.
constexpr SkColor kBlue1 = SkColorSetRGB(0xef, 0xf4, 0xff);
constexpr SkColor kBlue5 = SkColorSetRGB(0x50, 0x7f, 0xff);
constexpr SkColor kBlue6 = SkColorSetRGB(0x2b, 0x52, 0xff);
constexpr SkColor kBlue9 = SkColorSetRGB(0x06, 0x14, 0x60);
constexpr SkColor kGray1 = SkColorSetRGB(0xf8, 0xf9, 0xfb);
constexpr SkColor kGray3 = SkColorSetRGB(0xdf, 0xe2, 0xe8);
constexpr SkColor kGray7 = SkColorSetRGB(0x57, 0x60, 0x71);
constexpr SkColor kGray8 = SkColorSetRGB(0x29, 0x2e, 0x37);
constexpr SkColor kGray9 = SkColorSetRGB(0x14, 0x17, 0x19);
constexpr SkColor kWhite = SK_ColorWHITE;

// The sidebar's wash, measured off the reference (#e1faff at the top of the column, #f6fefe by its
// middle). One colour rather than the gradient it actually is: the sidebar's fill is whatever
// kColorFrameActive resolves to, and going through the colour pipeline keeps upstream's rounded seam
// between the sidebar and the page -- which is structural -- where installing our own gradient background
// on the column replaced that seam and, for the same reason, painted nothing at all until it was ordered
// after upstream's own SetBackground. A 20-unit gradient is not worth owning that view.
constexpr SkColor kSidebarWash = SkColorSetRGB(0xe9, 0xfb, 0xff);

}  // namespace

void AddRedrobColorMixer(ui::ColorProvider* provider, const ui::ColorProviderKey& key) {
  // A user who has chosen their own theme has said what they want the browser to look like, and a brand
  // is not a reason to overrule them. Redrob's palette is the DEFAULT appearance, not a lock.
  if (key.custom_theme) {
    return;
  }

  const bool dark = key.color_mode == ui::ColorProviderKey::ColorMode::kDark;

  // Postprocessing, so this runs after every other mixer including the material and tab-strip ones that
  // derive tab fills from the frame. Restating the frame alone would leave the tabs computed from the
  // old one.
  ui::ColorMixer& mixer = provider->AddPostprocessingMixer();

  const SkColor frame = dark ? kGray9 : kSidebarWash;
  const SkColor surface = dark ? kGray8 : kWhite;
  // The content area is near-white with a hint of the same cyan, measured at #fcfeff. Not pure white:
  // the cards on the new tab ARE white, and a white page under white cards leaves the cards to be found
  // by their shadow alone.
  const SkColor page = dark ? kGray9 : SkColorSetRGB(0xfc, 0xfe, 0xff);
  const SkColor accent = dark ? kBlue5 : kBlue6;
  const SkColor accent_soft = dark ? kBlue9 : kBlue1;
  const SkColor line = dark ? kGray8 : kGray3;
  const SkColor ink = dark ? kGray1 : kGray9;
  const SkColor ink_muted = dark ? SkColorSetRGB(0xaa, 0xb0, 0xbb) : kGray7;

  // The sidebar's own field. With no toolbar row, the frame IS the sidebar's background, which is why
  // it carries the brand's secondary page colour rather than a window-chrome grey.
  mixer[ui::kColorFrameActive] = {frame};
  mixer[ui::kColorFrameInactive] = {frame};
  mixer[kColorToolbar] = {surface};

  // Tabs. The selected tab reads as a raised card on the sidebar, which is the same relationship the
  // web surfaces give a card on a page.
  mixer[kColorTabBackgroundActiveFrameActive] = {surface};
  mixer[kColorTabBackgroundActiveFrameInactive] = {surface};
  mixer[kColorTabBackgroundSelectedFrameActive] = {surface};
  mixer[kColorTabBackgroundSelectedFrameInactive] = {surface};
  mixer[kColorTabBackgroundInactiveFrameActive] = {frame};
  mixer[kColorTabBackgroundInactiveFrameInactive] = {frame};
  mixer[kColorTabBackgroundInactiveHoverFrameActive] = {accent_soft};
  mixer[kColorTabBackgroundInactiveHoverFrameInactive] = {accent_soft};

  mixer[kColorTabForegroundActiveFrameActive] = {ink};
  mixer[kColorTabForegroundActiveFrameInactive] = {ink};
  mixer[kColorTabForegroundInactiveFrameActive] = {ink_muted};
  mixer[kColorTabForegroundInactiveFrameInactive] = {ink_muted};

  mixer[kColorNewTabPageBackground] = {page};
  mixer[kColorToolbarButtonIcon] = {ink_muted};
  mixer[kColorToolbarSeparator] = {line};

  // The agent's tab group. Its header is a FILLED chip in the sidebar whose fill is the group's colour, so
  // at Chromium's own grey (a mid-dark grey meant to read on a tab strip) it was the single heaviest
  // element in a column of quiet text -- and at the blue it started as, worse. Restated as a pale wash
  // with ordinary body ink, so the group still reads as a group without outranking the tab the user is
  // actually looking at. Only the grey slot is restated: the others are the user's own group colours and
  // are not ours to repaint.
  mixer[kColorTabGroupTabStripFrameActiveGrey] = {line};
  mixer[kColorTabGroupTabStripFrameInactiveGrey] = {line};

  mixer[ui::kColorFocusableBorderFocused] = {accent};
  mixer[ui::kColorButtonBackgroundProminent] = {accent};

  // The two the sidebar reads through its token roles, measured against the reference and found too dark:
  // a section label came out #474747 where the reference is #737373, and a row's text #1f1f1f where the
  // reference is #090b0c. Restated here rather than passed as literals at the call site, because a views
  // colour has to come from the provider to follow dark mode at all.
  //
  // These ids are GENERIC -- every secondary label and every on-surface glyph in the browser reads them, not
  // just the sidebar. That breadth is intended: our secondary text should be our grey everywhere, and this
  // mixer only runs when the user has NOT chosen a theme of their own.
  mixer[ui::kColorLabelForegroundSecondary] = {dark ? SkColorSetRGB(0xaa, 0xb0, 0xbb)
                                                   : SkColorSetRGB(0x7c, 0x83, 0x90)};
  mixer[ui::kColorSysOnSurface] = {ink};
  // The compose button's raised circle: white on the wash, which is the same relationship a card has to a
  // page on the web surfaces.
  mixer[ui::kColorSysBaseContainerElevated] = {surface};
}

}  // namespace redrob
