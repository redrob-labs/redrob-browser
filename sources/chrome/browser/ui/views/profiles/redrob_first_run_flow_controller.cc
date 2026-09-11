// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/views/profiles/redrob_first_run_flow_controller.h"

#include <memory>
#include <utility>

#include "base/functional/bind.h"
#include "chrome/browser/ui/views/profiles/profile_management_step_controller.h"
#include "chrome/browser/ui/views/profiles/profile_picker_web_contents_host.h"
#include "chrome/browser/ui/webui/redrob_onboarding/redrob_onboarding_ui.h"
#include "chrome/common/webui_url_constants.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "url/gurl.h"

namespace {

// Shows the onboarding page and, once it is loaded, hands it the closure that ends the flow.
//
// The two halves cannot be one step: the page has to exist before there is a controller to install a
// callback on, so this waits for the load rather than assuming it.
class RedrobOnboardingStepController : public ProfileManagementStepController {
 public:
  RedrobOnboardingStepController(ProfilePickerWebContentsHost* host,
                                base::RepeatingClosure complete_callback)
      : ProfileManagementStepController(host),
        url_(chrome::kChromeUIRedrobOnboardingURL),
        complete_callback_(std::move(complete_callback)) {}

  ~RedrobOnboardingStepController() override = default;

  void Show(StepSwitchFinishedCallback step_shown_callback, bool reset_state) override {
    if (reset_state) {
      host()->ShowScreenInPickerContents(
          url_, base::BindOnce(&RedrobOnboardingStepController::OnLoaded,
                               weak_factory_.GetWeakPtr(), std::move(step_shown_callback)));
      return;
    }
    // Returning to a step already loaded in the picker contents. Re-navigating would restart the flow
    // at its first slide and lose the choices the user already made.
    host()->ShowScreenInPickerContents(
        GURL(), base::BindOnce(std::move(step_shown_callback.value()), true));
  }

  void OnHidden() override {}

 private:
  void OnLoaded(StepSwitchFinishedCallback step_shown_callback) {
    std::move(step_shown_callback.value()).Run(/*success=*/true);

    auto* onboarding_ui = host()
                              ->GetPickerContents()
                              ->GetWebUI()
                              ->GetController()
                              ->GetAs<redrob::RedrobOnboardingUI>();
    CHECK(onboarding_ui);
    onboarding_ui->SetCompleteCallback(complete_callback_);
  }

  const GURL url_;
  base::RepeatingClosure complete_callback_;
  base::WeakPtrFactory<RedrobOnboardingStepController> weak_factory_{this};
};

}  // namespace

RedrobFirstRunFlowController::RedrobFirstRunFlowController(
    ProfilePickerWebContentsHost* host,
    ClearHostClosure clear_host_callback,
    Profile* profile,
    ProfilePicker::FirstRunExitedCallback first_run_exited_callback)
    : FirstRunFlowController(host,
                             std::move(clear_host_callback),
                             profile,
                             std::move(first_run_exited_callback)),
      onboarding_profile_(profile) {}

RedrobFirstRunFlowController::~RedrobFirstRunFlowController() = default;

void RedrobFirstRunFlowController::Init() {
  // Registered as the intro step, which is the slot upstream's own completion path already knows how
  // to finish from. Using a different key would mean teaching that path about a step it has no reason
  // to know exists.
  RegisterStep(Step::kIntro,
               std::make_unique<RedrobOnboardingStepController>(
                   host(), base::BindRepeating(
                               &RedrobFirstRunFlowController::OnOnboardingComplete,
                               weak_factory_.GetWeakPtr())));
  SwitchToStep(Step::kIntro, /*reset_state=*/true);
}

void RedrobFirstRunFlowController::OnOnboardingComplete() {
  // Hands back to upstream, which marks first run finished, tears this window down and opens the
  // browser. Doing any of that here would be duplicating a sequence that already works.
  HandleIdentityStepsCompleted(onboarding_profile_, PostHostClearedCallback(),
                               /*is_continue_callback=*/false);
}
