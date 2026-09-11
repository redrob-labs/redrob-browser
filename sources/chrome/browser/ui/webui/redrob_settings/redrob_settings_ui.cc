// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/webui/redrob_settings/redrob_settings_ui.h"

#include <utility>

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/webui/redrob_settings/settings_host_impl.h"
#include "chrome/grit/redrob_settings_resources.h"
#include "chrome/grit/redrob_settings_resources_map.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "ui/webui/webui_util.h"

namespace redrob {

RedrobSettingsUI::RedrobSettingsUI(content::WebUI* web_ui)
    : ui::MojoWebUIController(web_ui, /*enable_chrome_send=*/false) {
  content::WebUIDataSource* source = content::WebUIDataSource::CreateAndAdd(
      web_ui->GetWebContents()->GetBrowserContext(), chrome::kChromeUIRedrobSettingsHost);
  webui::SetupWebUIDataSource(source, kRedrobSettingsResources,
                              IDR_REDROB_SETTINGS_REDROB_SETTINGS_HTML);
}

RedrobSettingsUI::~RedrobSettingsUI() = default;

void RedrobSettingsUI::BindInterface(
    mojo::PendingReceiver<settings::mojom::PageHandlerFactory> receiver) {
  factory_receiver_.reset();
  factory_receiver_.Bind(std::move(receiver));
}

void RedrobSettingsUI::CreateSettingsHost(
    mojo::PendingReceiver<settings::mojom::SettingsHost> host) {
  settings_host_ = std::make_unique<SettingsHostImpl>(
      std::move(host), Profile::FromWebUI(web_ui()), web_ui()->GetWebContents());
}

WEB_UI_CONTROLLER_TYPE_IMPL(RedrobSettingsUI)

}  // namespace redrob
