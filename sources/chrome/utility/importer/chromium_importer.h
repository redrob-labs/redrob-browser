// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_UTILITY_IMPORTER_CHROMIUM_IMPORTER_H_
#define CHROME_UTILITY_IMPORTER_CHROMIUM_IMPORTER_H_

#include <stdint.h>

#include "base/files/file_path.h"
#include "base/files/scoped_temp_dir.h"
#include "chrome/utility/importer/importer.h"

namespace redrob {

// Imports from another Chromium-family browser: Chrome, Edge, Brave, Vivaldi, Opera, Chromium itself.
//
// Chromium 153 ships no importer for any of them -- the type enum stops at Edge's legacy favourites --
// so this reads the on-disk formats directly. It runs in the same non-sandboxed utility process the
// Firefox importer uses (profile_import.mojom is [ServiceSandbox=kNoSandbox]), which is what makes raw
// SQLite reads possible at all.
//
// WHAT IT DOES NOT DO, and why neither is an omission:
//
// COOKIES are not imported, on any platform. Upstream's own machinery cannot carry them
// (`COOKIES = 1 << 2,  // Not supported yet.`) and reading the source's cookie database directly means
// something different on each platform:
//   * on Windows, modern Chrome cookies are App-Bound Encrypted and decryption validates the calling
//     executable's path. That check exists specifically to stop other programs stealing session
//     cookies; defeating it is not a feature this browser will have.
//   * on macOS and Linux it is technically possible with the user's explicit keychain or keyring
//     authorisation, and still cannot be complete -- session cookies held only in the source process's
//     memory are not in its database, and device-bound sessions do not survive being copied.
//
// PASSWORDS are not read out of `Login Data` either, and that is a decision rather than a limitation.
// Doing it means reimplementing another program's key derivation to open a store it encrypted for
// itself: on Windows that is the App-Bound key and is off the table entirely, and on POSIX it is
// PBKDF2 over a keyring secret through `crypto::kdf`, whose API is passkey-gated precisely so that
// "decrypt someone else's credential store" is not a thing a feature can quietly start doing. A
// half-working import that reports "41 of 60 passwords" is also the worst outcome for the user, because
// the 19 are invisible until a login fails.
//
// The supported route exists and works on every platform: the source browser exports a CSV and
// Chromium's own password manager imports it, with its own file picker and its own conflict handling.
// The import step links there and says so. An importer that promised logins and delivered some of them
// would be worse than one that is clear about which door to use.
class ChromiumImporter : public Importer {
 public:
  ChromiumImporter();
  ChromiumImporter(const ChromiumImporter&) = delete;
  ChromiumImporter& operator=(const ChromiumImporter&) = delete;

  // Importer
  void StartImport(const user_data_importer::SourceProfile& source_profile,
                   uint16_t items,
                   ImporterBridge* bridge) override;

 private:
  ~ChromiumImporter() override;

  void ImportBookmarks();
  void ImportHistory();
  void ImportSearchEngines();

  // Copies one file out of the source profile before opening it. The source browser may be running,
  // and reading its live SQLite -- with a hot WAL -- is how an importer gets a torn snapshot. Returns
  // an empty path when there is nothing to copy.
  base::FilePath CopyOut(const char* file_name);

  base::FilePath source_path_;
  base::ScopedTempDir copies_;
  uint16_t items_ = 0;
};

}  // namespace redrob

#endif  // CHROME_UTILITY_IMPORTER_CHROMIUM_IMPORTER_H_
