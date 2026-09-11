// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_ACCOUNT_ROW_H_
#define CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_ACCOUNT_ROW_H_

#include "base/memory/raw_ptr.h"
#include "ui/base/metadata/metadata_header_macros.h"
#include "ui/views/view.h"

class AvatarToolbarButton;
class BrowserWindowInterface;

namespace views {
class LabelButton;
}  // namespace views

namespace redrob {

// The account control, at the foot of the sidebar.
//
// It is here because Redrob has no toolbar for it to sit in. Signing in is not a browsing control, so
// it belongs at the bottom with the other things about the window rather than among the tabs.
//
// The button itself is Chromium's own AvatarToolbarButton, reparented rather than reimplemented: it
// already carries the sign-in state machine, the sync-error badges and the profile menu, and a
// hand-rolled replacement would be a second, worse account UI that drifts from the first.
class RedrobAccountRow : public views::View {
  METADATA_HEADER(RedrobAccountRow, views::View)

 public:
  explicit RedrobAccountRow(BrowserWindowInterface* browser);
  RedrobAccountRow(const RedrobAccountRow&) = delete;
  RedrobAccountRow& operator=(const RedrobAccountRow&) = delete;
  ~RedrobAccountRow() override;

 private:
  void OpenSettings();

  raw_ptr<BrowserWindowInterface> browser_;
  raw_ptr<AvatarToolbarButton> avatar_ = nullptr;
  raw_ptr<views::LabelButton> settings_button_ = nullptr;
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_ACCOUNT_ROW_H_
