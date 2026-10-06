// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/views/profiles/redrob_first_run_flow_controller.h"

#include <memory>
#include <utility>

#include "base/functional/bind.h"
#include "base/task/single_thread_task_runner.h"
#include "chrome/browser/ui/views/profiles/profile_picker_web_contents_host.h"

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
  // No intro screen of our own. It used to be the old component extension's onboarding page, which is gone;
  // the agent's onboarding (chrome://redrob-onboarding) runs on first launch of the browser itself. So the
  // flow ends straight away through upstream's own completion path, which marks first run finished and
  // opens the browser. Posted rather than called, so Init() returns to the host before the host is torn
  // down by the completion path.
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(&RedrobFirstRunFlowController::OnOnboardingComplete,
                                weak_factory_.GetWeakPtr()));

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
