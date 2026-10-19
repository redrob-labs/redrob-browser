// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/agent_tabs.h"

#include <map>
#include <set>
#include <vector>

#include "base/no_destructor.h"
#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/profile_browser_collection.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/browser/ui/tabs/tab_group_model.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/sessions/core/session_id.h"
#include "components/tab_groups/tab_group_color.h"
#include "components/tab_groups/tab_group_visual_data.h"
#include "components/tabs/public/tab_interface.h"
#include "ui/base/base_window.h"
#include "content/public/browser/web_contents.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"

namespace redrob {
namespace {

// Keyed by profile rather than held on the task: several tasks share one visible group, because the
// design shows a single "Agent tabs" section in the sidebar rather than one per task.
// TabGroupId is deliberately not default-constructible upstream, so the registry holds it in an
// optional-free way: insert_or_assign only, never operator[].
std::map<const Profile*, tab_groups::TabGroupId>& GroupRegistry() {
  static base::NoDestructor<std::map<const Profile*, tab_groups::TabGroupId>> registry;
  return *registry;
}

// The windows OpenInAgentGroupCreatingWindow made, by session id. A window the agent opened for itself
// is not evidence that the user is at the browser, so HasUserWindow skips these. Ids rather than pointers:
// a closed window's id simply never matches again, where a stale pointer would be a use-after-free.
std::set<SessionID::id_type>& AgentWindows() {
  static base::NoDestructor<std::set<SessionID::id_type>> windows;
  return *windows;
}

}  // namespace

// static
bool AgentTabs::IsUrlAgentMayOpen(const GURL& url) {
  if (!url.is_valid()) {
    return false;
  }
  // An allowlist, not a blocklist. The URL here originates in model output, so the question is not
  // "which schemes are dangerous" -- it is "which schemes is a model allowed to reach at all".
  //
  // http/https only. That rules out file:// reading the user's disk, chrome:// and chrome-untrusted://
  // driving the browser's own UI (settings, and this fork's own AI surface), devtools:// attaching a
  // debugger, javascript: executing in whatever document is current, and the external-protocol schemes
  // that would hand the URL to another application entirely.
  return url.SchemeIs("http") || url.SchemeIs("https");
}

// static
std::optional<tab_groups::TabGroupId> AgentTabs::GroupForProfile(Profile* profile) {
  auto it = GroupRegistry().find(profile);
  if (it == GroupRegistry().end()) {
    return std::nullopt;
  }
  return it->second;
}

// static
content::WebContents* AgentTabs::OpenInAgentGroup(Profile* profile,
                                                  const GURL& url,
                                                  const std::string& group_title) {
  if (!profile || !IsUrlAgentMayOpen(url)) {
    return nullptr;
  }

  BrowserWindowInterface* browser =
      ProfileBrowserCollection::GetForProfile(profile)->FindTabbedBrowser();
  // No ordinary window to put a tab in. Refusing beats opening one: a task running in the background
  // must not conjure a window the user did not ask for.
  if (!browser) {
    return nullptr;
  }

  NavigateParams params(browser, url, ui::PAGE_TRANSITION_AUTO_TOPLEVEL);
  params.disposition = WindowOpenDisposition::NEW_BACKGROUND_TAB;
  Navigate(&params);

  // Navigate() can retarget, so the browser that actually received the tab is read back out of params
  // rather than assumed to be the one asked.
  if (!params.browser || !params.navigated_or_inserted_contents) {
    return nullptr;
  }
  return GroupAgentTab(profile, params.navigated_or_inserted_contents, group_title);
}

// static
content::WebContents* AgentTabs::GroupAgentTab(Profile* profile,
                                               content::WebContents* contents,
                                               const std::string& group_title) {
  tabs::TabInterface* tab = tabs::TabInterface::MaybeGetFromContents(contents);
  BrowserWindowInterface* actual = tab ? tab->GetBrowserWindowInterface() : nullptr;
  if (!actual) {
    return nullptr;
  }
  TabStripModel* model = actual->GetTabStripModel();
  const int index = model->GetIndexOfWebContents(contents);
  if (index == TabStripModel::kNoTab) {
    return nullptr;
  }

  std::optional<tab_groups::TabGroupId> existing = GroupForProfile(profile);
  // A group id outlives the group it named: the user can close every tab in it, or drag them out. Both
  // leave a stale id here, so the model is asked whether it still knows the group before it is reused.
  if (existing.has_value() && !model->group_model()->ContainsTabGroup(existing.value())) {
    GroupRegistry().erase(profile);
    existing.reset();
  }

  if (existing.has_value()) {
    model->AddToExistingGroup({index}, existing.value());
    return contents;
  }

  const tab_groups::TabGroupId group = model->AddToNewGroup({index});
  // Grey, not blue. The group header is a filled row in the sidebar, and at kBlue it was the single
  // loudest element in a column of quiet text -- the agent's tabs were shouting louder than the tab the
  // user is actually looking at. Grey still groups them; it just does not rank them first.
  model->ChangeTabGroupVisuals(
      group, tab_groups::TabGroupVisualData(base::UTF8ToUTF16(group_title),
                                            tab_groups::TabGroupColorId::kGrey,
                                            /*is_collapsed=*/false));
  GroupRegistry().insert_or_assign(profile, group);
  return contents;
}

// static
content::WebContents* AgentTabs::OpenInAgentGroupCreatingWindow(Profile* profile,
                                                               const GURL& url,
                                                               const std::string& group_title) {
  if (!profile || !IsUrlAgentMayOpen(url)) {
    return nullptr;
  }
  if (ProfileBrowserCollection::GetForProfile(profile)->FindTabbedBrowser()) {
    return OpenInAgentGroup(profile, url, group_title);
  }

  // No window. One is opened for the task -- inactive, so it does not take focus from whatever the user
  // is doing in another application, and then minimized, so it does not cover it either. It is still an
  // ordinary window with ordinary tabs: the user can restore it, watch, take over or close it, which is
  // the reason the agent never browses anywhere else (docs/ARCHITECTURE.md section 7).
  NavigateParams params(profile, url, ui::PAGE_TRANSITION_AUTO_TOPLEVEL);
  params.disposition = WindowOpenDisposition::NEW_WINDOW;
  params.window_action = NavigateParams::WindowAction::kShowWindowInactive;
  Navigate(&params);
  if (!params.browser || !params.navigated_or_inserted_contents) {
    return nullptr;
  }
  AgentWindows().insert(params.browser->GetSessionID().id());
  if (ui::BaseWindow* window = params.browser->GetWindow()) {
    window->Minimize();
  }
  return GroupAgentTab(profile, params.navigated_or_inserted_contents, group_title);
}

// static
bool AgentTabs::HasUserWindow(Profile* profile) {
  if (!profile) {
    return false;
  }
  bool found = false;
  ProfileBrowserCollection::GetForProfile(profile)->ForEach(
      [&found](BrowserWindowInterface* browser) {
        if (browser->GetType() == BrowserWindowInterface::TYPE_NORMAL &&
            !AgentWindows().contains(browser->GetSessionID().id())) {
          found = true;
          return false;
        }
        return true;
      });
  return found;
}

// static
bool AgentTabs::Reveal(content::WebContents* contents) {
  tabs::TabInterface* tab = contents ? tabs::TabInterface::MaybeGetFromContents(contents) : nullptr;
  BrowserWindowInterface* browser = tab ? tab->GetBrowserWindowInterface() : nullptr;
  if (!browser) {
    return false;
  }
  TabStripModel* model = browser->GetTabStripModel();
  const int index = model->GetIndexOfWebContents(contents);
  if (index == TabStripModel::kNoTab) {
    return false;
  }
  model->ActivateTabAt(index);
  if (ui::BaseWindow* window = browser->GetWindow()) {
    if (window->IsMinimized()) {
      window->Restore();
    }
    window->Show();
    window->Activate();
  }
  // The user has now seen this window, so it counts as theirs from here on.
  AgentWindows().erase(browser->GetSessionID().id());
  return true;
}

}  // namespace redrob
