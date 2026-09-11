// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_SIDEBAR_SECTIONS_H_
#define CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_SIDEBAR_SECTIONS_H_

#include "base/memory/raw_ptr.h"
#include "base/scoped_observation.h"
#include "components/bookmarks/browser/base_bookmark_model_observer.h"
#include "components/bookmarks/browser/bookmark_model.h"
#include "ui/base/metadata/metadata_header_macros.h"
#include "ui/views/view.h"

class BrowserWindowInterface;

namespace views {
class Label;
class LabelButton;
}  // namespace views

namespace redrob {

// The part of the sidebar above the tab list: a workspace switcher, the user's bookmarks, and the
// heading the tabs themselves sit under.
//
// It lives in the vertical tab strip's own column rather than in a side panel because the design puts
// all three in one column -- switching workspace, reaching a bookmark and picking a tab are the same
// gesture at different scales, and a separate panel would make the third one feel different from the
// other two.
//
// Collapse is honoured: at collapsed width there is no room for text, so the sections hide rather than
// clip. A row of unreadable fragments is worse than an absent row.
class RedrobSidebarSections : public views::View, public bookmarks::BaseBookmarkModelObserver {
  METADATA_HEADER(RedrobSidebarSections, views::View)

 public:
  explicit RedrobSidebarSections(BrowserWindowInterface* browser);
  RedrobSidebarSections(const RedrobSidebarSections&) = delete;
  RedrobSidebarSections& operator=(const RedrobSidebarSections&) = delete;
  ~RedrobSidebarSections() override;

  // Called by the region view when the strip collapses or expands.
  void SetCollapsed(bool collapsed);

  // bookmarks::BaseBookmarkModelObserver
  void BookmarkModelChanged() override;
  void BookmarkModelLoaded(bool ids_reassigned) override;

 private:
  void RebuildBookmarks();
  void OpenBookmark(GURL url);

  raw_ptr<BrowserWindowInterface> browser_;
  raw_ptr<views::LabelButton> workspace_button_ = nullptr;
  raw_ptr<views::Label> bookmarks_heading_ = nullptr;
  raw_ptr<views::View> bookmarks_list_ = nullptr;
  raw_ptr<views::Label> tabs_heading_ = nullptr;
  bool collapsed_ = false;
  base::ScopedObservation<bookmarks::BookmarkModel, bookmarks::BookmarkModelObserver>
      bookmark_observation_{this};
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_SIDEBAR_SECTIONS_H_
