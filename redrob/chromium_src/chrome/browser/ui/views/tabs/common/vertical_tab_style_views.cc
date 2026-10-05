// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by the licence in the repository root.

// A chromium_src override: this file is compiled INSTEAD of
// chrome/browser/ui/views/tabs/common/vertical_tab_style_views.cc, and pulls that file in below. Nothing
// upstream is replaced -- the original's every line still compiles, in the same target, into the same
// object file. What this buys is that the forty lines of drawing code below live in a file we own
// instead of inside a patch, so an uprev cannot conflict with them.
//
// Two halves, and the order between them is load-bearing:
//
//   ABOVE the include -- the shadow's height constant, because the original's GetPath and
//   GetContentsInsets read it. A definition after the include would not be visible to them.
//
//   BELOW the include -- PaintTabShadow's body, because it needs the class declaration, which arrives
//   with the original. Its declaration is added to the header by a rewrite rule
//   (rewrite/chrome/browser/ui/views/tabs/common/vertical_tab_style_views.h.yaml); a member cannot be
//   introduced from here.
//
// The three edits inside the original's own functions are rewrite rules, in the .cc.yaml beside it.

#include "ui/gfx/shadow_value.h"
#include "ui/gfx/skia_paint_util.h"

namespace {

// Redrob: the strip at the bottom of a tab's bounds that exists only so its shadow has somewhere to land.
// The reference's shadow reaches 8px below the pill; 4 is what carries the part that reads, and every pixel
// of it is bought from the row's height, so it is not free.
//
// This works only because TabView's own clip path was widened from the fill path to the view's bounds -- a
// vertical tab clips its painting, and while that clip was the pill this room was unreachable.
constexpr int kVerticalTabShadowRoom = 4;

}  // namespace

#include <chrome/browser/ui/views/tabs/common/vertical_tab_style_views.cc>

void VerticalTabStyleViews::PaintTabShadow(gfx::Canvas* canvas) const {
  // Measured off the reference: a 1px hairline at the pill's top edge (#e3ebec on a #f4fdfe wash) and, under
  // its bottom edge, a fade starting at #d7dede that reaches the wash eight pixels down. Against that
  // background the darkest step is about 11% black, which is where these alphas come from.
  //
  // Two layers, the same shape as the WebUI's --shadow-sm: the tight one draws the edge, the soft one the
  // height. Neutral black rather than a themed colour -- a tinted shadow washes what is under it, and this
  // sits on the sidebar's own tint.
  gfx::ShadowValues shadows;
  // Tuned against the measurement rather than guessed: at 0x16/0x1c the first step under the pill came out
  // #c5d4d8, a drop of 36 from the wash, where the reference's #d7dede is a drop of 29.
  shadows.emplace_back(gfx::Vector2d(0, 1), 2, SkColorSetA(SK_ColorBLACK, 0x12));
  shadows.emplace_back(gfx::Vector2d(0, 2), 6, SkColorSetA(SK_ColorBLACK, 0x17));

  cc::PaintFlags flags;
  flags.setAntiAlias(true);
  flags.setStyle(cc::PaintFlags::kFill_Style);
  flags.setColor(GetCurrentTabBackgroundColor(GetSelectionState()));
  flags.setLooper(gfx::CreateShadowDrawLooper(shadows));

  // The pill's own rect -- the same inset GetPath applies -- so the shadow is cast by exactly the shape that
  // gets filled.
  gfx::RectF pill(delegate_->GetView()->GetLocalBounds());
  pill.Inset(gfx::InsetsF::TLBR(0, 0, kVerticalTabShadowRoom, 0));
  canvas->DrawRoundRect(pill, GetCornerRadius(), flags);
}
