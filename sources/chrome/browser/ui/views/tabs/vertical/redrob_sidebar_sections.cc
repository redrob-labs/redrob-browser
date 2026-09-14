// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/views/tabs/vertical/redrob_sidebar_sections.h"

#include "chrome/app/vector_icons/vector_icons.h"
#include "chrome/browser/ui/views/tabs/vertical/redrob_sidebar_tokens.h"

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
#include "chrome/browser/redrob/resources/grit/redrob_strings.h"
#include "chrome/browser/redrob/task_store_factory.h"
#include "chrome/browser/tab_group_sync/tab_group_sync_service_factory.h"
#include "chrome/browser/ui/tabs/saved_tab_groups/saved_tab_group_utils.h"
#include "chrome/browser/ui/tabs/tab_group_model.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/views/frame/browser_view.h"
#include "chrome/browser/ui/views/tab_search_bubble_host.h"
#include "chrome/common/webui_url_constants.h"
#include "components/bookmarks/browser/bookmark_node.h"
#include "components/saved_tab_groups/public/saved_tab_group.h"
#include "components/saved_tab_groups/public/types.h"
#include "components/vector_icons/vector_icons.h"
#include "ui/base/l10n/l10n_util.h"
#include "ui/base/models/image_model.h"
#include "ui/base/mojom/menu_source_type.mojom-shared.h"
#include "ui/color/color_id.h"
#include "skia/ext/image_operations.h"
#include "ui/gfx/image/image.h"
#include "ui/gfx/image/image_skia_operations.h"
#include "ui/views/accessibility/view_accessibility.h"
#include "ui/views/background.h"
#include "ui/views/controls/highlight_path_generator.h"
#include "ui/views/controls/menu/menu_runner.h"
#include "ui/base/metadata/metadata_impl_macros.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"
#include "ui/gfx/font_list.h"
#include "ui/views/controls/button/image_button.h"
#include "ui/views/controls/image_view.h"
#include "chrome/browser/ui/views/toolbar/toolbar_view.h"
#include "chrome/browser/ui/views/profiles/avatar_toolbar_button.h"
#include "ui/views/controls/button/label_button.h"
#include "ui/views/border.h"
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

// Workspace menu command ids that are NOT an index into `menu_workspace_ids_`.
//
// Well above any plausible number of saved workspaces, and bounds-checked at the receiving end regardless:
// ExecuteCommand casts the id to an index, so a sentinel that could collide with a real one would open the
// wrong workspace rather than fail visibly.
constexpr int kWorkspaceMenuEmptyCommandId = 100000;
constexpr int kWorkspaceMenuSaveCommandId = 100001;

std::unique_ptr<views::Label> MakeHeading(int message_id) {
  auto label = std::make_unique<views::Label>(l10n_util::GetStringUTF16(message_id));
  label->SetHorizontalAlignment(gfx::ALIGN_LEFT);
  label->SetEnabledColor(sidebar_tokens::kMutedForeground);
  label->SetFontList(
      label->font_list().DeriveWithSizeDelta(sidebar_tokens::kSectionLabelSizeDelta));
  // A heading sits at the same leading edge as the rows under it. Without this it is inset by the list's
  // own padding and the rows by the button's, and the two disagree by however much those differ -- which is
  // how the labels ended up at x=17 and the rows at x=23 when the reference has both at 15.
  label->SetBorder(views::CreateEmptyBorder(
      gfx::Insets::TLBR(sidebar_tokens::kSectionGapAbove, sidebar_tokens::kRowPaddingLeading,
                        sidebar_tokens::kSectionGapBelow, 0)));
  return label;
}

