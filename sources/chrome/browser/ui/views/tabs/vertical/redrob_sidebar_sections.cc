// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/views/tabs/vertical/redrob_sidebar_sections.h"

#include <memory>
#include <utility>

#include "base/functional/bind.h"
#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/bookmarks/bookmark_model_factory.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/browser/redrob/agent_tabs.h"
#include "chrome/browser/tab_group_sync/tab_group_sync_service_factory.h"
#include "chrome/browser/ui/tabs/saved_tab_groups/saved_tab_group_utils.h"
#include "chrome/browser/ui/tabs/tab_group_model.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/bookmarks/browser/bookmark_node.h"
#include "components/saved_tab_groups/public/saved_tab_group.h"
#include "components/saved_tab_groups/public/types.h"
#include "ui/base/mojom/menu_source_type.mojom-shared.h"
#include "ui/views/controls/menu/menu_runner.h"
#include "ui/base/metadata/metadata_impl_macros.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"
#include "ui/gfx/font_list.h"
#include "ui/views/controls/button/label_button.h"
#include "ui/views/controls/label.h"
#include "ui/views/layout/box_layout.h"
#include "ui/views/layout/flex_layout.h"
#include "ui/views/view_class_properties.h"

namespace redrob {
namespace {

// The sidebar is 240px by default and can be dragged down to 126, so the list is capped rather than
// scrolled: a long bookmark bar would otherwise push the tab list off the bottom, and the tabs are what
// the column is primarily for.
constexpr size_t kMaxBookmarkRows = 8;

constexpr int kSectionInset = 8;
constexpr int kRowHeight = 28;

std::unique_ptr<views::Label> MakeHeading(const std::string& text) {
  auto label = std::make_unique<views::Label>(base::UTF8ToUTF16(text));
  label->SetHorizontalAlignment(gfx::ALIGN_LEFT);
  label->SetEnabledColor(ui::kColorLabelForegroundSecondary);
  label->SetFontList(label->font_list().DeriveWithSizeDelta(-1));
  return label;
}

}  // namespace

RedrobSidebarSections::RedrobSidebarSections(BrowserWindowInterface* browser) : browser_(browser) {
  SetLayoutManager(std::make_unique<views::BoxLayout>(
      views::BoxLayout::Orientation::kVertical, gfx::Insets::VH(4, kSectionInset), 2));

  // The workspace switcher. A workspace IS a saved tab group -- the browser already has the concept,
  // persists it, and syncs it, so inventing a parallel one would mean two things the user has to keep
  // in step by hand.
  workspace_button_ = AddChildView(std::make_unique<views::LabelButton>(
      base::BindRepeating(&RedrobSidebarSections::ShowWorkspaceMenu, base::Unretained(this)),
      std::u16string()));
  workspace_button_->SetHorizontalAlignment(gfx::ALIGN_LEFT);
  workspace_button_->SetMinSize(gfx::Size(0, kRowHeight));

  bookmarks_heading_ = AddChildView(MakeHeading("Bookmarks"));
  bookmarks_list_ = AddChildView(std::make_unique<views::View>());
  bookmarks_list_->SetLayoutManager(std::make_unique<views::BoxLayout>(
      views::BoxLayout::Orientation::kVertical, gfx::Insets(), 0));

  tabs_heading_ = AddChildView(MakeHeading("Tabs"));

  if (browser_) {
    if (tab_groups::TabGroupSyncService* groups =
            tab_groups::TabGroupSyncServiceFactory::GetForProfile(browser_->GetProfile())) {
      tab_group_observation_.Observe(groups);
    }
  }
  UpdateWorkspaceButton();

  if (browser_) {
    bookmarks::BookmarkModel* model =
        BookmarkModelFactory::GetForBrowserContext(browser_->GetProfile());
    if (model) {
      bookmark_observation_.Observe(model);
      RebuildBookmarks();
    }
  }
}

RedrobSidebarSections::~RedrobSidebarSections() = default;

void RedrobSidebarSections::SetCollapsed(bool collapsed) {
  if (collapsed_ == collapsed) {
    return;
  }
  collapsed_ = collapsed;
  // Hidden as a block. At 56px there is no width for a label, and half-drawn text would read as a
  // rendering bug rather than as a collapsed sidebar.
  workspace_button_->SetVisible(!collapsed);
  bookmarks_heading_->SetVisible(!collapsed);
  bookmarks_list_->SetVisible(!collapsed);
  tabs_heading_->SetVisible(!collapsed);
  InvalidateLayout();
}

void RedrobSidebarSections::BookmarkModelChanged() {
  RebuildBookmarks();
}

void RedrobSidebarSections::BookmarkModelLoaded(bool ids_reassigned) {
  RebuildBookmarks();
}

void RedrobSidebarSections::RebuildBookmarks() {
  bookmarks_list_->RemoveAllChildViews();
  if (!browser_) {
    return;
  }
  bookmarks::BookmarkModel* model =
      BookmarkModelFactory::GetForBrowserContext(browser_->GetProfile());
  if (!model || !model->loaded()) {
    return;
  }

  size_t shown = 0;
  const bookmarks::BookmarkNode* bar = model->bookmark_bar_node();
  if (!bar) {
    return;
  }
  for (const auto& child : bar->children()) {
    if (shown >= kMaxBookmarkRows) {
      break;
    }
    const bookmarks::BookmarkNode* node = child.get();
    // Folders are listed but not opened: a folder needs a menu, and a row that silently does nothing
    // when clicked is worse than one that is plainly not a link yet.
    auto* row = bookmarks_list_->AddChildView(std::make_unique<views::LabelButton>(
        node->is_url() ? base::BindRepeating(&RedrobSidebarSections::OpenBookmark,
                                             base::Unretained(this), node->url())
                       : views::Button::PressedCallback(),
        std::u16string(node->GetTitle())));
    row->SetHorizontalAlignment(gfx::ALIGN_LEFT);
    row->SetMinSize(gfx::Size(0, kRowHeight));
    row->SetEnabled(node->is_url());
    ++shown;
  }
  InvalidateLayout();
}

void RedrobSidebarSections::OpenBookmark(GURL url) {
  if (!browser_ || !url.is_valid()) {
    return;
  }
  // Foreground, unlike an agent's tab: this one the user asked for by clicking it.
  NavigateParams params(browser_, url, ui::PAGE_TRANSITION_AUTO_BOOKMARK);
  params.disposition = WindowOpenDisposition::NEW_FOREGROUND_TAB;
  Navigate(&params);
}


std::vector<base::Uuid> RedrobSidebarSections::WorkspaceIds() const {
  std::vector<base::Uuid> ids;
  if (!browser_) {
    return ids;
  }
  tab_groups::TabGroupSyncService* groups =
      tab_groups::TabGroupSyncServiceFactory::GetForProfile(browser_->GetProfile());
  if (!groups) {
    return ids;
  }
  const std::optional<tab_groups::LocalTabGroupID> agent_group =
      AgentTabs::GroupForProfile(browser_->GetProfile());
  for (const tab_groups::SavedTabGroup* group : groups->ReadAllGroups()) {
    // The agent's own group is excluded. Every local tab group is auto-saved, so it would otherwise
    // appear here -- but it is the agent's working set, not a workspace the user curates, and offering
    // to "switch to" it would misdescribe both.
    if (agent_group.has_value() && group->local_group_id() == agent_group) {
      continue;
    }
    ids.push_back(group->saved_guid());
  }
  return ids;
}

void RedrobSidebarSections::UpdateWorkspaceButton() {
  if (!workspace_button_) {
    return;
  }
  std::u16string label = u"Workspaces";
  size_t count = 0;

  if (browser_) {
    tab_groups::TabGroupSyncService* groups =
        tab_groups::TabGroupSyncServiceFactory::GetForProfile(browser_->GetProfile());
    TabStripModel* tab_strip = browser_->GetTabStripModel();
    const std::optional<tab_groups::LocalTabGroupID> agent_group =
        AgentTabs::GroupForProfile(browser_->GetProfile());
    if (groups && tab_strip) {
      for (const tab_groups::SavedTabGroup* group : groups->ReadAllGroups()) {
        if (agent_group.has_value() && group->local_group_id() == agent_group) {
          continue;
        }
        ++count;
        // Named after the workspace actually open in THIS window, so the button reports where the user
        // is rather than which workspace they last chose in some other window.
        if (group->local_group_id().has_value() && !group->title().empty() &&
            tab_strip->group_model()->ContainsTabGroup(group->local_group_id().value())) {
          label = group->title();
        }
      }
    }
  }

  workspace_button_->SetText(label);
  workspace_button_->SetEnabled(count > 0);
  workspace_button_->SetTooltipText(
      count > 0 ? u"Switch workspace" : u"Save a tab group to make it a workspace");
}

void RedrobSidebarSections::ShowWorkspaceMenu() {
  menu_workspace_ids_ = WorkspaceIds();
  if (menu_workspace_ids_.empty() || !browser_) {
    return;
  }
  tab_groups::TabGroupSyncService* groups =
      tab_groups::TabGroupSyncServiceFactory::GetForProfile(browser_->GetProfile());
  if (!groups) {
    return;
  }

  workspace_menu_model_ = std::make_unique<ui::SimpleMenuModel>(this);
  for (size_t i = 0; i < menu_workspace_ids_.size(); ++i) {
    std::optional<tab_groups::SavedTabGroup> group = groups->GetGroup(menu_workspace_ids_[i]);
    if (!group.has_value()) {
      continue;
    }
    std::u16string title =
        group->title().empty() ? u"Untitled workspace" : group->title();
    workspace_menu_model_->AddItem(static_cast<int>(i), title);
  }

  workspace_menu_runner_ = std::make_unique<views::MenuRunner>(
      workspace_menu_model_.get(), views::MenuRunner::HAS_MNEMONICS);
  workspace_menu_runner_->RunMenuAt(GetWidget(), nullptr,
                                    workspace_button_->GetBoundsInScreen(),
                                    views::MenuAnchorPosition::kTopLeft,
                                    ui::mojom::MenuSourceType::kNone);
}

void RedrobSidebarSections::ExecuteCommand(int command_id, int event_flags) {
  const size_t index = static_cast<size_t>(command_id);
  // The menu is torn down and rebuilt per press, but a command can still arrive against a model built
  // before the last change, so the index is bounds-checked rather than trusted.
  if (index >= menu_workspace_ids_.size() || !browser_) {
    return;
  }
  // One call covers both halves of "switch": already open means focus its window and first tab,
  // not open means restore all of its tabs into this one.
  tab_groups::SavedTabGroupUtils::OpenSavedTabGroup(
      browser_, menu_workspace_ids_[index],
      tab_groups::OpeningSource::kOpenedFromRevisitUi);
  UpdateWorkspaceButton();
}

void RedrobSidebarSections::OnInitialized() {
  UpdateWorkspaceButton();
}

void RedrobSidebarSections::OnTabGroupAdded(const tab_groups::SavedTabGroup& group,
                                            tab_groups::TriggerSource source) {
  UpdateWorkspaceButton();
}

void RedrobSidebarSections::OnTabGroupUpdated(const tab_groups::SavedTabGroup& group,
                                              tab_groups::TriggerSource source) {
  UpdateWorkspaceButton();
}

void RedrobSidebarSections::OnTabGroupRemoved(const base::Uuid& sync_id,
                                              tab_groups::TriggerSource source) {
  UpdateWorkspaceButton();
}

void RedrobSidebarSections::OnTabGroupLocalIdChanged(
    const base::Uuid& sync_id,
    const std::optional<tab_groups::LocalTabGroupID>& local_id) {
  // The signal that a workspace was opened or closed, which is exactly when the button's own label
  // stops being true.
  UpdateWorkspaceButton();
}

BEGIN_METADATA(RedrobSidebarSections)
END_METADATA

}  // namespace redrob
