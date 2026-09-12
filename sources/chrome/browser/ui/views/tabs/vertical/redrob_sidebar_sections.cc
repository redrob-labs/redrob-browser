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
#include "chrome/browser/redrob/task_store_factory.h"
#include "chrome/browser/tab_group_sync/tab_group_sync_service_factory.h"
#include "chrome/browser/ui/tabs/saved_tab_groups/saved_tab_group_utils.h"
#include "chrome/browser/ui/tabs/tab_group_model.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/views/frame/browser_view.h"
#include "chrome/browser/ui/views/profiles/avatar_toolbar_button.h"
#include "chrome/browser/ui/views/tab_search_bubble_host.h"
#include "chrome/browser/ui/views/toolbar/toolbar_view.h"
#include "chrome/common/webui_url_constants.h"
#include "components/bookmarks/browser/bookmark_node.h"
#include "components/saved_tab_groups/public/saved_tab_group.h"
#include "components/saved_tab_groups/public/types.h"
#include "components/vector_icons/vector_icons.h"
#include "ui/base/models/image_model.h"
#include "ui/base/mojom/menu_source_type.mojom-shared.h"
#include "ui/color/color_id.h"
#include "ui/gfx/image/image.h"
#include "ui/views/accessibility/view_accessibility.h"
#include "ui/views/background.h"
#include "ui/views/controls/highlight_path_generator.h"
#include "ui/views/controls/menu/menu_runner.h"
#include "ui/base/metadata/metadata_impl_macros.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"
#include "ui/gfx/font_list.h"
#include "ui/views/controls/button/image_button.h"
#include "ui/views/controls/button/label_button.h"
#include "ui/views/controls/label.h"
#include "ui/views/layout/box_layout.h"
#include "ui/views/layout/flex_layout.h"
#include "ui/views/layout/layout_types.h"
#include "ui/views/view_class_properties.h"

namespace redrob {
namespace {

// The sidebar is 240px by default and can be dragged down to 126, so the list is capped rather than
// scrolled: a long bookmark bar would otherwise push the tab list off the bottom, and the tabs are what
// the column is primarily for.
constexpr size_t kMaxBookmarkRows = 8;
// Same reasoning as the bookmark cap: the column is 240px and the tab list must stay visible.
constexpr size_t kMaxChatRows = 6;

constexpr int kSectionInset = 8;
constexpr int kRowHeight = 28;
// The reference sets a bookmark's mark 8px from its name. Wider and the two stop reading as one row.
constexpr int kFaviconLabelSpacing = 8;
// Measured: both trailing glyphs are 12px, and the compose button's circle is 28px around its own.
constexpr int kTrailingGlyphSize = 12;
constexpr int kComposeButtonSize = 28;
// Signed out the avatar expands into a "Sign in to Redrob?" pill. 160px is what is left of a 238px row once
// the two trailing controls have their 28px each -- the workspace name yields entirely while the pill is up,
// so the pill does not have to share with it. Signed in the button is a circle and this never binds.
constexpr int kAvatarMaxWidth = 160;

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

  // The header: the account and the workspace, on ONE row, at the TOP. Both were elsewhere before -- the
  // avatar at the foot and the workspace here -- and the reference puts them together because they answer
  // the same question, which is whose browser this is and which of their workspaces you are in.
  auto* header = AddChildView(std::make_unique<views::View>());
  auto* header_layout = header->SetLayoutManager(std::make_unique<views::BoxLayout>(
      views::BoxLayout::Orientation::kHorizontal, gfx::Insets(), 6));
  header_layout->set_cross_axis_alignment(views::BoxLayout::CrossAxisAlignment::kCenter);

