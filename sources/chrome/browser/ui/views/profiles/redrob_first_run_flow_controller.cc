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

  // Upstream puts a circled pause button in the picker's native toolbar -- EffectsControlButton, added by
  // FirstRunFlowController whenever the desktop-revamp switch is on, bound to ToggleMediaEffects. Its job
  // is to stop the Lottie animations on Chrome's sign-in promo. This flow never shows that promo, so the
  // button is a control for animations that do not exist, sitting in the corner of the first screen anyone
  // ever sees in this product.
  //
  // Hidden rather than patched away: the host already exposes this exact toggle, so the same reasoning
  // that keeps the post-identity steps registered-but-unqueued applies -- leave upstream's wiring intact
  // and take the furniture off the screen.
  host()->SetNativeToolbarEffectsControlButtonVisible(false);
}

void RedrobFirstRunFlowController::OnOnboardingComplete() {
  // Hands back to upstream, which marks first run finished, tears this window down and opens the
  // browser. Doing any of that here would be duplicating a sequence that already works.
  HandleIdentityStepsCompleted(onboarding_profile_, PostHostClearedCallback(),
                               /*is_continue_callback=*/false);
}

// Upstream's promo carousel does not run in this product.
//
// What it was: after our own six onboarding steps finished, the first-run window continued into Chrome's
// "feature showcase" -- a Gemini step, a Google Lens step, a Password Manager step offering to "add the
// shortcut to the toolbar", a theme picker headed "Make Redrob yours", then an "all set" screen. Three
// separate problems, any one of which is disqualifying:
//
//   1. It advertises Google features this browser does not ship, with Google's own branding, immediately
//      after an onboarding that explains what this browser actually does.
//   2. It offers to pin things to a TOOLBAR. This product has no toolbar -- the address row carries
//      navigation only and there is no app menu -- so the button could not have worked.
//   3. Its strings come from the Chromium-branded variants, which Google never translates. So a flow whose
//      first six steps are fully Korean continued in English: "Built into Redrob to help you create, save,
//      and autofill strong passwords."
//
// Done by FILTERING THE QUEUE rather than by not registering the steps. The base class builds them and wires
// their completion callbacks into its own bookkeeping in the same function; skipping registration would mean
// reimplementing that wiring, and `finish_flow_callback_` -- which the finish step needs -- is private to it.
// A registered step that is never queued is never shown, and the completion path we DO want, kFinishFlow,
// keeps the callback the base class gave it.
//
// kSearchEngineChoice is deliberately KEPT. It is not a promo: it is the choice screen shown to users in the
// regions that require one, and suppressing it would be a regulatory decision rather than a design one.
base::queue<ProfileManagementFlowController::Step>
RedrobFirstRunFlowController::RegisterPostIdentitySteps(
    PostHostClearedCallback post_host_cleared_callback) {
  base::queue<ProfileManagementFlowController::Step> upstream_steps =
      FirstRunFlowController::RegisterPostIdentitySteps(
          std::move(post_host_cleared_callback));

  base::queue<ProfileManagementFlowController::Step> steps;
  while (!upstream_steps.empty()) {
    const ProfileManagementFlowController::Step step = upstream_steps.front();
    upstream_steps.pop();
    switch (step) {
      case ProfileManagementFlowController::Step::kFeatureShowcase:
      case ProfileManagementFlowController::Step::kFinishOrContinue:
      // kDefaultBrowser is the step upstream shows INSTEAD of the showcase when its revamp flag is off.
      // Dropped as well, so this flow does not depend on which side of that flag the build lands on --
      // otherwise flipping a Chromium feature flag would silently put a promo back after our onboarding.
      case ProfileManagementFlowController::Step::kDefaultBrowser:
        continue;
      default:
        steps.push(step);
        break;
    }
  }
  return steps;
}
