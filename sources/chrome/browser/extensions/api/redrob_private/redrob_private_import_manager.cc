// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_import_manager.h"

#include <string>
#include <utility>

#include "base/functional/bind.h"
#include "base/i18n/rtl.h"
#include "chrome/browser/importer/external_process_importer_host.h"
#include "chrome/browser/importer/importer_list.h"
#include "chrome/browser/importer/importer_progress_observer.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/common/extensions/api/redrob_private.h"
#include "components/user_data_importer/common/importer_data_types.h"
#include "extensions/browser/event_router.h"

namespace extensions {

namespace redrob_private = api::redrob_private;

// Bridges the importer's progress callbacks to the manager. Separate from the
// manager because the importer owns the observer relationship and outlives
// individual calls.
class RedrobPrivateImportManager::ImportObserver
    : public importer::ImporterProgressObserver {
 public:
  explicit ImportObserver(base::RepeatingCallback<void(bool)> ended)
      : ended_(std::move(ended)) {}

  void ImportStarted() override { saw_any_item_ = false; }
  void ImportItemStarted(user_data_importer::ImportItem item) override {}
  void ImportItemEnded(user_data_importer::ImportItem item) override {
    saw_any_item_ = true;
  }

  void ImportEnded() override {
    // An import that ends without having carried a single item is how a locked
    // or unreadable source presents itself -- the importer does not raise an
    // error, it simply brings nothing. Reporting that as success would leave
    // the user believing their bookmarks moved.
    ended_.Run(saw_any_item_);
  }

 private:
  base::RepeatingCallback<void(bool)> ended_;
  bool saw_any_item_ = false;
};

RedrobPrivateImportManager::RedrobPrivateImportManager(
    content::BrowserContext* context)
    : context_(context) {}

RedrobPrivateImportManager::~RedrobPrivateImportManager() {
  if (importer_host_) {
    importer_host_->set_observer(nullptr);
  }
}

void RedrobPrivateImportManager::StartImport(int source_index) {
  if (importer_host_) {
    // An import is already running; ignore, as the WebUI host did.
    return;
  }
  importer_list_ = std::make_unique<ImporterList>();
  // The index indexes a list built asynchronously, so detection is re-run and
  // the index checked against the list as it is NOW.
  importer_list_->DetectSourceProfiles(
      base::i18n::GetConfiguredLocale(),
      /*include_interactive_profiles=*/false,
      base::BindOnce(&RedrobPrivateImportManager::OnSourcesDetected,
                     weak_factory_.GetWeakPtr(), source_index));
}

void RedrobPrivateImportManager::OnSourcesDetected(int source_index) {
  if (source_index < 0 ||
      static_cast<size_t>(source_index) >= importer_list_->count()) {
    Broadcast(redrob_private::ToString(redrob_private::ImportState::kFailed),
              "That browser is no longer available to import from.");
    return;
  }

  const user_data_importer::SourceProfile& source =
      importer_list_->GetSourceProfileAt(source_index);
  // Only what this source actually offers, and only the categories this step
  // promised. Passing ALL would ask for the unimplemented COOKIES bit.
  const uint16_t wanted =
      user_data_importer::FAVORITES | user_data_importer::HISTORY |
      user_data_importer::PASSWORDS | user_data_importer::SEARCH_ENGINES;
  const uint16_t items = source.services_supported & wanted;
  if (!items) {
    Broadcast(redrob_private::ToString(redrob_private::ImportState::kFailed),
              "There is nothing in that browser this one can read.");
    return;
  }

  import_observer_ = std::make_unique<ImportObserver>(base::BindRepeating(
      &RedrobPrivateImportManager::OnImportEnded, weak_factory_.GetWeakPtr()));

  // Deletes itself when the import finishes, so it is deliberately not owned.
  importer_host_ = new ExternalProcessImporterHost();
  // Headless: a modal warning dialog raised by the importer would appear over a
  // window the user cannot reach past; this flow reports the same condition in
  // its own copy instead.
  importer_host_->set_headless();
  importer_host_->set_observer(import_observer_.get());
  Broadcast(redrob_private::ToString(redrob_private::ImportState::kRunning),
            std::string());
  importer_host_->StartImportSettings(source, Profile::FromBrowserContext(context_),
                                      items, new ProfileWriter(Profile::FromBrowserContext(context_)));
}

void RedrobPrivateImportManager::OnImportEnded(bool carried_anything) {
  importer_host_ = nullptr;
  if (carried_anything) {
    Broadcast(redrob_private::ToString(redrob_private::ImportState::kSucceeded),
              std::string());
    return;
  }
  // Reported as recoverable rather than failed: the common cause is the other
  // browser still running and holding its profile, which the user can fix.
  Broadcast(
      redrob_private::ToString(redrob_private::ImportState::kSourceBusy),
      "Nothing came across. If that browser is still open, close it and try "
      "again.");
}

void RedrobPrivateImportManager::Broadcast(const char* state,
                                           const std::string& message) {
  EventRouter* event_router = EventRouter::Get(context_);
  if (!event_router) {
    return;
  }
  redrob_private::ImportState parsed =
      redrob_private::ParseImportState(state);
  // Built by hand rather than through OnImportStateChanged::Create, which takes a
  // plain string: the generator drops `optional` on a trailing argument, so "no
  // message" cannot travel through it. An empty string is not the same thing -- it
  // would tell the page there IS a reason and that the reason is blank.
  base::ListValue args;
  args.Append(redrob_private::ToString(parsed));
  if (!message.empty()) {
    args.Append(message);
  }
  auto event = std::make_unique<Event>(
      events::REDROBPRIVATE_ON_IMPORT_STATE_CHANGED,
      redrob_private::OnImportStateChanged::kEventName, std::move(args),
      context_);
  event_router->BroadcastEvent(std::move(event));
}

}  // namespace extensions
