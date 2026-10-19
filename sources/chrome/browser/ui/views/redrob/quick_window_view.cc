// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/views/redrob/quick_window_view.h"

#include <utility>

#include "chrome/browser/profiles/profile.h"
#include "components/input/native_web_keyboard_event.h"
#include "third_party/blink/public/common/input/web_input_event.h"
#include "ui/base/metadata/metadata_impl_macros.h"
#include "ui/events/keycodes/keyboard_codes.h"

namespace redrob {

QuickWindowView::QuickWindowView(Profile* profile, base::RepeatingClosure close)
    : views::WebView(profile), close_(std::move(close)) {}

QuickWindowView::~QuickWindowView() = default;

bool QuickWindowView::HandleKeyboardEvent(content::WebContents* source,
                                          const input::NativeWebKeyboardEvent& event) {
  // Only what the page did NOT consume reaches here, so a page that uses ESC itself (to clear its
  // input first, say) keeps that behaviour and the window closes on the next press.
  if (event.GetType() == blink::WebInputEvent::Type::kRawKeyDown &&
      event.windows_key_code == ui::VKEY_ESCAPE) {
    close_.Run();
    return true;
  }
  return views::WebView::HandleKeyboardEvent(source, event);
}

void QuickWindowView::CloseContents(content::WebContents* source) {
  close_.Run();
}

BEGIN_METADATA(QuickWindowView)
END_METADATA

}  // namespace redrob
