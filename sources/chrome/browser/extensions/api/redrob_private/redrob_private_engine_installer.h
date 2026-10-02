// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_ENGINE_INSTALLER_H_
#define CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_ENGINE_INSTALLER_H_

#include <memory>
#include <optional>
#include <string>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "chrome/common/extensions/api/redrob_private.h"
#include "components/keyed_service/core/keyed_service.h"

class GURL;

namespace content {
class BrowserContext;
}  // namespace content

namespace network {
class SimpleURLLoader;
}  // namespace network

namespace extensions {

// Installs the local engine, and reports where it got to as redrobPrivate
// onEngineInstallStateChanged events.
//
// This exists because of a decision recorded in docs/DELIVERY-LOOP.md item G-1:
// the engine does NOT ship inside the browser bundle, onboarding installs it.
// That choice puts the download in the browser process rather than in the
// extension, and the reason is a hard boundary, not a preference -- an extension
// can fetch bytes but cannot write an executable to ~/.redrob/bin or mark it
// executable, so the only party that can finish the job is this side. The
// extension drives it through the private API and renders the progress.
//
// A KeyedService because an install outlives the installEngine() call that
// begins it, exactly as RedrobPrivateImportManager outlives startImport().
//
// The chain is: resolve the latest release -> read that release's SHA256SUMS ->
// download this platform's archive -> check its hash against that file ->
// unzip it in the sandboxed unzip service -> move the binary into place. The
// hash check is not decoration: it is the only thing standing between a
// man-in-the-middle and an executable this browser then launches. The engine's
// own shell installer skips it, so this path is deliberately stricter than the
// documented one.
//
// What this does NOT give us is authenticity. SHA256SUMS is served from the
// same origin as the archive, so an attacker who can replace one can replace
// both; it proves the bytes arrived intact, not that we asked the right host.
// The real answer is a signature checked against a key shipped in the browser,
// and it is not here yet.
class RedrobPrivateEngineInstaller : public KeyedService {
 public:
  explicit RedrobPrivateEngineInstaller(content::BrowserContext* context);

  RedrobPrivateEngineInstaller(const RedrobPrivateEngineInstaller&) = delete;
  RedrobPrivateEngineInstaller& operator=(const RedrobPrivateEngineInstaller&) =
      delete;

  ~RedrobPrivateEngineInstaller() override;

  // The state as the extension should see it. When no run is in flight this
  // answers from disk -- `installed` when the binary is where the browser looks
  // for it, `notInstalled` when it is not -- so a page that opens long after an
  // install still gets the truth rather than a stale `idle`.
  //
  // Asynchronous because the disk check blocks and must not run on the UI
  // thread. A run in flight answers immediately from memory.
  using StateCallback =
      base::OnceCallback<void(api::redrob_private::EngineInstallInfo)>;
  void GetState(StateCallback callback);

  // Begins an install. Ignored while one is already running, which is why it
  // returns nothing: the answer to "did it start" is the next event, and a
  // caller that got `false` here could do nothing useful with it.
  void Install();

  // The archive name this platform needs, e.g. "redrob-linux-x64.zip". Exposed
  // for the unit test, which is the only place the mapping can be checked
  // without running an install.
  static std::string ArchiveNameForThisPlatform();

 private:
  // Every step of one run. Kept as a member rather than passed along the chain
  // so that GetState() can answer mid-run without threading state through the
  // callbacks.
  struct Run;

  void OnReleaseResolved(std::optional<std::string> body);
  void OnSumsFetched(std::optional<std::string> body);
  void OnArchiveDownloaded(base::FilePath archive);
  void OnDownloadProgress(uint64_t received);
  void OnHashChecked(bool matched);
  void OnUnzipped(bool ok);
  void OnMoved(bool ok);

  // Ends the run, broadcasting `failed` with `reason`. `reason` is shown to a
  // person, so it says what they can do about it where that is knowable.
  void Fail(const std::string& reason);

  void Broadcast();

  // Starts one GET whose whole body is wanted in memory. Used for the release
  // metadata and for SHA256SUMS, both of which are small; the archive goes to a
  // file instead.
  void FetchString(
      const GURL& url,
      base::OnceCallback<void(std::optional<std::string>)> done);

  raw_ptr<content::BrowserContext> context_;
  std::unique_ptr<network::SimpleURLLoader> loader_;
  std::unique_ptr<Run> run_;

  base::WeakPtrFactory<RedrobPrivateEngineInstaller> weak_factory_{this};
};

}  // namespace extensions

#endif  // CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_ENGINE_INSTALLER_H_
