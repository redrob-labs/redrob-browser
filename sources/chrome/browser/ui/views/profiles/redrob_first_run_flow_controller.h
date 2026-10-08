// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_VIEWS_PROFILES_REDROB_FIRST_RUN_FLOW_CONTROLLER_H_
#define CHROME_BROWSER_UI_VIEWS_PROFILES_REDROB_FIRST_RUN_FLOW_CONTROLLER_H_

#include "chrome/browser/ui/views/profiles/first_run_flow_controller.h"

// Redrob's first run: the agent's onboarding, without Chromium's promo steps after it.
//
// Subclasses rather than replaces. Everything after the last step --
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
  base::queue<ProfileManagementFlowController::Step> RegisterPostIdentitySteps(
      PostHostClearedCallback post_host_cleared_callback) override;
};

#endif  // CHROME_BROWSER_UI_VIEWS_PROFILES_REDROB_FIRST_RUN_FLOW_CONTROLLER_H_
