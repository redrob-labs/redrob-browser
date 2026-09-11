// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_VIEWS_PROFILES_REDROB_FIRST_RUN_FLOW_CONTROLLER_H_
#define CHROME_BROWSER_UI_VIEWS_PROFILES_REDROB_FIRST_RUN_FLOW_CONTROLLER_H_

#include "base/memory/raw_ptr.h"
#include "chrome/browser/ui/views/profiles/first_run_flow_controller.h"

// Redrob's first run: our own onboarding page instead of Chromium's intro.
//
// Subclasses rather than replaces, and overrides Init() alone. Everything after the last step --
// PreFinishWithBrowser() reporting kCompleted, the first-run pref being written, this window being
// torn down, the browser opening -- is upstream's and is inherited unchanged. Reimplementing that
// chain would mean owning a piece of startup sequencing that has no product content in it.
class RedrobFirstRunFlowController : public FirstRunFlowController {
 public:
  RedrobFirstRunFlowController(
      ProfilePickerWebContentsHost* host,
      ClearHostClosure clear_host_callback,
      Profile* profile,
      ProfilePicker::FirstRunExitedCallback first_run_exited_callback);
  RedrobFirstRunFlowController(const RedrobFirstRunFlowController&) = delete;
  RedrobFirstRunFlowController& operator=(const RedrobFirstRunFlowController&) = delete;
  ~RedrobFirstRunFlowController() override;

  // FirstRunFlowController
  void Init() override;

 private:
  void OnOnboardingComplete();

  // Our own handle on the profile: the base class keeps its copy private, and the completion call
  // needs one.
  const raw_ptr<Profile> onboarding_profile_;

  base::WeakPtrFactory<RedrobFirstRunFlowController> weak_factory_{this};
};

#endif  // CHROME_BROWSER_UI_VIEWS_PROFILES_REDROB_FIRST_RUN_FLOW_CONTROLLER_H_
