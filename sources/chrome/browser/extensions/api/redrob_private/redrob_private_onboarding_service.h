// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_ONBOARDING_SERVICE_H_
#define CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_ONBOARDING_SERVICE_H_

#include "base/functional/callback.h"
#include "components/keyed_service/core/keyed_service.h"

namespace extensions {

// The seam between the extension onboarding page and the browser's first-run
// window. First run registers a completion callback here; the page calls
// redrobPrivate.completeOnboarding when the flow is done, which fires it.
//
// It exists because the two live in different worlds: the completion logic
// (mark first run finished, tear the window down, open the browser) belongs to
// the first-run flow controller and cannot be done from a renderer, while the
// signal that the flow is over comes from the extension page. This service is
// the one object both can reach — keyed to the profile, so the callback the
// window installed is the one the page's call fires.
//
// When onboarding is opened as an ordinary tab there is no first-run window and
// so no callback is registered; completeOnboarding then does nothing, which is
// correct — there is no flow to end.
class RedrobPrivateOnboardingService : public KeyedService {
 public:
  RedrobPrivateOnboardingService();

  RedrobPrivateOnboardingService(const RedrobPrivateOnboardingService&) =
      delete;
  RedrobPrivateOnboardingService& operator=(
      const RedrobPrivateOnboardingService&) = delete;

  ~RedrobPrivateOnboardingService() override;

  // First run installs the closure that ends it. Replaces any previous one, so
  // a re-entered flow does not stack callbacks.
  void SetCompleteCallback(base::OnceClosure callback);

  // The page calls completeOnboarding; this runs the installed closure once.
  // A no-op when none was installed (onboarding opened as a tab).
  void Complete();

 private:
  base::OnceClosure complete_callback_;
};

}  // namespace extensions

#endif  // CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_ONBOARDING_SERVICE_H_
