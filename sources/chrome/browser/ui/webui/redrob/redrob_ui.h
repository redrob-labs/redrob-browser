// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_WEBUI_REDROB_REDROB_UI_H_
#define CHROME_BROWSER_UI_WEBUI_REDROB_REDROB_UI_H_

#include <memory>

#include "chrome/browser/ui/webui/redrob/redrob.mojom.h"
#include "chrome/common/webui_url_constants.h"
#include "content/public/browser/webui_config.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "ui/webui/mojo_web_ui_controller.h"

namespace redrob {

class RedrobUI;
class TaskHostImpl;

// chrome://redrob. See docs/AI_SURFACE.md: the AI surface is web technology precisely so the product
// does not live in C++ and does not move at Chromium's release pace.
class RedrobUIConfig : public content::DefaultWebUIConfig<RedrobUI> {
 public:
  RedrobUIConfig()
      : DefaultWebUIConfig(content::kChromeUIScheme, chrome::kChromeUIRedrobHost) {}
};

class RedrobUI : public ui::MojoWebUIController, public mojom::PageHandlerFactory {
 public:
  explicit RedrobUI(content::WebUI* web_ui);

  RedrobUI(const RedrobUI&) = delete;
  RedrobUI& operator=(const RedrobUI&) = delete;

  ~RedrobUI() override;

  void BindInterface(mojo::PendingReceiver<mojom::PageHandlerFactory> receiver);

 private:
  // mojom::PageHandlerFactory
  void CreateTaskHost(mojo::PendingRemote<mojom::Page> page,
                      mojo::PendingReceiver<mojom::TaskHost> host) override;

  std::unique_ptr<TaskHostImpl> task_host_;
  mojo::Receiver<mojom::PageHandlerFactory> factory_receiver_{this};

  WEB_UI_CONTROLLER_TYPE_DECL();
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_WEBUI_REDROB_REDROB_UI_H_
