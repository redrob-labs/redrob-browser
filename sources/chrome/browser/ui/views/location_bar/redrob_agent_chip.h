// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_VIEWS_LOCATION_BAR_REDROB_AGENT_CHIP_H_
#define CHROME_BROWSER_UI_VIEWS_LOCATION_BAR_REDROB_AGENT_CHIP_H_

#include <string>

#include "ui/base/metadata/metadata_header_macros.h"
#include "ui/views/controls/label.h"

// The "Redrob" chip at the left of the address bar while it is in agent mode (CAP-3).
//
// Agent mode is the line starting with "> " (see components/omnibox/browser/redrob_agent_provider.h).
// A punctuation mark is not a visible mode, so while it holds the location bar puts this chip where
// the page icon normally sits: the person can see that Enter will hand the line to the agent rather
// than search for it.
//
// FOUND, NOT HELD. LocationBarView owns this as an ordinary child, and its layout looks the chip up
// with `FindIn` instead of keeping a member. A member would put a line of ours in
// location_bar_view.h, a second upstream file to carry through every uprev, for one pointer.
class RedrobAgentChip : public views::Label {
  METADATA_HEADER(RedrobAgentChip, views::Label)

 public:
  RedrobAgentChip();
  RedrobAgentChip(const RedrobAgentChip&) = delete;
  RedrobAgentChip& operator=(const RedrobAgentChip&) = delete;
  ~RedrobAgentChip() override;

  // Adds a hidden chip to `location_bar`. Called once, from LocationBarView::Init.
  static RedrobAgentChip* Install(views::View* location_bar);

  // The chip `Install` added to `location_bar`, or nullptr.
  static RedrobAgentChip* FindIn(views::View* location_bar);

  // Whether the address bar's current text is in agent mode -- the one test the chip, the provider
  // and the Tab handler all share.
  static bool IsAgentMode(const std::u16string& omnibox_text);
};

#endif  // CHROME_BROWSER_UI_VIEWS_LOCATION_BAR_REDROB_AGENT_CHIP_H_
