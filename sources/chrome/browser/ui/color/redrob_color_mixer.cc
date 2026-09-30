// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/color/redrob_color_mixer.h"

#include "chrome/browser/ui/color/chrome_color_id.h"
#include "chrome/browser/ui/color/redrob_design_tokens.h"
#include "ui/color/color_mixer.h"
#include "ui/color/color_recipe.h"

namespace redrob {
namespace {

// The design system's own values, vendored from @redrob-labs/ui by scripts/vendor_design_system.py and
// pinned in DESIGN_SYSTEM_PIN.json. Nothing in this file transcribes a colour any more: a hex typed here
// is a hex that can disagree with the website and the console, and four already had -- Blue 1 and the Red
// ramp's first three steps, each off by one to thirteen points per channel. Invisible on screen, permanent
// in code, and nothing reported it because a hardcoded colour is always consistent with itself.
namespace ds = ::redrob::tokens;

// SkColor and the generated tokens are both 0xAARRGGBB, so this is a type change and not a conversion.
// Spelled out rather than left implicit because a silent narrowing here would drop alpha, and two tokens
// in the set are genuinely translucent.
constexpr SkColor FromToken(uint32_t token) {
  return static_cast<SkColor>(token);
}

// ---------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------
// There are no longer any colours here that the design system has no token for.
//
// There used to be two. `kPageLight` #fcfeff went when `page` moved to `--surface-base`. The second was
// `kSidebarWashLight` #e9fbff, the light sidebar's cyan field, measured off an old reference (#e1faff at
// the top of the column, #f6fefe by its middle) and justified on the grounds that the design system is a
// brand system for pages and "describes neither".
//
// THAT JUSTIFICATION WAS WRONG, AND IT WAS WRONG BECAUSE A TOKEN WAS MISSING. The design system describes
// this rail exactly, in `.rr-shell__side`: a neutral ground -- `--surface-sunken` in light,
// `--surface-raised` in dark -- carrying the product's own wash as an edge fade that reaches transparent
// at 132px. Not a tint over the whole column.
//
// It could not be read that way because `--product-browser-wash` was declared NOWHERE. The delivery's
// tokens.json defines 119 product tokens and its tokens.css declared none of them, so all 28 of those
// `.rr-shell[data-product]` declarations were invalid and were silently dropped -- here and in every other
// Redrob app. Fixed upstream in 1.0.2, which this browser pins, with a gate that fails on any var() naming
// a property nothing declares.
//
// So #e9fbff was never a wash the system omitted. It is a cyan that appears in no Redrob ramp: the
// closest thing in the whole palette is `--product-chat-1` #e9fbfb, a different product's tint, and the
// browser's own is pink. The light rail now takes the ground the design system gives it, and
// ALLOWED_LOCAL_COLOURS is empty.
//
// The 132px product wash is NOT in this change, and the reason is structural rather than a preference.
// The sidebar's fill is whatever kColorFrameActive resolves to, and going through the colour pipeline is
// what keeps upstream's rounded seam between the sidebar and the page. Installing our own gradient
// background on the column replaced that seam, and -- for the same reason -- painted nothing at all until
// it was ordered after upstream's own SetBackground. A gradient needs a view that owns its paint, and no
// view here spans the column's top band: RedrobSidebarSections is the whole list and RedrobAccountRow is
// its foot. Adding one is a change to the column's structure, so it is its own slice in
// docs/UX-PROGRAMME.md rather than a rider on a colour correction.
// ---------------------------------------------------------------------------------------------------
// The role table.
//
// One struct filled twice, because a namespace cannot be chosen at runtime and the browser can be dark
// while the OS is light. Each field says what the colour is FOR; which token supplies it is the only thing
// that varies between the two instances.
//
// WHERE THIS IS NOT YET THE DESIGN SYSTEM'S SEMANTIC LADDER. Some fields below name a PRIMITIVE (kGray8,
// kBlue9) rather than a semantic role, and that is a finding rather than an oversight: the value the
// browser paints today is not the value the design system's matching role carries, so adopting the role
// would change the browser's appearance. They are listed here so the divergence is countable instead of
// buried, and each is a decision for a later change, not for a refactor that must not move a pixel:
//
//   dark surface    paints #292e37 (Gray 8). The design system's dark surfaces are #0a0b0c base,
//                   #141719 raised, #000000 sunken -- #292e37 is not one of them, so the browser's dark
//                   surface ladder does not line up with the system's at all.
//   dark frame      paints #141719, which IS the system's dark `--surface-raised`. So in dark the SIDEBAR
//                   sits at the raised level and the cards on it sit higher still, inverting the
//                   relationship the light theme has.
//   light ink       paints #141719 (Gray 9) where the system's `--ink-primary` is #0a0b0c.
//   dark accent-soft paints #061460 (Blue 9) where `--surface-brand-subtle` is #030c34.
//
// Two values this change DOES move, and both are corrections rather than redesigns.
//
// Light `accent_soft`: #eff4ff to #eef4ff, one point of green. The design system says #eef4ff and the
// hand-transcribed copy said #eff4ff. That is the drift being removed.
//
// `page`, both themes, to `--surface-base`. It used to be a browser-local #fcfeff in light and
// `--surface-raised` in dark. This is the ONE role the C++ shares an edge with the WebUI: our three WebUI
// pages paint their own `html` background from `--surface-base`, and this field paints the same area
// before and around them. Two values for one surface is a seam that shows as a flash on load and as a
// hairline at the edges, so the field follows the token the page uses. It also settles the ladder's
// direction -- the page is the BASE and the chrome sits above it -- which is why dark moves a whole step
// down, from #141719 to #0a0b0c.
// ---------------------------------------------------------------------------------------------------
struct Palette {
  SkColor frame;        // the sidebar's own field; with no toolbar row, the frame IS its background
  SkColor surface;      // a raised card: the selected tab, the compose button's circle
  SkColor page;         // the content area behind web content and the new tab page
  SkColor accent;       // the brand's action colour: prominent buttons, focus
  SkColor accent_soft;  // the palest brand tint: a hovered row
  SkColor line;         // separators, and the grey tab group's wash
  SkColor ink;          // body text and on-surface glyphs
  SkColor ink_muted;    // secondary text INSIDE the sidebar: section labels, unselected rows, toolbar icons
  // Every secondary label elsewhere in the browser. A separate field and not a reuse of ink_muted: the two
  // were already different in light (#7c8390 against #576071) and collapsing them would darken every
  // secondary label in the browser as a side effect of a refactor. They coincide in dark, which is exactly
  // how a reader is misled into thinking one field would do.
  SkColor label_muted;
};

constexpr Palette kLightPalette = {
    /*frame=*/FromToken(ds::light::kSurfaceSunken),
    /*surface=*/FromToken(ds::light::kSurfaceBase),
    /*page=*/FromToken(ds::light::kSurfaceBase),
    /*accent=*/FromToken(ds::light::kActionPrimary),
    /*accent_soft=*/FromToken(ds::light::kSurfaceBrandSubtle),
    /*line=*/FromToken(ds::light::kBorderSubtle),
    /*ink=*/FromToken(ds::light::kGray9),
    /*ink_muted=*/FromToken(ds::light::kInkSecondary),
    /*label_muted=*/FromToken(ds::light::kInkMuted),
};

constexpr Palette kDarkPalette = {
    /*frame=*/FromToken(ds::dark::kSurfaceRaised),
    /*surface=*/FromToken(ds::dark::kGray8),
    /*page=*/FromToken(ds::dark::kSurfaceBase),
    /*accent=*/FromToken(ds::dark::kActionPrimaryHover),
    /*accent_soft=*/FromToken(ds::dark::kBlue9),
    /*line=*/FromToken(ds::dark::kGray8),
    /*ink=*/FromToken(ds::dark::kInkPrimary),
    /*ink_muted=*/FromToken(ds::dark::kInkSecondary),
    /*label_muted=*/FromToken(ds::dark::kInkSecondary),
};

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

