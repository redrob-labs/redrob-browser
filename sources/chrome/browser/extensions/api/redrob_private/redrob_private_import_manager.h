// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_IMPORT_MANAGER_H_
#define CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_IMPORT_MANAGER_H_

#include <memory>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "chrome/browser/importer/importer_list.h"
#include "components/keyed_service/core/keyed_service.h"

namespace content {
class BrowserContext;
}  // namespace content

class ExternalProcessImporterHost;

namespace extensions {

// Owns a first-run import and reports its progress as redrobPrivate
// onImportStateChanged events. It is a KeyedService because an import outlives
// the startImport() call that begins it -- the function returns immediately and
// the import keeps running -- so something bound to the browser context, not to
// a single call, has to hold the importer and the observer and do the
// broadcasting.
//
// This is the extension-surface home of the logic that used to live on the
// onboarding WebUI's OnboardingHostImpl, which held a mojo Page remote and
// pushed straight to the page. The page is being replaced by an extension, so
// the transport becomes an EventRouter broadcast; the importer handling is the
// same.
class RedrobPrivateImportManager : public KeyedService {
 public:
  explicit RedrobPrivateImportManager(content::BrowserContext* context);

  RedrobPrivateImportManager(const RedrobPrivateImportManager&) = delete;
  RedrobPrivateImportManager& operator=(const RedrobPrivateImportManager&) =
      delete;

  ~RedrobPrivateImportManager() override;

  // Starts an import from `source_index` in the most recent detection. The
  // index is re-checked against the list as it is NOW, because it came from a
  // renderer and the list was built asynchronously. A failure or an
  // impossible request is reported through onImportStateChanged, not returned.
  // A second call while an import is already running is ignored.
  void StartImport(int source_index);

 private:
  class ImportObserver;

  // Detection has to finish before an index means anything, so StartImport
  // kicks off detection and finishes in this continuation.
  void OnSourcesDetected(int source_index);
  void OnImportEnded(bool carried_anything);

  // Broadcasts one onImportStateChanged event. `message` is the user-facing
  // reason on the recoverable/failed states, empty otherwise.
  void Broadcast(const char* state, const std::string& message);

  raw_ptr<content::BrowserContext> context_;
  std::unique_ptr<ImporterList> importer_list_;
  std::unique_ptr<ImportObserver> import_observer_;
  // Deletes itself when the import finishes, so it is a bare pointer held only
  // to detach the observer in the destructor.
  raw_ptr<ExternalProcessImporterHost> importer_host_ = nullptr;

  base::WeakPtrFactory<RedrobPrivateImportManager> weak_factory_{this};
};

}  // namespace extensions

#endif  // CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_IMPORT_MANAGER_H_
