// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by the licence in the repository root.

// A chromium_src override: compiled INSTEAD of
// chrome/browser/ui/views/tabs/common/tab_group_header_view.cc, which it pulls in below. See
// docs/CUSTOMISATION.md for the mechanism; the short version is that everything above the include is
// there because the ORIGINAL's code reads it, and everything below it needs the class declaration.
//
// This file exists because the row the reference draws has two children upstream's does not -- a leading
// mark and a tab count -- and because the measurements that place them are ours. Holding them here rather
// than in a patch means an uprev cannot conflict with any of it; what stays upstream is six small edits,
// in the .cc.yaml beside this file.

#include "base/strings/string_number_conversions.h"
#include "chrome/browser/ui/views/tabs/vertical/redrob_sidebar_tokens.h"
#include "ui/views/vector_icons.h"

namespace {

// Redrob: the collapse chevron alone is smaller. At kIconSize it renders 8x4 of ink where the reference draws
// 6x3 -- on a glyph this small that is a third too big, and it is the only element on the row's trailing edge,
// so it reads as heavy. Separate constant rather than shrinking kIconSize, which also sizes the sync and
// overflow icons.
constexpr int kCollapseIconSize = 12;

// Redrob: the leading mark and the tab count, both vertical-only, both measured off the reference -- a 14x10
// mark whose ink starts at x=15 with the label at 38, and the count as a bare number at x 211..216 with the
// chevron after it at 229. 22 rather than 16 because tab.icon draws its ink across x4..20 of a 24 canvas, so
// the nominal size overstates the glyph by half. 22 was the arithmetic's answer and MEASURED 17x13, so this is
// the measured one: 18 lands the ink's RIGHT edge on the reference's x=28 exactly, 2px narrower than its 14.
// Same trade as the + on the New Tab row -- an icon whose ink is a fixed fraction of its canvas cannot match
// both edges and a width at once, and the shared right edge is what the eye follows down the column.
constexpr int kVerticalLeadingMarkSize = 18;

// The gap between the mark and the label. The reference's is 10px (mark ends 28, label starts 38); the mark's
// own box supplies 3, so 7 is what has to be added. Without it the mark crowds the label and the pair reads as
// one smudge rather than as an icon and a name.
constexpr int kVerticalMarkLabelGap = 7;

// The vertical row's insets are ASYMMETRIC, unlike the horizontal row's. Leading 6 rather than 8 because the
// mark's ink starts 9px into the row -- the interior inset plus the icon's own padding -- and the reference
// puts it at 15. The trailing 8 is left alone: it is what lands the chevron's right edge on the reference's
// x=234 exactly, so widening both sides to fix the left would break a side that is already correct.
constexpr int kVerticalLeadingInset = 6;

// The count sits hard against the chevron without this: measured 8px right of where the reference puts it,
// which on a row whose other three elements line up is the one that looks wrong.
constexpr int kVerticalCountTrailingMargin = 8;

}  // namespace

#include <chrome/browser/ui/views/tabs/common/tab_group_header_view.cc>

void TabGroupHeaderView::UpdateTabCountLabel() {
  if (!tab_count_label_) {
    return;
  }
  // Read the count from the group rather than from TabGroupData, which does not carry one -- that is also why
  // this is called from Layout and not only from OnDataChanged: the data observer never fires when a tab joins
  // or leaves the group, so a count refreshed only there would be stale exactly when it matters.
  const int count = delegate_->GetTabGroup().tab_count();
  tab_count_label_->SetText(count > 0 ? base::NumberToString16(count)
                                      : std::u16string());
}

void TabGroupHeaderView::Layout(PassKey key) {
  // Safe against a layout loop: Label::SetText early-returns on identical text, so a settled count sets
  // nothing and invalidates nothing. A CHANGED count costs one extra pass, which then settles.
  UpdateTabCountLabel();
  LayoutSuperclass<views::View>(this);
}
