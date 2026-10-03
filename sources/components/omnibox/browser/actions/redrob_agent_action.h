// Copyright 2026 Janghoon Lee (Redrob)
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef COMPONENTS_OMNIBOX_BROWSER_ACTIONS_REDROB_AGENT_ACTION_H_
#define COMPONENTS_OMNIBOX_BROWSER_ACTIONS_REDROB_AGENT_ACTION_H_

#include <string>

#include "components/omnibox/browser/actions/omnibox_action.h"

// What the address bar's agent row does when chosen: start a task, navigate nowhere.
//
// A `takeover_action` rather than a navigation because the row has no destination. The
// omnibox opens `destination_url` for any match that has one, whatever else is attached, so
// the empty URL is not an oversight -- it is what forces every activation path through
// `Execute`.
//
// WHY THIS LIVES IN components/omnibox AND NOT chrome/browser, which the first version of
// this got wrong and could not have linked. The provider is constructed inside
// `AutocompleteController`, in components, and components cannot depend on chrome -- so an
// action holding a `Profile*` is unbuildable there however it is written. Upstream already
// has the seam for this: `OmniboxAction::Client`, reached as `context.client_`, is the
// interface components declares and chrome implements. One method is added to it and
// `ChromeAutocompleteProviderClient`, which holds the Profile, implements it.
//
// The TAB CONTEXT is therefore assembled on the chrome side, when the row is chosen, not in
// the provider. The provider runs on every keystroke; reading the active tab there would
// walk the tab model dozens of times while someone types a sentence.
class RedrobAgentAction : public OmniboxAction {
 public:
  explicit RedrobAgentAction(std::u16string prompt);

  RedrobAgentAction(const RedrobAgentAction&) = delete;
  RedrobAgentAction& operator=(const RedrobAgentAction&) = delete;

  // OmniboxAction:
  void Execute(ExecutionContext& context) const override;
  OmniboxActionId ActionId() const override;

 private:
  ~RedrobAgentAction() override;

  std::u16string prompt_;
};

#endif  // COMPONENTS_OMNIBOX_BROWSER_ACTIONS_REDROB_AGENT_ACTION_H_
