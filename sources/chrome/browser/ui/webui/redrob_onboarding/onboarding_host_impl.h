// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_WEBUI_REDROB_ONBOARDING_ONBOARDING_HOST_IMPL_H_
#define CHROME_BROWSER_UI_WEBUI_REDROB_ONBOARDING_ONBOARDING_HOST_IMPL_H_

#include <memory>
#include <vector>

#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "chrome/browser/ui/webui/redrob_onboarding/redrob_onboarding.mojom.h"
#include "components/user_data_importer/common/importer_data_types.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

class ExternalProcessImporterHost;
class ImporterList;
class Profile;

namespace redrob {

// The browser half of the first-run flow. The page asks; this decides.
//
// Deliberately the only place that knows how to end the flow, what another browser actually offers,
// and where a choice is persisted -- a renderer that asked for any of those directly would be asking
// the wrong process.
class OnboardingHostImpl : public onboarding::mojom::OnboardingHost {
 public:
  OnboardingHostImpl(mojo::PendingReceiver<onboarding::mojom::OnboardingHost> receiver,
                     mojo::PendingRemote<onboarding::mojom::Page> page,
                     Profile* profile,
                     base::RepeatingClosure complete_callback);
  OnboardingHostImpl(const OnboardingHostImpl&) = delete;
  OnboardingHostImpl& operator=(const OnboardingHostImpl&) = delete;
  ~OnboardingHostImpl() override;

  // onboarding::mojom::OnboardingHost
  void SetPasswordChoice(const std::string& choice) override;
  void SetModelChoice(const std::string& choice) override;
  void ListImportSources(ListImportSourcesCallback callback) override;
  void StartImport(uint32_t source_index) override;
  void Complete() override;

 private:
  class ImportObserver;

  void OnSourcesDetected(ListImportSourcesCallback callback);
  void OnImportEnded(bool success);

  mojo::Receiver<onboarding::mojom::OnboardingHost> receiver_;
  mojo::Remote<onboarding::mojom::Page> page_;
  raw_ptr<Profile> profile_;
  base::RepeatingClosure complete_callback_;

  std::unique_ptr<ImporterList> importer_list_;
  std::unique_ptr<ImportObserver> import_observer_;
  // Owned by itself once started -- it deletes on completion, which is why this is a raw pointer and
  // why it must be cleared rather than freed.
  raw_ptr<ExternalProcessImporterHost> importer_host_ = nullptr;

  base::WeakPtrFactory<OnboardingHostImpl> weak_factory_{this};
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_WEBUI_REDROB_ONBOARDING_ONBOARDING_HOST_IMPL_H_
