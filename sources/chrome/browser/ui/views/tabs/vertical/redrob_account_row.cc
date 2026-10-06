// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/views/tabs/vertical/redrob_account_row.h"

#include "chrome/browser/ui/views/tabs/vertical/redrob_sidebar_tokens.h"
#include "chrome/browser/redrob/resources/grit/redrob_strings.h"
#include "ui/base/l10n/l10n_util.h"
#include "ui/base/models/image_model.h"
#include "components/vector_icons/vector_icons.h"
#include "chrome/browser/ui/views/tabs/vertical/redrob_sidebar_sections.h"

#include <memory>

#include "base/functional/bind.h"
#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/browser/ui/views/frame/browser_view.h"
#include "chrome/browser/ui/views/profiles/avatar_toolbar_button.h"
#include "chrome/browser/ui/views/toolbar/toolbar_view.h"
#include "chrome/common/webui_url_constants.h"
#include "ui/base/metadata/metadata_impl_macros.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"
#include "ui/views/controls/button/label_button.h"
#include "ui/views/layout/box_layout.h"

namespace redrob {

RedrobAccountRow::RedrobAccountRow(BrowserWindowInterface* browser) : browser_(browser) {
  // The foot of the sidebar: Settings, and nothing else.
  //
  // The avatar used to be here too. It moved to the header beside the workspace name, because the profile and
  // the workspace are the SAME feature in this product -- so the avatar is the workspace's mark rather than a
  // separate account affordance, and keeping it down here made the shell show one feature in two places. That
  // also puts it where the reference draws it.
  //
  // Settings stays at the foot on instruction, and it earns the position: it is the one row that is not about
  // the content of this window, so it belongs where the eye lands last rather than in the header's rhythm.
  auto* layout = SetLayoutManager(std::make_unique<views::BoxLayout>(
      views::BoxLayout::Orientation::kVertical,
      gfx::Insets::VH(4, sidebar_tokens::kRowInset), sidebar_tokens::kRowSpacing));
  layout->set_cross_axis_alignment(views::BoxLayout::CrossAxisAlignment::kStart);
  layout_ = layout;

  if (!browser_) {
    return;
  }

  // Settings. There is no app menu in this product and the address row carries navigation only, so this
  // is the only way in -- a browser whose settings cannot be reached is not a shell decision, it is a
  // broken browser.
  //
  // Built by MakeRow, like every other row in the column, rather than by a second construction here. Before
  // this it was a bare LabelButton with a label and no mark, so the foot read as an icon with no label sitting
  // above a label with no icon -- the exact inverse of every row above it. The gear also makes it findable by
  // its glyph, which is how the rest of the list is meant to be scanned.
  settings_button_ = AddChildView(MakeRow(
      base::BindRepeating(&RedrobAccountRow::OpenSettings, base::Unretained(this)),
      l10n_util::GetStringUTF16(IDS_REDROB_SIDEBAR_SETTINGS)));
  settings_button_->SetImageModel(
      views::Button::STATE_NORMAL,
      ui::ImageModel::FromVectorIcon(vector_icons::kSettingsIcon,
                                     sidebar_tokens::kMutedForeground,
                                     sidebar_tokens::kFaviconSize));
}

RedrobAccountRow::~RedrobAccountRow() = default;

// The foot of a COLLAPSED rail is a glyph, not a row.
//
// Measured before this existed: the rail is 56px (x 0..55, so its centre is 27.5), the tab favicon above
// centred correctly at 27.5, and this gear's ink sat at 22.8 -- because the row kept its expanded leading
// padding. kRowInset (6) plus kRowPaddingLeading (9) puts a 16px image box at 15..31, whose centre is 23. In a
// column whose only remaining job is to stack glyphs, 4.7px of leftward drift is the whole visual defect.
//
// Fixed by removing what caused it rather than by adding a compensating offset: with the label cleared and the
// row's own border dropped, the button's preferred width IS its image, and a centred cross-axis alignment then
// puts that 16px box in the middle of the available width -- which stays correct if the rail is ever resized or
// the token changes. An offset computed from today's numbers would not.
void RedrobAccountRow::SetCollapsed(bool collapsed) {
  if (collapsed_ == collapsed) {
    return;
  }
  collapsed_ = collapsed;
  if (!settings_button_ || !layout_) {
    return;
  }
  // The text goes because there is no width for it. It was already invisible -- ELIDE_TAIL had eaten it -- but
  // an elided label still claims its share of the row, which is the other half of why the glyph was off centre.
  settings_button_->SetText(collapsed
                                ? std::u16string()
                                : l10n_util::GetStringUTF16(IDS_REDROB_SIDEBAR_SETTINGS));
  settings_button_->SetBorder(views::CreateEmptyBorder(
      collapsed ? gfx::Insets()
                : gfx::Insets::TLBR(0, sidebar_tokens::kRowPaddingLeading, 0,
                                    sidebar_tokens::kRowPaddingLeading)));
  layout_->set_cross_axis_alignment(
      collapsed ? views::BoxLayout::CrossAxisAlignment::kCenter
                : views::BoxLayout::CrossAxisAlignment::kStart);
  // The tooltip is what carries the name once the label is gone, so a collapsed rail stays readable to a
  // screen reader and to anyone who has to hover to find out what the gear does.
  settings_button_->SetTooltipText(l10n_util::GetStringUTF16(IDS_REDROB_SIDEBAR_SETTINGS));
  InvalidateLayout();
}

void RedrobAccountRow::OpenSettings() {
  if (!browser_) {
    return;
  }
  // Settings is the agent's settings page, reached through the browser's own route for it
  // (kBrowserOSURLRoutes in chrome/browser/browseros/core/browseros_constants.h maps
  // chrome://redrob/settings onto the agent extension). A singleton tab, which is what every other
  // route into settings uses: pressing this twice should return to the settings tab rather than
  // accumulate copies of it.
  const GURL settings_url("chrome://redrob/settings");
  NavigateParams params(browser_, settings_url, ui::PAGE_TRANSITION_AUTO_BOOKMARK);
  params.disposition = WindowOpenDisposition::SINGLETON_TAB;
  Navigate(&params);
}

BEGIN_METADATA(RedrobAccountRow)
END_METADATA

}  // namespace redrob
