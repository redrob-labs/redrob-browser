// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_COLOR_REDROB_COLOR_MIXER_H_
#define CHROME_BROWSER_UI_COLOR_REDROB_COLOR_MIXER_H_

#include "ui/color/color_provider.h"
#include "ui/color/color_provider_key.h"

namespace redrob {

// Restates the browser-chrome colours Redrob owns, in Redrob's own palette.
//
// Registered LAST, after Chromium's own mixers and after any custom theme, so it is the final word on
// the ids it names and silent on every id it does not. That is the point: this is a brand override, not
// a theme engine, and the several hundred ids it says nothing about keep working exactly as upstream
// intends -- including their light/dark and high-contrast behaviour.
//
// Values are transcribed from @redrob-design/brand, the same token sheet the web surfaces use, so the
// sidebar and the new tab page inside it cannot drift into two different blues.
void AddRedrobColorMixer(ui::ColorProvider* provider, const ui::ColorProviderKey& key);

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_COLOR_REDROB_COLOR_MIXER_H_
