// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/agent_entry.h"

#include <utility>

#include "base/functional/callback.h"
#include "base/no_destructor.h"
#include "base/strings/escape.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "chrome/browser/browseros/core/browseros_constants.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "ui/base/base_window.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"

namespace redrob {
namespace {

// The extension page that owns the agent surface, and the hash routes on it. Kept as the three
// pieces the new tab's own router uses, so a reader can grep both sides for the same strings.
constexpr char kAgentPage[] = "/app.html";
constexpr char kChatRoute[] = "#/home/chat?";
constexpr char kQuickRoute[] = "#/quick";

// A prompt is what a person typed into one line. Longer than this is a paste of a document, and the
// URL that carries it would be the thing that broke -- so it is cut here, where the limit is visible,
// rather than by whichever layer first refuses a long URL.
constexpr size_t kMaxPromptLength = 8 * 1024;

std::string AgentOrigin() {
  return std::string("chrome-extension://") + browseros::kAgentExtensionId;
}

base::RepeatingClosure& QuickWindowCloser() {
  static base::NoDestructor<base::RepeatingClosure> closer;
  return *closer;
}

}  // namespace

GURL AgentChatUrl(const std::string& prompt, std::optional<int> context_tab_id) {
  std::string text(base::TrimWhitespaceASCII(prompt, base::TRIM_ALL));
  if (text.size() > kMaxPromptLength) {
    text.resize(kMaxPromptLength);
  }
  // Parameter order and names are the new tab's (AgentCommandHome.tsx): q, mode, tabs. `mode=agent`
  // because both native entrances exist to hand the browser to the agent, not to chat about a page.
  std::string query = "q=" + base::EscapeQueryParamValue(text, /*use_plus=*/true) + "&mode=agent";
  if (context_tab_id.has_value() && *context_tab_id > 0) {
    query += "&tabs=" + base::NumberToString(*context_tab_id);
  }
  return GURL(AgentOrigin() + kAgentPage + kChatRoute + query);
}

GURL QuickWindowUrl() {
  return GURL(AgentOrigin() + kAgentPage + kQuickRoute);
}

void OpenAgentChat(Profile* profile,
                   const std::string& prompt,
                   std::optional<int> context_tab_id) {
  if (!profile || profile->IsOffTheRecord()) {
    return;
  }
  if (base::TrimWhitespaceASCII(prompt, base::TRIM_ALL).empty()) {
    return;
  }

  // Profile-only NavigateParams: Navigate() picks the profile's last active tabbed window and makes
  // one when there is none. That second case is the quick window's normal one -- the hotkey works
  // with every window closed, and the answer to "where does the task go" is then a new window.
  NavigateParams params(profile, AgentChatUrl(prompt, context_tab_id),
                        ui::PAGE_TRANSITION_AUTO_TOPLEVEL);
  params.disposition = WindowOpenDisposition::NEW_FOREGROUND_TAB;
  params.window_action = NavigateParams::WindowAction::kShowWindow;
  Navigate(&params);

  // Brought to the front explicitly. From the quick window the browser is NOT the active app -- the
  // person pressed a global shortcut over something else -- and a task that opened behind it would
  // look like nothing happened.
  if (BrowserWindowInterface* browser = params.browser) {
    if (ui::BaseWindow* window = browser->GetWindow()) {
      window->Activate();
    }
  }
}

void SetQuickWindowCloser(base::RepeatingClosure closer) {
  QuickWindowCloser() = std::move(closer);
}

void ClearQuickWindowCloser() {
  QuickWindowCloser().Reset();
}

void CloseQuickWindow() {
  // Copied before running: closing the window clears the registration from inside the call.
  base::RepeatingClosure closer = QuickWindowCloser();
  if (closer) {
    closer.Run();
  }
}

}  // namespace redrob
