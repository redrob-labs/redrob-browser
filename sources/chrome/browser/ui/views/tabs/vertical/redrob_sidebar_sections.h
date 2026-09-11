// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_SIDEBAR_SECTIONS_H_
#define CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_SIDEBAR_SECTIONS_H_

#include <memory>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/scoped_observation.h"
#include "base/uuid.h"
#include "components/bookmarks/browser/base_bookmark_model_observer.h"
#include "components/bookmarks/browser/bookmark_model.h"
#include "components/saved_tab_groups/public/tab_group_sync_service.h"
#include "ui/base/metadata/metadata_header_macros.h"
#include "ui/menus/simple_menu_model.h"
#include "ui/views/view.h"

class BrowserWindowInterface;

namespace views {
class Label;
class LabelButton;
class MenuRunner;
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
class RedrobSidebarSections : public views::View,
                              public bookmarks::BaseBookmarkModelObserver,
                              public tab_groups::TabGroupSyncService::Observer,
                              public ui::SimpleMenuModel::Delegate {
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

  // tab_groups::TabGroupSyncService::Observer
  void OnInitialized() override;
  void OnTabGroupAdded(const tab_groups::SavedTabGroup& group,
                       tab_groups::TriggerSource source) override;
  void OnTabGroupUpdated(const tab_groups::SavedTabGroup& group,
                         tab_groups::TriggerSource source) override;
  void OnTabGroupRemoved(const base::Uuid& sync_id, tab_groups::TriggerSource source) override;
  void OnTabGroupLocalIdChanged(const base::Uuid& sync_id,
                                const std::optional<tab_groups::LocalTabGroupID>& local_id) override;

  // ui::SimpleMenuModel::Delegate
  void ExecuteCommand(int command_id, int event_flags) override;

 private:
  void RebuildBookmarks();
  void OpenBookmark(GURL url);
  void UpdateWorkspaceButton();
  void ShowWorkspaceMenu();
  // The saved groups a switcher should offer, in menu order. Rebuilt per menu rather than cached: the
  // service's own documentation says its pointers do not survive model mutation.
  std::vector<base::Uuid> WorkspaceIds() const;

  raw_ptr<BrowserWindowInterface> browser_;
  raw_ptr<views::LabelButton> workspace_button_ = nullptr;
  raw_ptr<views::Label> bookmarks_heading_ = nullptr;
  raw_ptr<views::View> bookmarks_list_ = nullptr;
  raw_ptr<views::Label> tabs_heading_ = nullptr;
  bool collapsed_ = false;

  std::vector<base::Uuid> menu_workspace_ids_;
  std::unique_ptr<ui::SimpleMenuModel> workspace_menu_model_;
  std::unique_ptr<views::MenuRunner> workspace_menu_runner_;

  base::ScopedObservation<bookmarks::BookmarkModel, bookmarks::BookmarkModelObserver>
      bookmark_observation_{this};
  base::ScopedObservation<tab_groups::TabGroupSyncService,
                          tab_groups::TabGroupSyncService::Observer>
      tab_group_observation_{this};
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_SIDEBAR_SECTIONS_H_
