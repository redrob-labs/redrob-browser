// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/views/tabs/vertical/redrob_account_row.h"

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
  // The foot of the sidebar, and only Settings lives here now. The avatar moved to the header row at the
  // TOP, where the reference puts it beside the workspace name -- see RedrobSidebarSections, which also
  // took over registering it with the toolbar.
  auto* layout = SetLayoutManager(std::make_unique<views::BoxLayout>(
      views::BoxLayout::Orientation::kVertical, gfx::Insets::VH(4, 8), 2));
  layout->set_cross_axis_alignment(views::BoxLayout::CrossAxisAlignment::kStart);

  if (!browser_) {
    return;
  }

  // Settings. There is no app menu in this product and the address row carries navigation only, so this
  // is the only way in -- a browser whose settings cannot be reached is not a shell decision, it is a
  // broken browser.
  settings_button_ = AddChildView(std::make_unique<views::LabelButton>(
      base::BindRepeating(&RedrobAccountRow::OpenSettings, base::Unretained(this)),
      base::UTF8ToUTF16(std::string("Settings"))));
  settings_button_->SetHorizontalAlignment(gfx::ALIGN_LEFT);
}

RedrobAccountRow::~RedrobAccountRow() = default;

void RedrobAccountRow::OpenSettings() {
  if (!browser_) {
    return;
  }
  // A singleton tab, which is what every other route into settings uses: pressing this twice should
  // return to the settings tab rather than accumulate copies of it.
  NavigateParams params(browser_, GURL(chrome::kChromeUIRedrobSettingsURL),
                        ui::PAGE_TRANSITION_AUTO_BOOKMARK);
  params.disposition = WindowOpenDisposition::SINGLETON_TAB;
  Navigate(&params);
}

BEGIN_METADATA(RedrobAccountRow)
END_METADATA

}  // namespace redrob
