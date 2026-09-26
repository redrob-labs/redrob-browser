// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/webui/redrob_onboarding/onboarding_host_impl.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/i18n/rtl.h"
#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/importer/external_process_importer_host.h"
#include "chrome/browser/importer/importer_list.h"
#include "chrome/browser/importer/importer_progress_observer.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/redrob_prefs.h"
#include "components/prefs/pref_service.h"

namespace redrob {
namespace {

// What the choices are recorded as. Profile prefs rather than page state: the flow's window is
// destroyed the moment it finishes, so anything only the page remembers is forgotten before the
// browser it configured has even opened.
constexpr char kModelChoicePref[] = "redrob.onboarding.model_choice";

// Only the choices the flow actually offers are stored. The value arrives from a renderer, and a pref
// that accepts arbitrary strings is a pref that will one day contain one.
bool IsKnownPasswordChoice(const std::string& choice) {
  return choice == "redrob" || choice == "external" || choice == "skip";
}

bool IsKnownModelChoice(const std::string& choice) {
  return choice == "redrob" || choice == "chatgpt" || choice == "claude";
}

}  // namespace

// Bridges the importer's progress callbacks to the page. Separate from the host because the importer
// owns the observer relationship and outlives individual calls.
class OnboardingHostImpl::ImportObserver : public importer::ImporterProgressObserver {
 public:
  explicit ImportObserver(base::RepeatingCallback<void(bool)> ended)
      : ended_(std::move(ended)) {}

  void ImportStarted() override { saw_any_item_ = false; }
  void ImportItemStarted(user_data_importer::ImportItem item) override {}
  void ImportItemEnded(user_data_importer::ImportItem item) override { saw_any_item_ = true; }

  void ImportEnded() override {
    // An import that ends without having carried a single item is how a locked or unreadable source
    // presents itself -- the importer does not raise an error, it simply brings nothing. Reporting
    // that as success would leave the user believing their bookmarks moved.
    ended_.Run(saw_any_item_);
  }

