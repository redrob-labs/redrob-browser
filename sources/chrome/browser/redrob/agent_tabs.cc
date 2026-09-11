// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/agent_tabs.h"

#include <map>
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
#include "components/tab_groups/tab_group_color.h"
#include "components/tab_groups/tab_group_visual_data.h"
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
  BrowserWindowInterface* actual = params.browser;
  if (!actual || !params.navigated_or_inserted_contents) {
    return nullptr;
  }
  TabStripModel* model = actual->GetTabStripModel();
  const int index = model->GetIndexOfWebContents(params.navigated_or_inserted_contents);
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
    return params.navigated_or_inserted_contents;
  }

  const tab_groups::TabGroupId group = model->AddToNewGroup({index});
  model->ChangeTabGroupVisuals(
      group, tab_groups::TabGroupVisualData(base::UTF8ToUTF16(group_title),
                                            tab_groups::TabGroupColorId::kBlue,
                                            /*is_collapsed=*/false));
  GroupRegistry().insert_or_assign(profile, group);
  return params.navigated_or_inserted_contents;
}

}  // namespace redrob
