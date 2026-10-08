// Copyright 2026 Janghoon Lee (Redrob)
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "components/omnibox/browser/actions/redrob_agent_action.h"

#include <utility>

#include "components/omnibox/browser/actions/omnibox_action_concepts.h"

RedrobAgentAction::RedrobAgentAction(std::u16string prompt)
    : OmniboxAction(OmniboxAction::LabelStrings(), GURL()),
      prompt_(std::move(prompt)) {}

RedrobAgentAction::~RedrobAgentAction() = default;

OmniboxActionId RedrobAgentAction::ActionId() const {
  return OmniboxActionId::REDROB_AGENT;
}

void RedrobAgentAction::Execute(ExecutionContext& context) const {
  // Everything that needs a Profile -- the task store, the active tab, the permission mode --
  // happens on the other side of this call. That is the point of routing through the client:
  // this file stays in components and still reaches a chrome-level capability.
  //
  // `open_url_callback_` is deliberately NOT invoked. Calling it would navigate, and the
  // whole row exists to not do that.
  context.client_->StartRedrobAgentTask(prompt_);
}