// What a section shows when it has no rows.
//
// A heading with nothing under it reads as a half-drawn list rather than as an empty one, and this shell has
// no other in-place teaching: the note says what would put a row there. Built as a Label rather than through
// MakeRow because it must not be pressable -- a row that looks like every other row and does nothing when
// clicked is the defect this is fixing, not a style of fixing it.
//
// Aligned with the HEADING's leading edge, not with a row's text. It belongs to the section rather than to the
// list, and starting it where a row's title starts would make it read as a row whose icon failed to load.
std::unique_ptr<views::Label> MakeEmptyNote(int message_id) {
  auto label = std::make_unique<views::Label>(l10n_util::GetStringUTF16(message_id));
  label->SetHorizontalAlignment(gfx::ALIGN_LEFT);
  label->SetEnabledColor(sidebar_tokens::kMutedForeground);
  label->SetFontList(
      label->font_list().DeriveWithSizeDelta(sidebar_tokens::kSectionLabelSizeDelta));
  // Multi-line, because the column narrows to 126px and every one of these strings is a sentence. Eliding
  // would leave the user with the first half of an instruction.
  label->SetMultiLine(true);
  label->SetBorder(views::CreateEmptyBorder(
      gfx::Insets::TLBR(0, sidebar_tokens::kRowPaddingLeading, sidebar_tokens::kSectionGapBelow,
                        sidebar_tokens::kRowPaddingLeading)));
  return label;
}

}  // namespace

// THE one place a sidebar row is built.
//
// Every row -- a bookmark, a chat -- comes from here, so a row cannot disagree with the tokens by being
// constructed at a call site that forgot one of them. That is the whole point of having tokens: before this,
// each site set its own alignment and min-height and inherited everything else from upstream's defaults,
// which is why the measured left edge was 23px against the reference's 15 and the text was #1f1f1f against
// #090b0c.
//
// The insets in particular have to be stated. views::LabelButton takes its own from the LayoutProvider,
// which is tuned for dialog buttons -- generous, symmetric, and nothing to do with a 32px list row.
std::unique_ptr<views::LabelButton> MakeRow(views::Button::PressedCallback callback,
                                            const std::u16string& text) {
  auto row = std::make_unique<views::LabelButton>(std::move(callback), text);
  row->SetHorizontalAlignment(gfx::ALIGN_LEFT);
  row->SetBorder(views::CreateEmptyBorder(gfx::Insets::TLBR(
      0, sidebar_tokens::kRowPaddingLeading, 0, sidebar_tokens::kRowPaddingLeading)));
  row->SetMinSize(gfx::Size(0, sidebar_tokens::kRowHeight));
  row->SetTextColor(views::Button::STATE_NORMAL, sidebar_tokens::kRowForeground);
  row->SetTextColor(views::Button::STATE_HOVERED, sidebar_tokens::kRowForeground);
  row->SetImageLabelSpacing(sidebar_tokens::kFaviconLabelSpacing);
  // A row is one line. A bookmark title or a task prompt is arbitrarily long, so the choice is between
  // eliding and wrapping, and wrapping would break the rhythm the tokens exist to hold. Set through the
  // button rather than its label, which is protected -- LabelButton owns that and exposes the behaviour.
  row->SetElideBehavior(gfx::ELIDE_TAIL);
  row->SetTooltipText(text);
  return row;
}


