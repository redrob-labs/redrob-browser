// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/views/tabs/vertical/redrob_account_row.h"

#include <memory>

#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/views/profiles/avatar_toolbar_button.h"
#include "ui/base/metadata/metadata_impl_macros.h"
#include "ui/views/layout/box_layout.h"

namespace redrob {

RedrobAccountRow::RedrobAccountRow(BrowserWindowInterface* browser) {
  auto* layout = SetLayoutManager(std::make_unique<views::BoxLayout>(
      views::BoxLayout::Orientation::kHorizontal, gfx::Insets::VH(4, 8), 0));
  layout->set_main_axis_alignment(views::BoxLayout::MainAxisAlignment::kStart);

  if (!browser) {
    return;
  }
  avatar_ = AddChildView(std::make_unique<AvatarToolbarButton>(browser));
  // Shown whatever the sign-in state: signed out, this IS the sign-in control, and hiding it would
  // leave a browser with no way to sign in at all now that the toolbar is gone.
  avatar_->SetVisible(true);
}

RedrobAccountRow::~RedrobAccountRow() = default;

BEGIN_METADATA(RedrobAccountRow)
END_METADATA

}  // namespace redrob
