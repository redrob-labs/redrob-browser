// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/views/location_bar/redrob_agent_chip.h"

#include <memory>

#include "chrome/browser/redrob/resources/grit/redrob_strings.h"
#include "components/omnibox/browser/redrob_agent_provider.h"
#include "ui/base/l10n/l10n_util.h"
#include "ui/base/metadata/metadata_impl_macros.h"
#include "ui/color/color_id.h"
#include "ui/gfx/geometry/insets.h"
#include "ui/views/background.h"
#include "ui/views/border.h"
#include "ui/views/view_utils.h"

namespace {

// A pill, not a box: the chip is a mode indicator sitting in a text field, and the only other pill
// there (the keyword chip) uses the same shape, so the two read as the same kind of thing.
constexpr float kChipRadius = 8.0f;
constexpr int kChipHorizontalPadding = 8;

}  // namespace

RedrobAgentChip::RedrobAgentChip()
    : views::Label(l10n_util::GetStringUTF16(IDS_REDROB_OB_MODEL_REDROB)) {
  SetEnabledColor(ui::kColorSysOnTonalContainer);
  SetBackground(views::CreateRoundedRectBackground(ui::kColorSysTonalContainer, kChipRadius));
  SetBorder(views::CreateEmptyBorder(gfx::Insets::VH(0, kChipHorizontalPadding)));
  // The rounded fill leaves transparent corners, and subpixel antialiasing on a background that is
  // not opaque everywhere is what Label::PaintText refuses (and what fringes glyphs in a release
  // build, where that check is compiled out). Greyscale AA on a chip this size is indistinguishable.
  SetSubpixelRenderingEnabled(false);
  SetCustomTooltipText(l10n_util::GetStringUTF16(IDS_REDROB_ENTRY_AGENT_CHIP_TOOLTIP));
  SetVisible(false);
}

RedrobAgentChip::~RedrobAgentChip() = default;

// static
RedrobAgentChip* RedrobAgentChip::Install(views::View* location_bar) {
  return location_bar->AddChildView(std::make_unique<RedrobAgentChip>());
}

// static
RedrobAgentChip* RedrobAgentChip::FindIn(views::View* location_bar) {
  for (views::View* child : location_bar->children()) {
    if (auto* chip = views::AsViewClass<RedrobAgentChip>(child)) {
      return chip;
    }
  }
  return nullptr;
}

// static
bool RedrobAgentChip::IsAgentMode(const std::u16string& omnibox_text) {
  return RedrobAgentProvider::IsAgentModeText(omnibox_text);
}

BEGIN_METADATA(RedrobAgentChip)
END_METADATA