  if (browser_) {
    avatar_ = header->AddChildView(std::make_unique<AvatarToolbarButton>(browser_));
    // Shown whatever the sign-in state: signed out, this IS the sign-in control, and the top row has no
    // avatar of its own, so hiding it would leave a browser with no way to sign in at all.
    avatar_->SetVisible(true);
    // Capped, because signed out this button expands into a "Sign in to Redrob?" pill and at ~190px of a
    // 238px row it took the whole header -- the workspace name elided to "W…" and the two trailing controls
    // were pushed out of the row entirely. Signed in it is a 28px circle and the cap never binds.
    avatar_->SetMaxSize(gfx::Size(kAvatarMaxWidth, kRowHeight));
    // The pill and the workspace name are competing for one row, and only ONE of them is load-bearing at a
    // time: while the pill is asking you to sign in there is no signed-in profile to have workspaces in, and
    // a fresh profile has no saved groups either -- which is why the name was falling back to the literal
    // word "Workspaces". So the name yields while the label is up and returns when it collapses.
    // OnViewPreferredSizeChanged is the signal for that: the avatar's preferred width IS its label state.
    avatar_observation_.Observe(avatar_.get());

    // This is the browser's ONE avatar, not a second copy. Anything that anchors a bubble to "the avatar"
    // -- sign-in interception, sync errors, IPH -- asks ToolbarButtonProvider for it, so without this
    // they would anchor to the toolbar's instance, which this product never builds, and open a bubble
    // pointing at a corner where nothing is drawn.
    if (BrowserView* browser_view = BrowserView::GetBrowserViewForBrowser(browser_)) {
      if (ToolbarView* toolbar = browser_view->toolbar()) {
        toolbar->SetRedrobAvatarButton(avatar_);
      }
    }
  }

  // The workspace switcher. A workspace IS a saved tab group -- the browser already has the concept,
  // persists it, and syncs it, so inventing a parallel one would mean two things the user has to keep
  // in step by hand.
  workspace_button_ = header->AddChildView(std::make_unique<views::LabelButton>(
      base::BindRepeating(&RedrobSidebarSections::ShowWorkspaceMenu, base::Unretained(this)),
      std::u16string()));
  workspace_button_->SetHorizontalAlignment(gfx::ALIGN_LEFT);
  workspace_button_->SetMinSize(gfx::Size(0, kRowHeight));
  // The workspace name absorbs the row's slack, which is what puts the two controls below hard against the
  // trailing edge. A separate spacer view would do the same thing and be one more child to lay out; this
  // way the empty space belongs to the name, which is what shrinks when the row runs out of room.
  header_layout->SetFlexForView(workspace_button_, 1);

  // The two controls at the trailing edge, measured off the reference: a bare 12px magnifier, then the
  // compose glyph inside a 28px raised white circle. The asymmetry is the design and not an oversight --
  // starting something is the primary action on this row and finding a tab is the secondary one, so only
  // one of them is given a surface.
  //
  // Upstream puts the same PAIR of actions -- tab search and new tab, as a TabStripComboButton -- one row
  // up, next to the collapse toggle. That button is hidden and these replace it rather than both existing,
  // because two ways to open tab search in one column is two things to keep in step.
  search_button_ = header->AddChildView(std::make_unique<views::ImageButton>(
      base::BindRepeating(&RedrobSidebarSections::ShowTabSearch, base::Unretained(this))));
  search_button_->SetImageModel(
      views::Button::STATE_NORMAL,
      ui::ImageModel::FromVectorIcon(vector_icons::kSearchIcon,
                                     ui::kColorLabelForegroundSecondary, kTrailingGlyphSize));
  search_button_->SetImageHorizontalAlignment(views::ImageButton::ALIGN_CENTER);
  search_button_->SetImageVerticalAlignment(views::ImageButton::ALIGN_MIDDLE);
  search_button_->SetPreferredSize(gfx::Size(kRowHeight, kRowHeight));
  search_button_->GetViewAccessibility().SetName(u"Search tabs");
  search_button_->SetTooltipText(u"Search tabs");
  views::InstallCircleHighlightPathGenerator(search_button_);

