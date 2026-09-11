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
  // Returns false without opening anything when the URL is one an agent may not be handed (see the
  // implementation's scheme check) or when the profile has no ordinary browser window to put a tab in.
  //
  // Background, never foreground: a task running while the user reads something else must not steal
  // what they are looking at.
  static bool OpenInAgentGroup(Profile* profile, const GURL& url, const std::string& group_title);

  // The agent group for this profile, if one is open. Exposed for tests and for callers that want to
  // report how many tabs a task has open.
  static std::optional<tab_groups::TabGroupId> GroupForProfile(Profile* profile);

 private:
  static bool IsUrlAgentMayOpen(const GURL& url);
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_AGENT_TABS_H_
