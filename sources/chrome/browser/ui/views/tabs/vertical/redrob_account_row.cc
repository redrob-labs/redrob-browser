// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/views/tabs/vertical/redrob_account_row.h"

#include "chrome/browser/ui/views/tabs/vertical/redrob_sidebar_tokens.h"

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
  // The foot of the sidebar: the account, then Settings. Bottom-LEFT is where the account belongs in this
  // product. An earlier version of this session moved the avatar up into the header row beside the workspace
  // name because the reference draws it there; the reference combines it with its own workspace switcher, and
  // Janghoon's instruction is the foot -- so it is back, and the header row is workspace name and controls
  // only.
  //
  // Stacked, not side by side. The column is 240px and can be dragged to 126; signed out the avatar expands
  // into a "Sign in to Google?" pill, so anything beside it would clip whichever loses.
  auto* layout = SetLayoutManager(std::make_unique<views::BoxLayout>(
      views::BoxLayout::Orientation::kVertical,
      gfx::Insets::VH(4, sidebar_tokens::kRowInset), sidebar_tokens::kRowSpacing));
  layout->set_cross_axis_alignment(views::BoxLayout::CrossAxisAlignment::kStart);

  if (!browser_) {
    return;
  }

  avatar_ = AddChildView(std::make_unique<AvatarToolbarButton>(browser_));
  // Shown whatever the sign-in state: signed out, this IS the sign-in control, and there is no toolbar
  // avatar and no app menu, so hiding it would leave a browser with no way to sign in at all. The pill it
  // expands into says "Sign in to Google?", which is what that button actually does -- it signs the user
  // into a Google account for Google's sync service, and calling it a Redrob sign-in would be offering an
  // account that does not exist.
  avatar_->SetVisible(true);

  // This row's button is the browser's ONE avatar, not a second copy of it. Features that anchor a bubble
  // to "the avatar" -- sign-in interception, sync errors, IPH -- ask ToolbarButtonProvider for it, so
  // without this they would anchor to the toolbar's instance, which this product never builds, and open a
  // bubble pointing at a corner where nothing is drawn.
  if (BrowserView* browser_view = BrowserView::GetBrowserViewForBrowser(browser_)) {
    if (ToolbarView* toolbar = browser_view->toolbar()) {
      toolbar->SetRedrobAvatarButton(avatar_);
    }
  }

  // Settings. There is no app menu in this product and the address row carries navigation only, so this
  // is the only way in -- a browser whose settings cannot be reached is not a shell decision, it is a
  // broken browser.
  settings_button_ = AddChildView(std::make_unique<views::LabelButton>(
      base::BindRepeating(&RedrobAccountRow::OpenSettings, base::Unretained(this)),
      base::UTF8ToUTF16(std::string("Settings"))));
  settings_button_->SetHorizontalAlignment(gfx::ALIGN_LEFT);
  settings_button_->SetMinSize(gfx::Size(0, sidebar_tokens::kRowHeight));
}

RedrobAccountRow::~RedrobAccountRow() {
  // The toolbar holds a raw pointer to a button THIS row owns, so it has to be told before the button
  // goes away. Views are destroyed in an order neither of them chooses.
  if (browser_) {
    if (BrowserView* browser_view = BrowserView::GetBrowserViewForBrowser(browser_)) {
      if (ToolbarView* toolbar = browser_view->toolbar()) {
        toolbar->SetRedrobAvatarButton(nullptr);
      }
    }
  }
}

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