  compose_button_ = header->AddChildView(std::make_unique<views::ImageButton>(
      base::BindRepeating(&RedrobSidebarSections::StartNewTask, base::Unretained(this))));
  compose_button_->SetImageModel(
      views::Button::STATE_NORMAL,
      ui::ImageModel::FromVectorIcon(vector_icons::kEditSquareIcon, ui::kColorSysOnSurface,
                                     kTrailingGlyphSize));
  compose_button_->SetImageHorizontalAlignment(views::ImageButton::ALIGN_CENTER);
  compose_button_->SetImageVerticalAlignment(views::ImageButton::ALIGN_MIDDLE);
  compose_button_->SetPreferredSize(gfx::Size(kComposeButtonSize, kComposeButtonSize));
  compose_button_->SetBackground(views::CreateRoundedRectBackground(
      ui::kColorSysBaseContainerElevated, kComposeButtonSize / 2));
  compose_button_->GetViewAccessibility().SetName(u"New task");
  compose_button_->SetTooltipText(u"New task");
  views::InstallCircleHighlightPathGenerator(compose_button_);

  header_ = header;

  bookmarks_heading_ = AddChildView(MakeHeading("Bookmarks"));
  bookmarks_list_ = AddChildView(std::make_unique<views::View>());
  bookmarks_list_->SetLayoutManager(std::make_unique<views::BoxLayout>(
      views::BoxLayout::Orientation::kVertical, gfx::Insets(), 0));

