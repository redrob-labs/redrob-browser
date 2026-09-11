// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/webui/redrob_onboarding/redrob_onboarding_ui.h"

#include <utility>

#include "base/functional/bind.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/webui/redrob_onboarding/onboarding_host_impl.h"
#include "chrome/grit/redrob_onboarding_resources.h"
#include "chrome/grit/redrob_onboarding_resources_map.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "ui/webui/webui_util.h"

namespace redrob {

RedrobOnboardingUI::RedrobOnboardingUI(content::WebUI* web_ui)
    : ui::MojoWebUIController(web_ui, /*enable_chrome_send=*/false) {
  content::WebUIDataSource* source = content::WebUIDataSource::CreateAndAdd(
      web_ui->GetWebContents()->GetBrowserContext(), chrome::kChromeUIRedrobOnboardingHost);
  webui::SetupWebUIDataSource(source, kRedrobOnboardingResources,
                              IDR_REDROB_ONBOARDING_REDROB_ONBOARDING_HTML);
}

RedrobOnboardingUI::~RedrobOnboardingUI() = default;

void RedrobOnboardingUI::BindInterface(
    mojo::PendingReceiver<onboarding::mojom::PageHandlerFactory> receiver) {
  factory_receiver_.reset();
  factory_receiver_.Bind(std::move(receiver));
}

void RedrobOnboardingUI::CreateOnboardingHost(
    mojo::PendingReceiver<onboarding::mojom::OnboardingHost> host,
    mojo::PendingRemote<onboarding::mojom::Page> page) {
  onboarding_host_ = std::make_unique<OnboardingHostImpl>(
      std::move(host), std::move(page), Profile::FromWebUI(web_ui()),
      base::BindRepeating(&RedrobOnboardingUI::OnComplete, weak_factory_.GetWeakPtr()));
}

void RedrobOnboardingUI::SetCompleteCallback(base::RepeatingClosure callback) {
  complete_callback_ = std::move(callback);
}

void RedrobOnboardingUI::OnComplete() {
  // Empty when this page was opened outside the first-run flow -- by typing its host, say. Doing
  // nothing is correct there: there is no flow to finish, and no window of ours to close.
  if (complete_callback_) {
    complete_callback_.Run();
  }
}

WEB_UI_CONTROLLER_TYPE_IMPL(RedrobOnboardingUI)

}  // namespace redrob
