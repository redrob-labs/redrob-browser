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
#include "components/omnibox/resources/grit/omnibox_resources.h"
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
