// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_COMMON_IMPORTER_CHROMIUM_PROFILE_LOCATOR_H_
#define CHROME_COMMON_IMPORTER_CHROMIUM_PROFILE_LOCATOR_H_

#include <string>
#include <vector>

#include "base/files/file_path.h"

namespace redrob {

// Finding the Chromium-family browsers installed for this user.
//
// This runs in the BROWSER process, because detection is what fills the import list; the importer
// itself runs in a utility process and only ever receives one already-chosen profile directory.
//
// Chromium 153 has no Chrome importer at all -- the ImporterType enum is IE, Firefox, Safari, a
// bookmarks file and Edge -- so both halves of this are ours. What is NOT ours to invent is the
// promise: cookies are excluded here on every platform, and the reason differs by platform in a way
// that decides the product rather than the implementation. See docs/ONBOARDING.md.
struct ChromiumSource {
  // "Google Chrome", "Microsoft Edge", "Brave" -- what the user calls it.
  std::u16string product_name;
  // The profile directory itself (".../User Data/Default"), not the user-data directory. One entry per
  // profile, because a person with a work profile and a personal one is choosing between them.
  base::FilePath profile_path;
  // Which profile inside that product, for display: "Default", "Profile 1", or the name the source
  // browser stored for it.
  std::u16string profile_name;
  // True when the source is currently running, as far as a lock file can tell. An import from a live
  // profile reads a SQLite database mid-write, so this is a warning the UI must be able to show.
  bool appears_running = false;
};

// Every Chromium-family profile this user has, across the products we know how to read. Blocking I/O:
// callers run it on a thread pool, exactly as ImporterList already does for its own detection.
std::vector<ChromiumSource> DetectChromiumSources();

}  // namespace redrob

#endif  // CHROME_COMMON_IMPORTER_CHROMIUM_PROFILE_LOCATOR_H_