RedrobSidebarSections::RedrobSidebarSections(BrowserWindowInterface* browser) : browser_(browser) {
  SetLayoutManager(std::make_unique<views::BoxLayout>(
      views::BoxLayout::Orientation::kVertical,
      gfx::Insets::VH(4, sidebar_tokens::kRowInset), sidebar_tokens::kRowSpacing));

  // The header: the workspace name, then the two controls at the trailing edge. The ACCOUNT is not here --
  // it is at the foot of the column with Settings, which is where Janghoon put it. An earlier version moved
  // the avatar up here beside the name because the reference shows it there; the reference combines it with
  // its own workspace switcher, and that is not the shape this product wants.
  auto* header = AddChildView(std::make_unique<views::View>());
  auto* header_layout = header->SetLayoutManager(std::make_unique<views::BoxLayout>(
      views::BoxLayout::Orientation::kHorizontal, gfx::Insets(), 6));
  header_layout->set_cross_axis_alignment(views::BoxLayout::CrossAxisAlignment::kCenter);

  // The avatar LEADS the workspace name, because in this product the profile and the workspace are the same
  // feature -- so this glyph is the workspace's mark, not a second account control. It is also still the
  // browser's ONE avatar: registered with the toolbar below, so every bubble that anchors to "the avatar"
  // finds it here instead of pointing at a corner where nothing is drawn.
  // The leading group -- avatar, name, chevron -- in its own container, because it is the part that has to give
  // way. Signed out, the avatar expands into a "Sign in to Google?" pill of about 145px, and in a flat row that
  // width pushed everything after it along: in a 254px column the magnifier and compose button went off the edge
  // and were not on the row at all while the promo showed. Flexing this container instead means the group shrinks
  // and the name elides, and the trailing controls keep their size.
  auto* lead = header->AddChildView(std::make_unique<views::View>());
  auto* lead_layout = lead->SetLayoutManager(std::make_unique<views::BoxLayout>(
      views::BoxLayout::Orientation::kHorizontal, gfx::Insets(), 4));
  lead_layout->set_cross_axis_alignment(views::BoxLayout::CrossAxisAlignment::kCenter);
  // Held because SetCollapsed re-aligns it: collapsed, this container carries the avatar alone and has to
  // centre it in the rail rather than leave it at the expanded row's leading edge.
  header_lead_layout_ = lead_layout;

  if (browser_) {
    avatar_ = lead->AddChildView(std::make_unique<AvatarToolbarButton>(browser_));
    avatar_->SetVisible(true);
    if (BrowserView* browser_view = BrowserView::GetBrowserViewForBrowser(browser_)) {
      if (ToolbarView* toolbar = browser_view->toolbar()) {
        toolbar->SetRedrobAvatarButton(avatar_);
      }
    }
  }

  // The workspace switcher. A workspace IS a saved tab group -- the browser already has the concept,
  // persists it, and syncs it, so inventing a parallel one would mean two things the user has to keep
  // in step by hand.
  workspace_button_ = lead->AddChildView(std::make_unique<views::LabelButton>(
      base::BindRepeating(&RedrobSidebarSections::ShowWorkspaceMenu, base::Unretained(this)),
      std::u16string()));
  workspace_button_->SetHorizontalAlignment(gfx::ALIGN_LEFT);
  workspace_button_->SetMinSize(gfx::Size(0, sidebar_tokens::kRowHeight));
  // A chevron after the name, because without it the name is indistinguishable from a section heading -- which
  // is exactly how it read next to the reference: our header said "Workspaces" in the same weight and colour
  // as "Bookmarks" one row below, so the row that SWITCHES workspaces looked like the row that labels them.
  //
  // No avatar beside it, though the reference has one. The reference's chip combines the account and the
  // workspace; this product splits them and the account deliberately lives at the column's foot, so a second
  // avatar up here would be a second sign-in affordance for the one account.
  workspace_chevron_ = lead->AddChildView(std::make_unique<views::ImageView>());
  workspace_chevron_->SetImage(ui::ImageModel::FromVectorIcon(
      vector_icons::kKeyboardArrowDownIcon, sidebar_tokens::kMutedForeground,
      sidebar_tokens::kHeaderGlyphSize));

  // The flex belongs to the LEADING GROUP, not to a spacer. A spacer absorbing the slack kept the name and its
  // chevron together, which was the point at the time, but it also meant nothing in the row could shrink -- so an
  // avatar that grew had to push. Flexing the group lets it be the thing that gives way, and the name elides
  // inside it because a LabelButton at ELIDE_TAIL shrinks where a fixed one would clip.
  workspace_button_->SetElideBehavior(gfx::ELIDE_TAIL);
  header_layout->SetFlexForView(lead, 1);

  // The two controls at the trailing edge, measured off the reference: a bare 12px magnifier, then the
  // compose glyph inside a 28px raised circle. The asymmetry is the design and not an oversight -- starting
  // something is the primary action on this row and finding a tab is the secondary one, so only one of them
  // is given a surface.
  //
  // Upstream puts the same PAIR of actions -- tab search and new tab, as a TabStripComboButton -- one row
  // up, next to the collapse toggle. That button is hidden and these replace it rather than both existing,
  // because two ways to open tab search in one column is two things to keep in step.
  search_button_ = header->AddChildView(std::make_unique<views::ImageButton>(
      base::BindRepeating(&RedrobSidebarSections::ShowTabSearch, base::Unretained(this))));
  search_button_->SetImageModel(
      views::Button::STATE_NORMAL,
      ui::ImageModel::FromVectorIcon(vector_icons::kSearchIcon,
                                     sidebar_tokens::kMutedForeground,
                                     sidebar_tokens::kHeaderGlyphSize));
  search_button_->SetImageHorizontalAlignment(views::ImageButton::ALIGN_CENTER);
  search_button_->SetImageVerticalAlignment(views::ImageButton::ALIGN_MIDDLE);
  search_button_->SetPreferredSize(
      gfx::Size(sidebar_tokens::kRowHeight, sidebar_tokens::kRowHeight));
  search_button_->GetViewAccessibility().SetName(l10n_util::GetStringUTF16(IDS_REDROB_SIDEBAR_SEARCH_TABS));
  search_button_->SetTooltipText(l10n_util::GetStringUTF16(IDS_REDROB_SIDEBAR_SEARCH_TABS));
  views::InstallCircleHighlightPathGenerator(search_button_);

  compose_button_ = header->AddChildView(std::make_unique<views::ImageButton>(
      base::BindRepeating(&RedrobSidebarSections::StartNewTask, base::Unretained(this))));
  compose_button_->SetImageModel(
      views::Button::STATE_NORMAL,
      ui::ImageModel::FromVectorIcon(vector_icons::kEditSquareIcon,
                                     sidebar_tokens::kRowForeground,
                                     sidebar_tokens::kHeaderGlyphSize));
  compose_button_->SetImageHorizontalAlignment(views::ImageButton::ALIGN_CENTER);
  compose_button_->SetImageVerticalAlignment(views::ImageButton::ALIGN_MIDDLE);
  compose_button_->SetPreferredSize(
      gfx::Size(sidebar_tokens::kComposeButtonSize, sidebar_tokens::kComposeButtonSize));
  compose_button_->SetBackground(views::CreateRoundedRectBackground(
      sidebar_tokens::kRaisedSurface, sidebar_tokens::kComposeButtonSize / 2));
  compose_button_->GetViewAccessibility().SetName(l10n_util::GetStringUTF16(IDS_REDROB_SIDEBAR_NEW_TASK));
  compose_button_->SetTooltipText(l10n_util::GetStringUTF16(IDS_REDROB_SIDEBAR_NEW_TASK));
  views::InstallCircleHighlightPathGenerator(compose_button_);

  header_ = header;

  bookmarks_heading_ = AddChildView(MakeHeading(IDS_REDROB_SIDEBAR_BOOKMARKS));
  bookmarks_list_ = AddChildView(std::make_unique<views::View>());
  bookmarks_list_->SetLayoutManager(std::make_unique<views::BoxLayout>(
      views::BoxLayout::Orientation::kVertical, gfx::Insets(), sidebar_tokens::kRowSpacing));

  chats_heading_ = AddChildView(MakeHeading(IDS_REDROB_SIDEBAR_CHATS));
  chats_list_ = AddChildView(std::make_unique<views::View>());
  chats_list_->SetLayoutManager(std::make_unique<views::BoxLayout>(
      views::BoxLayout::Orientation::kVertical, gfx::Insets(), sidebar_tokens::kRowSpacing));

  tabs_heading_ = AddChildView(MakeHeading(IDS_REDROB_SIDEBAR_TABS));

  // "+ New Tab" as the FIRST ROW of the Tabs section, which is where the reference puts it -- a row in the
  // list, left-aligned, its text in the muted ink, not a centred glyph floating under the list. Upstream's
  // own new-tab control is a bare icon button in the strip's bottom container; it is hidden and this replaces
  // it.
  //
  // This IS a second way to open a new tab, alongside the compose button in the header, and the reference has
  // both. That is not the objection raised against upstream's combo button: both of these call one function
  // and hold no state, where two tab-search entry points meant two anchors and two visibility rules to keep
  // in step.
  new_tab_row_ = AddChildView(MakeRow(
      base::BindRepeating(&RedrobSidebarSections::StartNewTask, base::Unretained(this)),
      l10n_util::GetStringUTF16(IDS_REDROB_SIDEBAR_NEW_TAB)));
  new_tab_row_->SetImageModel(
      views::Button::STATE_NORMAL,
      ui::ImageModel::FromVectorIcon(vector_icons::kAdd2Icon,
                                     sidebar_tokens::kMutedForeground,
                                     sidebar_tokens::kFaviconSize));
  new_tab_row_->SetTextColor(views::Button::STATE_NORMAL, sidebar_tokens::kMutedForeground);
  new_tab_row_->SetTextColor(views::Button::STATE_HOVERED, sidebar_tokens::kRowForeground);

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
  // The toolbar holds a raw pointer to a button THIS view owns, so it has to be told before the button goes
  // away. Views are destroyed in an order neither of them chooses, and this moved here with the avatar -- the
  // account row used to carry it, and leaving it behind would have left the toolbar pointing at freed memory.
  if (browser_ && avatar_) {
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
    // recognise. Elided by the row rather than truncated here, so the full text stays in the tooltip.
    auto* row = chats_list_->AddChildView(MakeRow(
        base::BindRepeating(&RedrobSidebarSections::OpenChat, base::Unretained(this), task->id),
        base::UTF8ToUTF16(task->prompt)));
    // A mark, because without one this was the ONLY row type in the column whose label started at the row's
    // own edge while every bookmark and tab beside it started 24px in -- so a list that is supposed to scan as
    // one column had two left margins. chat_spark rather than plain chat: these rows are agent tasks, and the
    // spark is what upstream uses to mean exactly that.
    row->SetImageModel(views::Button::STATE_NORMAL,
                       ui::ImageModel::FromVectorIcon(vector_icons::kChatSparkIcon,
                                                      sidebar_tokens::kMutedForeground,
                                                      sidebar_tokens::kFaviconSize));
    ++shown;
  }
  // Nothing to show is a state this section has to draw, not one it can leave blank.
  if (shown == 0) {
    chats_list_->AddChildView(MakeEmptyNote(IDS_REDROB_SIDEBAR_CHATS_EMPTY));
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
  workspace_button_->SetVisible(!collapsed);
  if (workspace_chevron_) {
    workspace_chevron_->SetVisible(!collapsed);
  }
  // The avatar STAYS, which is what the paragraph above always claimed and what the code did the opposite of:
  // it read SetVisible(!collapsed) AND hid the leading container the avatar lives in, so the collapsed rail
  // had no account indication and no sign-in control at all. Measured on the collapsed rail before this, the
  // only glyphs present were the toggle, the tab favicon and the settings gear.
  if (avatar_) {
    avatar_->SetVisible(true);
  }
  // The leading container therefore stays too -- hiding it is what actually removed the avatar. Its own
  // reason for being hidden does not apply in this state: it was hidden so a flexed empty box could not hold
  // the trailing controls away from the edge, and in a collapsed column there ARE no trailing controls, since
  // the magnifier and the compose button are hidden a few lines below.
  //
  // Centred rather than left-aligned while collapsed. The rail is 56px and this view is inset by kRowInset on
  // each side, so centring inside the container puts a 28px avatar's leading edge at 6 + (44-28)/2 = 14, which
  // is the rail's centre for a 28px glyph. Left-aligned it sat at 6 -- the same leftward error the toggle and
  // the settings gear had, and for the same reason: expanded-state padding surviving into a state that has no
  // labels left to align to.
  if (header_lead_layout_) {
    header_lead_layout_->set_main_axis_alignment(
        collapsed ? views::BoxLayout::MainAxisAlignment::kCenter
                  : views::BoxLayout::MainAxisAlignment::kStart);
  }
  search_button_->SetVisible(!collapsed);
  compose_button_->SetVisible(!collapsed);
  chats_heading_->SetVisible(!collapsed);
  chats_list_->SetVisible(!collapsed);
  bookmarks_heading_->SetVisible(!collapsed);
  bookmarks_list_->SetVisible(!collapsed);
  tabs_heading_->SetVisible(!collapsed);
  new_tab_row_->SetVisible(!collapsed);
  InvalidateLayout();
}

void RedrobSidebarSections::BookmarkModelChanged() {
  RebuildBookmarks();
}

void RedrobSidebarSections::BookmarkModelLoaded(bool ids_reassigned) {
  RebuildBookmarks();
}

void RedrobSidebarSections::BookmarkNodeFaviconChanged(
    const bookmarks::BookmarkNode* node) {
  // The favicon is loaded lazily and asynchronously: GetFavicon STARTS the fetch and returns an empty image,
  // and this is the only callback that says it finished. BaseBookmarkModelObserver overrides it to do nothing
  // on the grounds that most observers do not care about favicons -- which is true of most observers and is
  // exactly wrong for a list whose rows are identified by their mark before their name.
  //
  // Verified rather than assumed: with a favicon served, fetched and written to the Favicons database, both
  // bookmark rows still measured #7c8390 -- the muted role that tints the fallback globe -- because nothing
  // ever asked the row to draw again.
  //
  // A full rebuild rather than repainting the one row. Every favicon arrives once, early, and the list is a
  // handful of rows; a targeted update would mean holding a node-to-view map whose only job is to save a
  // rebuild the user cannot perceive.
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
    auto* row = bookmarks_list_->AddChildView(MakeRow(
        node->is_url() ? base::BindRepeating(&RedrobSidebarSections::OpenBookmark,
                                             base::Unretained(this), node->url())
                       : views::Button::PressedCallback(),
        std::u16string(node->GetTitle())));
    row->SetEnabled(node->is_url());
    // The favicon is what makes this list scannable -- the reference identifies a bookmark by its mark
    // before its name. GetFavicon starts the load if it has not happened; the result arrives as a model
    // change, which lands back here and rebuilds, so there is no separate callback to hold.
    if (node->is_url()) {
      const gfx::Image& favicon = model->GetFavicon(node);
      if (!favicon.IsEmpty()) {
        // Sized by the token rather than by whatever the site shipped: favicons arrive at 16, 32 and 48,
        // and an unsized ImageModel makes the row as tall as the biggest one it happens to hold.
        row->SetImageModel(
            views::Button::STATE_NORMAL,
            ui::ImageModel::FromImageSkia(gfx::ImageSkiaOperations::CreateResizedImage(
                favicon.AsImageSkia(), skia::ImageOperations::RESIZE_BEST,
                gfx::Size(sidebar_tokens::kFaviconSize, sidebar_tokens::kFaviconSize))));
      } else {
        // No favicon yet, but the row still has to hold its place: without a reserved box the label starts
        // at the icon's position and jumps 24px sideways the moment the favicon loads.
        row->SetImageModel(views::Button::STATE_NORMAL,
                           ui::ImageModel::FromVectorIcon(
                               vector_icons::kGlobeIcon, sidebar_tokens::kMutedForeground,
                               sidebar_tokens::kFaviconSize));
      }
    }
    ++shown;
  }
  // Nothing to show is a state this section has to draw, not one it can leave blank. Placed after the
  // model->loaded() guard above deliberately: while the model is still loading the section is not empty,
  // it is unknown, and telling the user to press Ctrl+D would answer a question nobody has asked yet.
  if (shown == 0) {
    bookmarks_list_->AddChildView(MakeEmptyNote(IDS_REDROB_SIDEBAR_BOOKMARKS_EMPTY));
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
  std::u16string label = l10n_util::GetStringUTF16(IDS_REDROB_SIDEBAR_WORKSPACES);
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
  // Never disabled. It used to be `SetEnabled(count > 0)`, which made the header's only dropdown a control
  // that could not be pressed for as long as the user had no workspaces -- i.e. from the moment the browser
  // was installed, which is exactly when they would press it to find out what a workspace is. The empty case
  // is a MENU now: it says there are none and offers the one action that makes one. A tooltip cannot carry
  // that, because a tooltip is the reward for hovering something you already believe works.
  workspace_button_->SetTooltipText(
      l10n_util::GetStringUTF16(count > 0 ? IDS_REDROB_SIDEBAR_SWITCH_WORKSPACE
                                          : IDS_REDROB_SIDEBAR_SAVE_GROUP_FOR_WORKSPACE));
}

void RedrobSidebarSections::ShowWorkspaceMenu() {
  menu_workspace_ids_ = WorkspaceIds();
  if (!browser_) {
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
        group->title().empty()
            ? l10n_util::GetStringUTF16(IDS_REDROB_SIDEBAR_UNTITLED_WORKSPACE)
            : group->title();
    workspace_menu_model_->AddItem(static_cast<int>(i), title);
  }

  // The empty case says so, in the menu, rather than the menu declining to appear. A dropdown that opens onto
  // "there are none" is still an answer, and it is the answer the disabled button withheld.
  const bool has_any = workspace_menu_model_->GetItemCount() > 0;
  if (!has_any) {
    workspace_menu_model_->AddItem(kWorkspaceMenuEmptyCommandId,
                                   l10n_util::GetStringUTF16(IDS_REDROB_SIDEBAR_NO_WORKSPACES_YET));
    workspace_menu_model_->SetEnabledAt(workspace_menu_model_->GetItemCount() - 1, false);
  }

  // And the way OUT of the empty state, in the same menu. Offered only when there is something to group: a
  // command that would create an empty workspace is the same dead control in a different costume.
  if (!UngroupedTabIndices().empty()) {
    if (has_any) {
      workspace_menu_model_->AddSeparator(ui::NORMAL_SEPARATOR);
    }
    workspace_menu_model_->AddItem(kWorkspaceMenuSaveCommandId,
                                   l10n_util::GetStringUTF16(IDS_REDROB_SIDEBAR_SAVE_WORKSPACE));
  }

  if (workspace_menu_model_->GetItemCount() == 0) {
    return;
  }

  workspace_menu_runner_ = std::make_unique<views::MenuRunner>(
      workspace_menu_model_.get(), views::MenuRunner::HAS_MNEMONICS);
  workspace_menu_runner_->RunMenuAt(GetWidget(), nullptr,
                                    workspace_button_->GetBoundsInScreen(),
                                    views::MenuAnchorPosition::kTopLeft,
                                    ui::mojom::MenuSourceType::kNone);
}

// The tabs in this window that belong to no group yet.
//
// Only these are swept into a new workspace. Tabs already in a group -- the agent's own group included --
// would be MOVED out of it by AddToNewGroup, so a command whose label says "save these tabs" would quietly
// dismantle the grouping the user already had.
std::vector<int> RedrobSidebarSections::UngroupedTabIndices() const {
  std::vector<int> indices;
  if (!browser_) {
    return indices;
  }
  TabStripModel* tab_strip = browser_->GetTabStripModel();
  if (!tab_strip) {
    return indices;
  }
  for (int i = 0; i < tab_strip->count(); ++i) {
    if (!tab_strip->GetTabGroupForTab(i).has_value()) {
      indices.push_back(i);
    }
  }
  return indices;
}

void RedrobSidebarSections::ExecuteCommand(int command_id, int event_flags) {
  if (!browser_) {
    return;
  }
  // The sentinels first, because the index path below casts the id and would read far past the vector.
  if (command_id == kWorkspaceMenuEmptyCommandId) {
    return;  // A disabled item cannot be chosen; handled so it can never fall through to the cast.
  }
  if (command_id == kWorkspaceMenuSaveCommandId) {
    // Grouping the tabs is the whole action: a local group is picked up by TabGroupSyncService, which is the
    // same service WorkspaceIds() reads, so the new workspace appears in this menu without a second call to
    // save it. Re-read rather than reusing the list the menu was built from -- a tab can close while a menu
    // is open, and a stale index here would group the wrong tab.
    const std::vector<int> indices = UngroupedTabIndices();
    if (indices.empty()) {
      return;
    }
    if (TabStripModel* tab_strip = browser_->GetTabStripModel()) {
      tab_strip->AddToNewGroup(indices);
    }
    UpdateWorkspaceButton();
    return;
  }

  const size_t index = static_cast<size_t>(command_id);
  // The menu is torn down and rebuilt per press, but a command can still arrive against a model built
  // before the last change, so the index is bounds-checked rather than trusted.
  if (index >= menu_workspace_ids_.size()) {
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
