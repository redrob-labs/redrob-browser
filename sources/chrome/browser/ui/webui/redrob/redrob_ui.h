// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_WEBUI_REDROB_REDROB_UI_H_
#define CHROME_BROWSER_UI_WEBUI_REDROB_REDROB_UI_H_

#include "chrome/common/webui_url_constants.h"
#include "content/public/browser/web_ui_controller.h"
#include "content/public/browser/webui_config.h"

namespace redrob {

class RedrobUI;

// chrome://redrob. See docs/AI_SURFACE.md: this page is the AI surface, and it is web technology
// precisely so that the AI product does not live in C++ and does not move at Chromium's release pace.
class RedrobUIConfig : public content::DefaultWebUIConfig<RedrobUI> {
 public:
  RedrobUIConfig()
      : DefaultWebUIConfig(content::kChromeUIScheme, chrome::kChromeUIRedrobHost) {}
};

// The scaffold stage. The page is served from string literals through a request filter rather than
// from a .grd resource pack, which keeps the GN surface to one source_set while the page is still
// small. When the composer grows a TypeScript build -- and it will, this is the layer the product
// lives in -- the move is to a resource pack plus `AddResourcePaths`, and this class keeps its shape.
//
// There is deliberately no Mojo interface yet. `TaskHost` is specified in docs/AI_SURFACE.md and
// arrives with the sidecar client; a scaffold that could already start a task would be a scaffold
// that had to answer for model routing, credentials and the policy gate before any of them exist.
class RedrobUI : public content::WebUIController {
 public:
  explicit RedrobUI(content::WebUI* web_ui);

  RedrobUI(const RedrobUI&) = delete;
  RedrobUI& operator=(const RedrobUI&) = delete;

  ~RedrobUI() override;
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_WEBUI_REDROB_REDROB_UI_H_
