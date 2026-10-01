// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_onboarding_service.h"

#include <utility>

namespace extensions {

RedrobPrivateOnboardingService::RedrobPrivateOnboardingService() = default;

RedrobPrivateOnboardingService::~RedrobPrivateOnboardingService() = default;

void RedrobPrivateOnboardingService::SetCompleteCallback(
    base::OnceClosure callback) {
  complete_callback_ = std::move(callback);
}

void RedrobPrivateOnboardingService::Complete() {
  if (complete_callback_) {
    std::move(complete_callback_).Run();
  }
}

}  // namespace extensions
