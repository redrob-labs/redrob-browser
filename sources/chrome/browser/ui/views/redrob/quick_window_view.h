// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_VIEWS_REDROB_QUICK_WINDOW_VIEW_H_
#define CHROME_BROWSER_UI_VIEWS_REDROB_QUICK_WINDOW_VIEW_H_

#include "base/functional/callback.h"
#include "ui/base/metadata/metadata_header_macros.h"
#include "ui/views/controls/webview/webview.h"

class Profile;

namespace redrob {

// The quick window's only view: the agent extension's `#/quick` page in a WebView.
//
// A WebView subclass for two delegate calls and nothing else. ESC must close the window even when the
// page has not loaded or has broken, so the key is handled here, after the page had its chance to use
// it; and a page calling window.close() must close the window rather than be ignored, which is what a
// WebContents with no owner of its own does with that call.
class QuickWindowView : public views::WebView {
  METADATA_HEADER(QuickWindowView, views::WebView)

 public:
  QuickWindowView(Profile* profile, base::RepeatingClosure close);
  QuickWindowView(const QuickWindowView&) = delete;
  QuickWindowView& operator=(const QuickWindowView&) = delete;
  ~QuickWindowView() override;

  // content::WebContentsDelegate:
  bool HandleKeyboardEvent(content::WebContents* source,
                           const input::NativeWebKeyboardEvent& event) override;
  void CloseContents(content::WebContents* source) override;

 private:
  base::RepeatingClosure close_;
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_VIEWS_REDROB_QUICK_WINDOW_VIEW_H_
