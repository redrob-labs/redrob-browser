// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_SIDEBAR_SECTIONS_H_
#define CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_SIDEBAR_SECTIONS_H_

#include <memory>
#include <vector>

#include "base/callback_list.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/scoped_observation.h"
#include "base/uuid.h"
#include "chrome/browser/redrob/task_store.h"
#include "components/saved_tab_groups/public/tab_group_sync_service.h"
#include "ui/base/metadata/metadata_header_macros.h"
#include "ui/menus/simple_menu_model.h"
#include "ui/views/controls/button/image_button.h"
#include "ui/views/view.h"
#include "ui/views/view_tracker.h"

class AvatarToolbarButton;
class BrowserWindowInterface;
class ToolbarView;

namespace views {
class BoxLayout;
class Button;
class ImageView;
class Label;
class LabelButton;
class MenuRunner;
}  // namespace views

namespace redrob {

// THE one place a sidebar row is built -- shared so the foot's Settings row is the same object as a chat
// row rather than a second construction that has to be kept in step with the tokens by hand. It was declared
// here the moment a second file needed a row, which is the point at which "one place" stops being a comment.
std::unique_ptr<views::LabelButton> MakeRow(views::Button::PressedCallback callback,
                                            const std::u16string& text);

// The part of the sidebar above the tab list: a workspace switcher, recent chats, and the heading the
// tabs themselves sit under.
//
// It lives in the vertical tab strip's own column rather than in a side panel because the design puts
// them in one column -- switching workspace, returning to a chat and picking a tab are the same gesture
// at different scales, and a separate panel would make one of them feel different from the others.
//
// No bookmarks here. The column used to list them too, but the bookmark bar under the toolbar already
// shows the same entries, so the sidebar drew every bookmark twice and pushed the tab list down to do it.

//
// Collapse is honoured: at collapsed width there is no room for text, so the sections hide rather than
// clip. A row of unreadable fragments is worse than an absent row.
class RedrobSidebarSections : public views::View,
                              public tab_groups::TabGroupSyncService::Observer,
                              public redrob::TaskStore::Observer,
                              public ui::SimpleMenuModel::Delegate {
  METADATA_HEADER(RedrobSidebarSections, views::View)

 public:
  explicit RedrobSidebarSections(BrowserWindowInterface* browser);
  RedrobSidebarSections(const RedrobSidebarSections&) = delete;
  RedrobSidebarSections& operator=(const RedrobSidebarSections&) = delete;
  ~RedrobSidebarSections() override;

  // Called by the region view when the strip collapses or expands.
  void SetCollapsed(bool collapsed);

  // The magnifier in the header row. BrowserView anchors the browser's one tab-search bubble host to
  // this, so the bubble opens under the control the user actually pressed.
  views::Button* search_button() { return search_button_; }

  // tab_groups::TabGroupSyncService::Observer
  void OnInitialized() override;
  void OnTabGroupAdded(const tab_groups::SavedTabGroup& group,
                       tab_groups::TriggerSource source) override;
  void OnTabGroupUpdated(const tab_groups::SavedTabGroup& group,
                         tab_groups::TriggerSource source) override;
  void OnTabGroupRemoved(const base::Uuid& sync_id, tab_groups::TriggerSource source) override;
  void OnTabGroupLocalIdChanged(const base::Uuid& sync_id,
                                const std::optional<tab_groups::LocalTabGroupID>& local_id) override;

  // redrob::TaskStore::Observer
  void OnTaskChanged(const mojom::Task& task) override;

  // ui::SimpleMenuModel::Delegate
  void ExecuteCommand(int command_id, int event_flags) override;

 private:
  void RebuildChats();
  void OpenChat(std::string task_id);
  void ShowTabSearch();
  void StartNewTask();
  void UpdateWorkspaceButton();
  // Opens the workspace menu under `anchor`: the sidebar's button, or the toolbar's in horizontal mode.
  void ShowWorkspaceMenu(views::View* anchor);

  // views::View
  void AddedToWidget() override;

  // Horizontal tabs (CAP: tabs across the top). The sidebar column is hidden then, and with it the workspace
  // switcher and the avatar it carries. The same two controls are put in the toolbar instead, built and owned
  // here so the workspace logic stays in one class. Idempotent: called from the constructor and again once
  // this view has a widget, because the toolbar may not exist yet when the column is built.
  void AttachToolbarAccess();
  // Shows the toolbar pair only while tabs are horizontal, and registers whichever avatar is VISIBLE with the
  // toolbar -- every bubble anchors to the registered one, so it must never be the hidden copy.
  void OnTabStripModeChanged();
  // This window's toolbar, found up the view tree. Null until this view is in the BrowserView.
  ToolbarView* FindToolbar();
  // The tabs in this window that belong to no group. What "save these tabs as a workspace" acts on.
  std::vector<int> UngroupedTabIndices() const;
  // The saved groups a switcher should offer, in menu order. Rebuilt per menu rather than cached: the
  // service's own documentation says its pointers do not survive model mutation.
  std::vector<base::Uuid> WorkspaceIds() const;

  raw_ptr<BrowserWindowInterface> browser_;
  raw_ptr<views::View> header_ = nullptr;
  // The header's leading group -- avatar, workspace name, chevron. Held by its LAYOUT rather than its view,
  // because the only thing SetCollapsed does to it is re-align: collapsed it carries the avatar alone and
  // must centre it in the 56px rail.
  raw_ptr<views::BoxLayout> header_lead_layout_ = nullptr;
  // The browser's ONE avatar, in the header because the profile and the workspace are one feature. Registered
  // with the toolbar, and cleared in the destructor -- the toolbar holds a raw pointer to a button this view
  // owns, and views are destroyed in an order neither of them chooses.
  raw_ptr<AvatarToolbarButton> avatar_ = nullptr;
  raw_ptr<views::LabelButton> workspace_button_ = nullptr;
  // The chevron that makes the workspace name read as a picker rather than a heading.
  raw_ptr<views::ImageView> workspace_chevron_ = nullptr;
  raw_ptr<views::ImageButton> search_button_ = nullptr;
  raw_ptr<views::ImageButton> compose_button_ = nullptr;
  raw_ptr<views::Label> chats_heading_ = nullptr;
  raw_ptr<views::View> chats_list_ = nullptr;
  raw_ptr<views::Label> tabs_heading_ = nullptr;
  raw_ptr<views::LabelButton> new_tab_row_ = nullptr;
  bool collapsed_ = false;

  // The toolbar's copy of the workspace switcher and avatar, for horizontal tabs. The VIEW is owned by the
  // toolbar (it is the toolbar's child); this class removes it again in its destructor, because the
  // workspace button calls back into this object.
  views::ViewTracker toolbar_;
  views::ViewTracker toolbar_access_;
  views::ViewTracker toolbar_avatar_;
  views::ViewTracker toolbar_workspace_button_;
  base::CallbackListSubscription mode_subscription_;

  std::vector<base::Uuid> menu_workspace_ids_;
  std::unique_ptr<ui::SimpleMenuModel> workspace_menu_model_;
  std::unique_ptr<views::MenuRunner> workspace_menu_runner_;

  base::ScopedObservation<tab_groups::TabGroupSyncService,
                          tab_groups::TabGroupSyncService::Observer>
      tab_group_observation_{this};
  base::ScopedObservation<redrob::TaskStore, redrob::TaskStore::Observer> task_observation_{this};
  base::WeakPtrFactory<RedrobSidebarSections> weak_factory_{this};
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_VIEWS_TABS_VERTICAL_REDROB_SIDEBAR_SECTIONS_H_