  const Palette& p = dark ? kDarkPalette : kLightPalette;

  // The sidebar's own field. With no toolbar row, the frame IS the sidebar's background, which is why
  // it carries the brand's secondary page colour rather than a window-chrome grey.
  mixer[ui::kColorFrameActive] = {p.frame};
  mixer[ui::kColorFrameInactive] = {p.frame};
  mixer[kColorToolbar] = {p.surface};

  // Tabs. The selected tab reads as a raised card on the sidebar, which is the same relationship the
  // web surfaces give a card on a page.
  mixer[kColorTabBackgroundActiveFrameActive] = {p.surface};
  mixer[kColorTabBackgroundActiveFrameInactive] = {p.surface};
  mixer[kColorTabBackgroundSelectedFrameActive] = {p.surface};
  mixer[kColorTabBackgroundSelectedFrameInactive] = {p.surface};
  mixer[kColorTabBackgroundInactiveFrameActive] = {p.frame};
  mixer[kColorTabBackgroundInactiveFrameInactive] = {p.frame};
  mixer[kColorTabBackgroundInactiveHoverFrameActive] = {p.accent_soft};
  mixer[kColorTabBackgroundInactiveHoverFrameInactive] = {p.accent_soft};

  mixer[kColorTabForegroundActiveFrameActive] = {p.ink};
  mixer[kColorTabForegroundActiveFrameInactive] = {p.ink};
  mixer[kColorTabForegroundInactiveFrameActive] = {p.ink_muted};
  mixer[kColorTabForegroundInactiveFrameInactive] = {p.ink_muted};

  mixer[kColorNewTabPageBackground] = {p.page};
  mixer[kColorToolbarButtonIcon] = {p.ink_muted};
  mixer[kColorToolbarSeparator] = {p.line};

  // The agent's tab group. Its header is a FILLED chip in the sidebar whose fill is the group's colour, so
  // at Chromium's own grey (a mid-dark grey meant to read on a tab strip) it was the single heaviest
  // element in a column of quiet text -- and at the blue it started as, worse. Restated as a pale wash
  // with ordinary body ink, so the group still reads as a group without outranking the tab the user is
  // actually looking at. Only the grey slot is restated: the others are the user's own group colours and
  // are not ours to repaint.
  mixer[kColorTabGroupTabStripFrameActiveGrey] = {p.line};
  mixer[kColorTabGroupTabStripFrameInactiveGrey] = {p.line};

  mixer[ui::kColorFocusableBorderFocused] = {p.accent};
  mixer[ui::kColorButtonBackgroundProminent] = {p.accent};

  // The two the sidebar reads through its token roles, measured against the reference and found too dark:
  // a section label came out #474747 where the reference is #737373, and a row's text #1f1f1f where the
  // reference is #090b0c. Restated here rather than passed as literals at the call site, because a views
  // colour has to come from the provider to follow dark mode at all.
  //
  // These ids are GENERIC -- every secondary label and every on-surface glyph in the browser reads them, not
  // just the sidebar. That breadth is intended: our secondary text should be our grey everywhere, and this
  // mixer only runs when the user has NOT chosen a theme of their own.
  mixer[ui::kColorLabelForegroundSecondary] = {p.label_muted};
  mixer[ui::kColorSysOnSurface] = {p.ink};
  // The compose button's raised circle: white on the wash, which is the same relationship a card has to a
  // page on the web surfaces.
  mixer[ui::kColorSysBaseContainerElevated] = {p.surface};
}

}  // namespace redrob
