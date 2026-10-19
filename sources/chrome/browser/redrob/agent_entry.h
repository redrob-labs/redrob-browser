// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_AGENT_ENTRY_H_
#define CHROME_BROWSER_REDROB_AGENT_ENTRY_H_

#include <optional>
#include <string>

#include "base/functional/callback_forward.h"
#include "url/gurl.h"

class Profile;

namespace redrob {

// The ONE way a native surface hands a request to the agent: the address bar's agent mode (CAP-3)
// and the quick window (CAP-5) both end here.
//
// WHY THIS OPENS THE AGENT PAGE RATHER THAN CALLING TaskStore::StartTask. The task a person can see,
// steer and come back to is the agent extension's conversation, and the new tab starts one by
// navigating to `app.html#/home/chat?q=<text>&mode=agent[&tabs=<id>]` -- that page sends the message
// itself on load. A native entrance that started a TaskStore task instead would create work no
// surface of ours lists: the extension does not read TaskStore, so the person typed a request and
// it went somewhere they cannot follow. Opening the same route the new tab opens is what "no second
// task path" means in this tree.
//
// The tab context travels as an extension tab id, which is the id `chrome.tabs` uses -- the same
// value the new tab's own composer puts in `tabs=` when the user attaches a tab. The page then reads
// the tab's URL and title itself, so nothing about the page crosses here as a string.

// The agent page's chat route, with `prompt` as the first message. `context_tab_id` is the extension
// tab id of the page the request is ABOUT, or nullopt for a request with no page.
GURL AgentChatUrl(const std::string& prompt, std::optional<int> context_tab_id);

// The quick window's page: chrome://redrob/quick, resolved to the agent extension's own URL. The
// widget loads the extension URL directly rather than the chrome:// alias, so a change to the alias
// table cannot leave the window blank.
GURL QuickWindowUrl();

// Opens the agent chat for `prompt` in a new foreground tab of the profile's last active window,
// creating a window when there is none, and brings that window to the front. Does nothing for an
// empty prompt or an off-the-record profile -- an agent task in a window whose promise is leaving
// no trace would be a broken promise.
void OpenAgentChat(Profile* profile,
                   const std::string& prompt,
                   std::optional<int> context_tab_id);

// The quick window is Views code in chrome/browser/ui, which this target must not depend on; the
// extension function that closes it lives below chrome/browser/ui. So the window registers how to
// close itself here while it is open, and anything else asks through this. Process-wide: there is at
// most one quick window, whichever profile opened it.
void SetQuickWindowCloser(base::RepeatingClosure closer);
void ClearQuickWindowCloser();
// Closes the quick window if one is open. Safe to call when none is.
void CloseQuickWindow();

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_AGENT_ENTRY_H_
