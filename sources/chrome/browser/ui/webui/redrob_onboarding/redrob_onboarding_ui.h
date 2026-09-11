// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_WEBUI_REDROB_ONBOARDING_REDROB_ONBOARDING_UI_H_
#define CHROME_BROWSER_UI_WEBUI_REDROB_ONBOARDING_REDROB_ONBOARDING_UI_H_

#include <memory>

#include "chrome/browser/ui/webui/redrob_onboarding/redrob_onboarding.mojom.h"
#include "chrome/common/webui_url_constants.h"
#include "content/public/browser/web_ui_controller.h"
#include "content/public/browser/webui_config.h"
#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "ui/webui/mojo_web_ui_controller.h"

namespace redrob {

class OnboardingHostImpl;

// The first-run flow, as a WebUI page shown in the profile picker's own window before any browser
// window exists. See docs/ONBOARDING.md for why it hangs off Chromium's existing first-run machinery
// rather than replacing it.
class RedrobOnboardingUI : public ui::MojoWebUIController,
                           public onboarding::mojom::PageHandlerFactory {
 public:
  explicit RedrobOnboardingUI(content::WebUI* web_ui);
  RedrobOnboardingUI(const RedrobOnboardingUI&) = delete;
  RedrobOnboardingUI& operator=(const RedrobOnboardingUI&) = delete;
  ~RedrobOnboardingUI() override;

  void BindInterface(
      mojo::PendingReceiver<onboarding::mojom::PageHandlerFactory> receiver);

  // Installed by the first-run step controller once this page is showing. Set AFTER the page has
  // already bound its Mojo pipe, which is why the host is given an indirection through this class
  // rather than a copy of the closure: a copy taken at bind time would always be the empty one.
  void SetCompleteCallback(base::RepeatingClosure callback);

 private:
  // onboarding::mojom::PageHandlerFactory
  void CreateOnboardingHost(
      mojo::PendingReceiver<onboarding::mojom::OnboardingHost> host,
      mojo::PendingRemote<onboarding::mojom::Page> page) override;

  void OnComplete();

  base::RepeatingClosure complete_callback_;
  std::unique_ptr<OnboardingHostImpl> onboarding_host_;
  mojo::Receiver<onboarding::mojom::PageHandlerFactory> factory_receiver_{this};

  base::WeakPtrFactory<RedrobOnboardingUI> weak_factory_{this};

  WEB_UI_CONTROLLER_TYPE_DECL();
};

class RedrobOnboardingUIConfig
    : public content::DefaultWebUIConfig<RedrobOnboardingUI> {
 public:
  RedrobOnboardingUIConfig()
      : DefaultWebUIConfig(content::kChromeUIScheme,
                           chrome::kChromeUIRedrobOnboardingHost) {}
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_WEBUI_REDROB_ONBOARDING_REDROB_ONBOARDING_UI_H_
