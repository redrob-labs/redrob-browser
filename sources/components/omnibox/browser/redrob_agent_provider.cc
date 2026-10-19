// Copyright 2026 Janghoon Lee (Redrob)
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "components/omnibox/browser/redrob_agent_provider.h"

#include <string>
#include <utility>

#include "base/memory/scoped_refptr.h"
#include "components/omnibox/browser/actions/redrob_agent_action.h"
#include "components/omnibox/browser/autocomplete_input.h"
#include "components/omnibox/browser/autocomplete_match.h"
#include "components/omnibox/browser/autocomplete_match_type.h"
#include "components/strings/grit/components_strings.h"
#include "third_party/metrics_proto/omnibox_focus_type.pb.h"
#include "ui/base/l10n/l10n_util.h"

namespace {

// Trimmed, because the omnibox hands over what the user typed including the spaces, and a
// prompt of four spaces is not a prompt.
std::u16string Trim(const std::u16string& text) {
  const size_t first = text.find_first_not_of(u" \t\n\r");
  if (first == std::u16string::npos) {
    return std::u16string();
  }
  const size_t last = text.find_last_not_of(u" \t\n\r");
  return text.substr(first, last - first + 1);
}

}  // namespace

// static
bool RedrobAgentProvider::WantsAgentRow(const std::u16string& text,
                                        bool from_omnibox_focus) {
  // Nothing typed yet. The zero-suggest list is the user's own history and most-visited
  // sites; an agent row there would be an advertisement in a space that belongs to them.
  if (from_omnibox_focus) {
    return false;
  }

  const std::u16string trimmed = Trim(text);
  if (trimmed.length() < kMinimumInputLength) {
    return false;
  }

  // A single token with no space is a hostname, a bookmark title, or a search term being
  // typed -- not a request. Requiring one space is a crude test and a deliberate one: the
  // alternative is a row that appears on the way to every URL the user has ever visited.
  return trimmed.find(u' ') != std::u16string::npos;
}

// static
bool RedrobAgentProvider::IsAgentModeText(const std::u16string& text) {
  const size_t first = text.find_first_not_of(u" \t");
  if (first == std::u16string::npos || text[first] != u'>') {
    return false;
  }
  // `>` alone is not yet the mode: the space is what says "I am done typing the marker". Without
  // it a URL fragment or a quoted line beginning with `>` would flip the address bar mid-word.
  return first + 1 < text.size() &&
         (text[first + 1] == u' ' || text[first + 1] == u'\t');
}

// static
std::u16string RedrobAgentProvider::AgentModePrompt(const std::u16string& text) {
  if (!IsAgentModeText(text)) {
    return std::u16string();
  }
  return Trim(text.substr(text.find(u'>') + 1));
}

// static
std::u16string RedrobAgentProvider::ToAgentModeText(const std::u16string& text) {
  if (IsAgentModeText(text)) {
    return text;
  }
  return std::u16string(kAgentModePrefix) + Trim(text);
}

RedrobAgentProvider::RedrobAgentProvider()
    : AutocompleteProvider(AutocompleteProvider::TYPE_REDROB_AGENT) {}

RedrobAgentProvider::~RedrobAgentProvider() = default;

void RedrobAgentProvider::Start(const AutocompleteInput& input,
                                bool minimal_changes) {
  // `minimal_changes` means the text is unchanged and only the selection or a modifier
  // moved. This provider's output depends on nothing but the text, so there is no work to
  // redo -- and clearing `matches_` here would make the row flicker on every keystroke that
  // does not change the string.
  if (minimal_changes && !matches_.empty()) {
    return;
  }

  matches_.clear();

  const bool from_focus =
      input.focus_type() != metrics::OmniboxFocusType::INTERACTION_DEFAULT;

  // Agent mode: the person asked for the agent, so the row is offered as the default and Enter
  // starts the task. An empty request after the marker still gets no row -- Enter on "> " must not
  // open an empty conversation.
  if (!from_focus && IsAgentModeText(input.text())) {
    const std::u16string agent_prompt = AgentModePrompt(input.text());
    if (agent_prompt.empty()) {
      return;
    }
    AutocompleteMatch match(this, kAgentModeRelevance, /*deletable=*/false,
                            AutocompleteMatchType::NAVSUGGEST_PERSONALIZED);
    match.allowed_to_be_default_match = true;
    // The edit keeps exactly what was typed, marker included. A default match whose fill text
    // differed from the input would rewrite the line under the caret on every keystroke.
    match.fill_into_edit = input.text();
    match.destination_url = GURL();
    match.contents = agent_prompt;
    match.contents_class.push_back(
        ACMatchClassification(0, ACMatchClassification::NONE));
    match.description = l10n_util::GetStringUTF16(IDS_OMNIBOX_REDROB_ASK_AGENT);
    match.description_class.push_back(
        ACMatchClassification(0, ACMatchClassification::DIM));
    match.takeover_action = base::MakeRefCounted<RedrobAgentAction>(agent_prompt);
    matches_.push_back(std::move(match));
    return;
  }

  if (!WantsAgentRow(input.text(), from_focus)) {
    return;
  }

  const std::u16string prompt = Trim(input.text());

  AutocompleteMatch match(this, kRelevance, /*deletable=*/false,
                          AutocompleteMatchType::NAVSUGGEST_PERSONALIZED);

  // Never the default match. Enter must navigate to what the user typed; this row has to be
  // chosen deliberately, with an arrow key or the mouse.
  match.allowed_to_be_default_match = false;

  // What the omnibox puts in the text field when the row is highlighted: the user's own
  // words, unchanged. Rewriting it would edit what they typed while they are looking at it.
  match.fill_into_edit = prompt;

  // Deliberately EMPTY. A non-empty destination makes this a navigation, and the omnibox
  // will open it on Enter whatever the action says. The empty URL is what forces every path
  // through `takeover_action`.
  match.destination_url = GURL();

  match.contents = prompt;
  match.contents_class.push_back(
      ACMatchClassification(0, ACMatchClassification::NONE));

  // The row's own label says what will happen, because the match type does not. The omnibox
  // decides icons and trailing text from the type, and no type means "hand this to the
  // agent" -- so the description carries it.
  match.description = l10n_util::GetStringUTF16(IDS_OMNIBOX_REDROB_ASK_AGENT);
  match.description_class.push_back(
      ACMatchClassification(0, ACMatchClassification::DIM));

  // No `keyword` and no `search_terms_args`. Setting either attributes the row to a search
  // engine, which is what would make it a search in the user's eyes and in the metrics.
  match.takeover_action = base::MakeRefCounted<RedrobAgentAction>(prompt);

  matches_.push_back(std::move(match));
}