  chats_heading_ = AddChildView(MakeHeading("Chats"));
  chats_list_ = AddChildView(std::make_unique<views::View>());
  chats_list_->SetLayoutManager(std::make_unique<views::BoxLayout>(
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
    if (redrob::TaskStore* store =
            redrob::TaskStoreFactory::GetForProfile(browser_->GetProfile())) {
      task_observation_.Observe(store);
      RebuildChats();
    }
  }

  if (browser_) {
    bookmarks::BookmarkModel* model =
        BookmarkModelFactory::GetForBrowserContext(browser_->GetProfile());
    if (model) {
      bookmark_observation_.Observe(model);
      RebuildBookmarks();
    }
  }
}

RedrobSidebarSections::~RedrobSidebarSections() {
  // The toolbar holds a raw pointer to a button THIS view owns, so it has to be told before the button
  // goes away. Views are destroyed in an order neither of them chooses.
  if (browser_) {
    if (BrowserView* browser_view = BrowserView::GetBrowserViewForBrowser(browser_)) {
      if (ToolbarView* toolbar = browser_view->toolbar()) {
        toolbar->SetRedrobAvatarButton(nullptr);
      }
    }
  }
}

void RedrobSidebarSections::OnTaskChanged(const mojom::Task& task) {
  // Rebuilt wholesale rather than patched. A task changes state several times a second while it runs,
  // and reconciling rows against a list this short costs more code than it saves work.
  RebuildChats();
}

void RedrobSidebarSections::RebuildChats() {
  chats_list_->RemoveAllChildViews();
  if (!browser_) {
    return;
  }
  redrob::TaskStore* store = redrob::TaskStoreFactory::GetForProfile(browser_->GetProfile());
  if (!store) {
    return;
  }

  std::vector<mojom::TaskPtr> tasks = store->ListTasks();
  // Newest first, and capped: this is a sidebar, not a history page. The full list is on the new tab.
  std::sort(tasks.begin(), tasks.end(), [](const mojom::TaskPtr& a, const mojom::TaskPtr& b) {
    return a->started_at_ms > b->started_at_ms;
  });
  size_t shown = 0;
  for (const mojom::TaskPtr& task : tasks) {
    if (shown >= kMaxChatRows) {
      break;
    }
    // The prompt is the name, because that is what the user typed and therefore what they will
    // recognise. Elided by the label rather than truncated here, so the full text stays in the tooltip.
    auto* row = chats_list_->AddChildView(std::make_unique<views::LabelButton>(
        base::BindRepeating(&RedrobSidebarSections::OpenChat, base::Unretained(this), task->id),
        base::UTF8ToUTF16(task->prompt)));
    row->SetHorizontalAlignment(gfx::ALIGN_LEFT);
    row->SetMinSize(gfx::Size(0, kRowHeight));
    row->SetTooltipText(base::UTF8ToUTF16(task->prompt));
    ++shown;
  }
  InvalidateLayout();
}

void RedrobSidebarSections::OpenChat(std::string task_id) {
  if (!browser_) {
    return;
  }
  // The same URL the new tab page navigates to, so a chat opened from here and one opened from a card
  // are the same tab rather than two views of one task.
  NavigateParams params(browser_,
                        GURL(std::string(chrome::kChromeUIRedrobURL) + "?task=" + task_id),
                        ui::PAGE_TRANSITION_AUTO_BOOKMARK);
  params.disposition = WindowOpenDisposition::SINGLETON_TAB;
  Navigate(&params);
}

void RedrobSidebarSections::SetCollapsed(bool collapsed) {
  if (collapsed_ == collapsed) {
    return;
  }
  collapsed_ = collapsed;
  // Hidden as a block. At 56px there is no width for a label, and half-drawn text would read as a
  // rendering bug rather than as a collapsed sidebar. The avatar is the one thing that STAYS: it is
  // 28px square, it needs no label, and it is the only sign-in control this browser has.
  search_button_->SetVisible(!collapsed);
  compose_button_->SetVisible(!collapsed);
  // Goes through the same decision as the avatar's, so expanding the column does not put the workspace name
  // back beside a sign-in pill that is still up.
  UpdateHeaderForAvatarState();
  chats_heading_->SetVisible(!collapsed);
  chats_list_->SetVisible(!collapsed);
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
    // The favicon is what makes this list scannable -- the reference identifies a bookmark by its mark
    // before its name. GetFavicon starts the load if it has not happened; the result arrives as a model
    // change, which lands back here and rebuilds, so there is no separate callback to hold.
    if (node->is_url()) {
      const gfx::Image& favicon = model->GetFavicon(node);
      if (!favicon.IsEmpty()) {
        row->SetImageModel(views::Button::STATE_NORMAL,
                           ui::ImageModel::FromImage(favicon));
      }
      row->SetImageLabelSpacing(kFaviconLabelSpacing);
    }
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

void RedrobSidebarSections::ShowTabSearch() {
  if (!browser_) {
    return;
  }
  // The browser owns ONE tab search bubble host and anchors it at construction, so this asks that host to
  // show rather than making a second one -- and BrowserView anchors it to THIS button, which is why the
  // bubble appears under the magnifier instead of under the hidden control it used to hang from.
  if (BrowserView* browser_view = BrowserView::GetBrowserViewForBrowser(browser_)) {
    if (TabSearchBubbleHost* host = browser_view->GetTabSearchBubbleHost()) {
      host->ShowTabSearchBubble();
    }
  }
}

void RedrobSidebarSections::OnViewPreferredSizeChanged(views::View* observed) {
  UpdateHeaderForAvatarState();
}

void RedrobSidebarSections::UpdateHeaderForAvatarState() {
  if (!workspace_button_ || !avatar_) {
    return;
  }
  workspace_button_->SetVisible(!collapsed_ && !avatar_->IsLabelPresentAndVisible());
  InvalidateLayout();
}

void RedrobSidebarSections::StartNewTask() {
  if (!browser_) {
    return;
  }
  // A new tab, which in this product IS the composer -- so "new task" and "new tab" are the same action
  // and there is no second thing to keep in step. Not a singleton: two tasks at once is normal, and each
  // wants its own tab.
  NavigateParams params(browser_, GURL(chrome::kChromeUIRedrobURL),
                        ui::PAGE_TRANSITION_AUTO_BOOKMARK);
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