 private:
  base::RepeatingCallback<void(bool)> ended_;
  bool saw_any_item_ = false;
};

OnboardingHostImpl::OnboardingHostImpl(
    mojo::PendingReceiver<onboarding::mojom::OnboardingHost> receiver,
    mojo::PendingRemote<onboarding::mojom::Page> page,
    Profile* profile,
    base::RepeatingClosure complete_callback)
    : receiver_(this, std::move(receiver)),
      page_(std::move(page)),
      profile_(profile),
      complete_callback_(std::move(complete_callback)) {}

OnboardingHostImpl::~OnboardingHostImpl() {
  if (importer_host_) {
    importer_host_->set_observer(nullptr);
  }
}

void OnboardingHostImpl::SetPasswordChoice(const std::string& choice) {
  if (!IsKnownPasswordChoice(choice)) {
    return;
  }
  // The registered pref the rest of the product reads -- Settings > Passwords renders from this exact
  // path. This used to write "redrob.onboarding.password_choice", which is registered nowhere, so
  // PrefService dropped it (DUMP_WILL_BE_NOTREACHED then return) and the decision made on first run
  // never reached the settings page: whatever the user picked, Settings showed nothing selected.
  profile_->GetPrefs()->SetString(redrob::prefs::kPasswordManagerChoice, choice);
}

void OnboardingHostImpl::SetModelChoice(const std::string& choice) {
  if (!IsKnownModelChoice(choice)) {
    return;
  }
  // NOTE: kModelChoicePref is registered nowhere either, so this write is also dropped -- but unlike the
  // password choice there is no registered pref to redirect it to, because nothing in the product reads
  // a "which model did you pick on first run" value at all. Picking a provider here therefore configures
  // nothing: a user who chooses a third-party model must still enter an endpoint and a key in
  // Settings > Models. Making this choice real is provider work, not a pref fix -- see docs/UI-PLAN.md.
  profile_->GetPrefs()->SetString(kModelChoicePref, choice);
}

void OnboardingHostImpl::ListImportSources(ListImportSourcesCallback callback) {
  importer_list_ = std::make_unique<ImporterList>();
  // Detection reads other browsers' profile directories, so it is asynchronous and the page has to
  // tolerate an empty list arriving late rather than assuming none exist.
  //
  // `include_interactive_profiles` is false: a source that needs the user to do something before it
  // can be read does not belong in a list whose next button says "Import".
  importer_list_->DetectSourceProfiles(
      base::i18n::GetConfiguredLocale(),
      /*include_interactive_profiles=*/false,
      base::BindOnce(&OnboardingHostImpl::OnSourcesDetected, weak_factory_.GetWeakPtr(),
                     std::move(callback)));
}

void OnboardingHostImpl::OnSourcesDetected(ListImportSourcesCallback callback) {
  std::vector<onboarding::mojom::ImportSourcePtr> sources;
  for (size_t i = 0; i < importer_list_->count(); ++i) {
    const user_data_importer::SourceProfile& profile = importer_list_->GetSourceProfileAt(i);
    auto source = onboarding::mojom::ImportSource::New();
    source->name = base::UTF16ToUTF8(profile.importer_name);
    // Read from the source's OWN bitmask, one capability at a time. The list of browsers differs by
    // platform and so does what each of them will hand over, so anything hardcoded here would be
    // wrong on some machine.
    const uint16_t services = profile.services_supported;
    source->has_bookmarks = (services & user_data_importer::FAVORITES) != 0;
    source->has_history = (services & user_data_importer::HISTORY) != 0;
    source->has_passwords = (services & user_data_importer::PASSWORDS) != 0;
    source->has_search_engines = (services & user_data_importer::SEARCH_ENGINES) != 0;
    // Always false, and not an oversight. Upstream defines a COOKIES bit and comments it "not
    // supported yet"; nothing implements it, and ALL includes the bit regardless -- so reading the
    // mask for cookies would report a capability that does not exist. See docs/ONBOARDING.md for why
    // the alternative, reading the source browser's cookie database, is not something this browser
    // does on every platform.
    source->has_cookies = false;
    sources.push_back(std::move(source));
  }
  std::move(callback).Run(std::move(sources));
}

void OnboardingHostImpl::StartImport(uint32_t source_index) {
  // The index came from a renderer and the list it indexes was built asynchronously, so it is checked
  // against the list as it is NOW rather than as the page last saw it.
  if (!importer_list_ || source_index >= importer_list_->count()) {
    page_->OnImportStateChanged(onboarding::mojom::ImportState::kFailed,
                                "That browser is no longer available to import from.");
    return;
  }
  if (importer_host_) {
    return;
  }

  const user_data_importer::SourceProfile& source =
      importer_list_->GetSourceProfileAt(source_index);
  // Only what this source actually offers, and only the categories this step promised. Passing ALL
  // would ask for the unimplemented COOKIES bit and for anything a future upstream adds without us
  // having told the user about it.
  const uint16_t wanted = user_data_importer::FAVORITES | user_data_importer::HISTORY |
                          user_data_importer::PASSWORDS | user_data_importer::SEARCH_ENGINES;
  const uint16_t items = source.services_supported & wanted;
  if (!items) {
    page_->OnImportStateChanged(onboarding::mojom::ImportState::kFailed,
                                "There is nothing in that browser this one can read.");
    return;
  }

  import_observer_ = std::make_unique<ImportObserver>(
      base::BindRepeating(&OnboardingHostImpl::OnImportEnded, weak_factory_.GetWeakPtr()));

  // Deletes itself when the import finishes, so it is deliberately not owned here.
  importer_host_ = new ExternalProcessImporterHost();
  // Headless: a modal warning dialog raised by the importer would appear over a window the user
  // cannot reach past, and this flow reports the same condition in its own copy instead.
  importer_host_->set_headless();
  importer_host_->set_observer(import_observer_.get());
  page_->OnImportStateChanged(onboarding::mojom::ImportState::kRunning, std::nullopt);
  importer_host_->StartImportSettings(source, profile_, items, new ProfileWriter(profile_));
}

void OnboardingHostImpl::OnImportEnded(bool carried_anything) {
  importer_host_ = nullptr;
  if (carried_anything) {
    page_->OnImportStateChanged(onboarding::mojom::ImportState::kSucceeded, std::nullopt);
    return;
  }
  // Reported as recoverable rather than failed: the overwhelmingly common cause is the other browser
  // still running and holding its profile, and the user can fix that and press again.
  page_->OnImportStateChanged(
      onboarding::mojom::ImportState::kSourceBusy,
      "Nothing came across. If that browser is still open, close it and try again.");
}

void OnboardingHostImpl::Complete() {
  // Ends the flow through the browser's own closure. The page cannot mark first run finished, close
  // this window, or open the browser -- and should not be able to.
  complete_callback_.Run();
}

}  // namespace redrob
