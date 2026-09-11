// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_WEBUI_REDROB_SETTINGS_REDROB_SETTINGS_UI_H_
#define CHROME_BROWSER_UI_WEBUI_REDROB_SETTINGS_REDROB_SETTINGS_UI_H_

#include <memory>

#include "chrome/browser/ui/webui/redrob_settings/redrob_settings.mojom.h"
#include "chrome/common/webui_url_constants.h"
#include "content/public/browser/webui_config.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "ui/webui/mojo_web_ui_controller.h"

namespace redrob {

class RedrobSettingsUI;
class SettingsHostImpl;

// chrome://redrob-settings. The product's own settings, in the product's own language, next to
// upstream's chrome://settings rather than inside it -- everything on these four pages is ours, and
// nothing on them needs upstream's router to know it exists.
class RedrobSettingsUIConfig : public content::DefaultWebUIConfig<RedrobSettingsUI> {
 public:
  RedrobSettingsUIConfig()
      : DefaultWebUIConfig(content::kChromeUIScheme, chrome::kChromeUIRedrobSettingsHost) {}
};

class RedrobSettingsUI : public ui::MojoWebUIController,
                         public settings::mojom::PageHandlerFactory {
 public:
  explicit RedrobSettingsUI(content::WebUI* web_ui);

  RedrobSettingsUI(const RedrobSettingsUI&) = delete;
  RedrobSettingsUI& operator=(const RedrobSettingsUI&) = delete;

  ~RedrobSettingsUI() override;

  void BindInterface(mojo::PendingReceiver<settings::mojom::PageHandlerFactory> receiver);

 private:
  // settings::mojom::PageHandlerFactory
  void CreateSettingsHost(
      mojo::PendingReceiver<settings::mojom::SettingsHost> host) override;

  std::unique_ptr<SettingsHostImpl> settings_host_;
  mojo::Receiver<settings::mojom::PageHandlerFactory> factory_receiver_{this};

  WEB_UI_CONTROLLER_TYPE_DECL();
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_WEBUI_REDROB_SETTINGS_REDROB_SETTINGS_UI_H_
