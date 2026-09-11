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
#include "components/bookmarks/browser/bookmark_node.h"
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

  // The workspace switcher. Labelled from the profile so it says something true from the first frame:
  // workspaces are saved tab groups (docs/UI.md step 7) and until that lands this names the profile it
  // will be scoped to, rather than inventing a workspace that does not exist yet.
  workspace_button_ = AddChildView(std::make_unique<views::LabelButton>(
      views::Button::PressedCallback(), base::UTF8ToUTF16(std::string("Work"))));
  workspace_button_->SetHorizontalAlignment(gfx::ALIGN_LEFT);
  workspace_button_->SetMinSize(gfx::Size(0, kRowHeight));
  // Deliberately disabled rather than hidden: the switcher is where workspaces WILL be chosen, and a
  // control that does nothing when pressed would be a worse lie than one that says it is not ready.
  workspace_button_->SetEnabled(false);
  workspace_button_->SetTooltipText(
      base::UTF8ToUTF16(std::string("Workspaces arrive with saved tab groups")));

  bookmarks_heading_ = AddChildView(MakeHeading("Bookmarks"));
  bookmarks_list_ = AddChildView(std::make_unique<views::View>());
  bookmarks_list_->SetLayoutManager(std::make_unique<views::BoxLayout>(
      views::BoxLayout::Orientation::kVertical, gfx::Insets(), 0));

  tabs_heading_ = AddChildView(MakeHeading("Tabs"));

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

BEGIN_METADATA(RedrobSidebarSections)
END_METADATA

}  // namespace redrob
