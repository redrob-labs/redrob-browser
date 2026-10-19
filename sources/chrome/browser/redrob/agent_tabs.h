// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_AGENT_TABS_H_
#define CHROME_BROWSER_REDROB_AGENT_TABS_H_

#include <optional>
#include <string>

#include "components/tab_groups/tab_group_id.h"
#include "url/gurl.h"

class Profile;

namespace content {
class WebContents;
}  // namespace content

namespace redrob {

// Opens the pages an agent asked for as REAL tabs, collected in one named tab group.
//
// Real tabs rather than a hidden fetch or an offscreen WebContents, because the point is that the user
// can see, take over and close what the agent is doing. An agent browsing somewhere the user cannot
// look is the failure mode this arrangement exists to avoid -- and it means the agent inherits exactly
// the user's own permissions and sessions, with nothing extra granted to it.
class AgentTabs {
 public:
  // Opens `url` in the background, in this profile's agent group, creating the group on first use.
  // Returns the tab's contents, or nullptr without opening anything when the URL is one an agent may
  // not be handed (see the implementation's scheme check) or when the profile has no ordinary browser
  // window to put a tab in.
  //
  // The contents come back so a caller can capture frames of it. Not owned -- the tab strip owns the
  // tab, and the user can close it at any moment, so a caller must not store this raw.
  //
  // Background, never foreground: a task running while the user reads something else must not steal
  // what they are looking at.
  static content::WebContents* OpenInAgentGroup(Profile* profile,
                                               const GURL& url,
                                               const std::string& group_title);

  // The agent group for this profile, if one is open. Exposed for tests and for callers that want to
  // report how many tabs a task has open.
  static std::optional<tab_groups::TabGroupId> GroupForProfile(Profile* profile);

  // CAP-4. The same as OpenInAgentGroup, except that a profile with no ordinary window gets one: a new
  // window, shown INACTIVE and then minimized, so a task whose window the user closed can keep working
  // in real tabs without taking the screen. Only called when the user has left "keep running tasks after
  // closing windows" on -- that setting is the request for exactly this window, which is why the plain
  // OpenInAgentGroup still refuses to conjure one.
  static content::WebContents* OpenInAgentGroupCreatingWindow(Profile* profile,
                                                             const GURL& url,
                                                             const std::string& group_title);

  // True when this profile has a tabbed window the USER opened -- one that is not a window
  // OpenInAgentGroupCreatingWindow made for a task. "Task done" is announced as a system notification
  // only when this is false, because a person with a window open is already looking at the browser.
  static bool HasUserWindow(Profile* profile);

  // Brings `contents` to the front: its window activated (restored if minimized) and its tab selected.
  // False when the contents is not in a tab strip any more.
  static bool Reveal(content::WebContents* contents);

 private:
  // Groups the tab at `contents` under the profile's agent group in whatever window holds it.
  static content::WebContents* GroupAgentTab(Profile* profile,
                                             content::WebContents* contents,
                                             const std::string& group_title);
  static bool IsUrlAgentMayOpen(const GURL& url);
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_AGENT_TABS_H_
