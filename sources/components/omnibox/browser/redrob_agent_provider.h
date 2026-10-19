// Copyright 2026 Janghoon Lee (Redrob)
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef COMPONENTS_OMNIBOX_BROWSER_REDROB_AGENT_PROVIDER_H_
#define COMPONENTS_OMNIBOX_BROWSER_REDROB_AGENT_PROVIDER_H_

#include <string>

#include "components/omnibox/browser/autocomplete_provider.h"

class AutocompleteInput;

// Offers the address bar's text to the agent, as a row that is visibly not a search.
//
// WHY THIS IS NATIVE AND NOT AN EXTENSION. `chrome.omnibox` only fires after the user types
// a registered KEYWORD and a space -- that is the search-keyword mechanism itself. A row
// reached by typing a keyword IS a search, by construction, so the extension API cannot
// satisfy "visibly not a search" no matter how the row is worded.
//
// WHAT MAKES THE ROW NOT A SEARCH, concretely, since the phrase is otherwise taste:
//
//   - It is the only row whose destination is not a URL to fetch. Activating it starts a
//     task; nothing navigates, and `open_url_callback_` is never called.
//   - It carries no `search_terms_args` and no `keyword`, so it is not attributed to a
//     search engine and the omnibox's own machinery cannot turn it into a query.
//   - Its match type is NAVSUGGEST_PERSONALIZED rather than a SEARCH_* type, which is what
//     decides the leading icon and the trailing "Search <engine>" text. A SEARCH_* type
//     would have the omnibox label our row as a search for us.
//
// ORDERING. The relevance sits below the default match's, and
// `allowed_to_be_default_match` is false. A row that outranked the user's own typed URL
// would make Enter start a task when they meant to navigate -- the one mistake this must
// never make. The row has to be chosen, never landed on.
//
// NO Profile HERE. This is constructed inside `AutocompleteController`, in components, which
// cannot depend on chrome. Everything profile-shaped happens through
// `OmniboxAction::Client`, which components declares and chrome implements.
class RedrobAgentProvider : public AutocompleteProvider {
 public:
  // Scored just under the inline-autocomplete band so the row is always reachable and never
  // preferred. Named rather than inlined because this number is the whole ordering policy.
  static constexpr int kRelevance = 900;

  // Shorter than this and the row fires on a half-typed hostname, which is noise in the one
  // place a user types fastest.
  static constexpr size_t kMinimumInputLength = 4;

  RedrobAgentProvider();

  RedrobAgentProvider(const RedrobAgentProvider&) = delete;
  RedrobAgentProvider& operator=(const RedrobAgentProvider&) = delete;

  // AutocompleteProvider:
  void Start(const AutocompleteInput& input, bool minimal_changes) override;

  // Whether this input should get an agent row at all. Static and pure so the policy is
  // testable with no omnibox, no profile and no browser.
  static bool WantsAgentRow(const std::u16string& text, bool from_omnibox_focus);

  // AGENT MODE (CAP-3). The suggestion row above is reachable and never preferred. Agent mode
  // is the other half: the person has SAID they are talking to the agent, by starting the line
  // with `>` and a space (or by pressing Tab on the row, which writes that prefix for them).
  // In agent mode the row IS the default match, so Enter starts the task -- the one case where
  // that is what Enter must do -- and the location bar shows a "Redrob" chip so the mode is
  // visible rather than inferred from a punctuation mark.
  //
  // The prefix is the mode, and it lives in the text on purpose. Keyword mode keeps its state
  // in the edit model and needs a search-engine entry to hang it on; a mode that is just the
  // first two characters needs neither, survives a tab switch with the text, and is undone by
  // the same Backspace that undoes any other typing.
  static constexpr char16_t kAgentModePrefix[] = u"> ";

  // Above every typed-URL and what-you-typed score, so the default is ours whenever the person
  // asked for agent mode -- and only then.
  static constexpr int kAgentModeRelevance = 1600;

  // True when `text` is in agent mode: `>` followed by whitespace, after any leading spaces.
  static bool IsAgentModeText(const std::u16string& text);
  // The request inside agent-mode text, trimmed; empty when `text` is not in agent mode.
  static std::u16string AgentModePrompt(const std::u16string& text);
  // `text` with the agent-mode prefix in front, for Tab on the row. Text already in agent mode
  // is returned unchanged.
  static std::u16string ToAgentModeText(const std::u16string& text);

 private:
  ~RedrobAgentProvider() override;
};

#endif  // COMPONENTS_OMNIBOX_BROWSER_REDROB_AGENT_PROVIDER_H_
