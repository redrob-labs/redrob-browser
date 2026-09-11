// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/common/importer/chromium_profile_locator.h"

#include "base/environment.h"
#include "base/files/file_enumerator.h"
#include "base/files/file_util.h"
#include "base/json/json_reader.h"
#include "base/memory/ptr_util.h"
#include "base/path_service.h"
#include "base/strings/utf_string_conversions.h"
#include "base/values.h"
#include "build/build_config.h"

#if BUILDFLAG(IS_MAC)
#include "base/apple/foundation_util.h"
#endif

#if BUILDFLAG(IS_WIN)
#include "base/base_paths_win.h"
#endif

namespace redrob {
namespace {

struct Product {
  const char* name;
  // Path fragments below the platform's per-user data root, in that root's own layout.
  const char* relative_path;
};

// The products this reads. Deliberately a list rather than a scan: "everything that looks like a
// Chromium profile" would pick up this browser's own profile, portable copies, and half-migrated
// directories from crash recovery.
constexpr Product kProducts[] = {
#if BUILDFLAG(IS_WIN)
    {"Google Chrome", "Google\\Chrome\\User Data"},
    {"Google Chrome Beta", "Google\\Chrome Beta\\User Data"},
    {"Chromium", "Chromium\\User Data"},
    {"Microsoft Edge", "Microsoft\\Edge\\User Data"},
    {"Brave", "BraveSoftware\\Brave-Browser\\User Data"},
    {"Vivaldi", "Vivaldi\\User Data"},
    {"Opera", "Opera Software\\Opera Stable"},
#elif BUILDFLAG(IS_MAC)
    {"Google Chrome", "Google/Chrome"},
    {"Google Chrome Beta", "Google/Chrome Beta"},
    {"Chromium", "Chromium"},
    {"Microsoft Edge", "Microsoft Edge"},
    {"Brave", "BraveSoftware/Brave-Browser"},
    {"Vivaldi", "Vivaldi"},
    {"Opera", "com.operasoftware.Opera"},
#else
    {"Google Chrome", "google-chrome"},
    {"Google Chrome Beta", "google-chrome-beta"},
    {"Chromium", "chromium"},
    {"Microsoft Edge", "microsoft-edge"},
    {"Brave", "BraveSoftware/Brave-Browser"},
    {"Vivaldi", "vivaldi"},
    {"Opera", "opera"},
#endif
};

// Where a platform keeps per-user application data. Empty when it cannot be resolved, which is a
// "found nothing" rather than an error: a machine with no HOME is a machine with no Chrome either.
base::FilePath UserDataRoot() {
  base::FilePath path;
#if BUILDFLAG(IS_WIN)
  base::PathService::Get(base::DIR_LOCAL_APP_DATA, &path);
#elif BUILDFLAG(IS_MAC)
  path = base::apple::GetUserLibraryPath().AppendASCII("Application Support");
#else
  // XDG_CONFIG_HOME when the user has set it, then ~/.config. In that order, because a user who moved
  // their config root moved Chrome's with it, and looking only in ~/.config would report "no browsers
  // found" on a machine full of them.
  std::unique_ptr<base::Environment> environment = base::Environment::Create();
  const std::optional<std::string> xdg_config = environment->GetVar("XDG_CONFIG_HOME");
  if (xdg_config.has_value() && !xdg_config->empty()) {
    const base::FilePath candidate = base::FilePath::FromUTF8Unsafe(*xdg_config);
    if (candidate.IsAbsolute()) {
      return candidate;
    }
  }
  base::FilePath home;
  if (base::PathService::Get(base::DIR_HOME, &home) && !home.empty()) {
    path = home.AppendASCII(".config");
  }
#endif
  return path;
}

// The display name the source browser stored for a profile, from its own "Local State". Falls back to
// the directory name, which is what the user would see in that browser's profile switcher anyway.
std::u16string ProfileDisplayName(const base::FilePath& user_data_dir,
                                  const base::FilePath& profile_dir) {
  const std::string directory = profile_dir.BaseName().MaybeAsASCII();
  std::string contents;
  if (!base::ReadFileToStringWithMaxSize(user_data_dir.AppendASCII("Local State"), &contents,
                                         4 * 1024 * 1024)) {
    return base::UTF8ToUTF16(directory);
  }
  std::optional<base::DictValue> root =
      base::JSONReader::ReadDict(contents, base::JSON_PARSE_RFC);
  if (!root) {
    return base::UTF8ToUTF16(directory);
  }
  const base::DictValue* info = root->FindDictByDottedPath("profile.info_cache");
  if (!info) {
    return base::UTF8ToUTF16(directory);
  }
  const base::DictValue* entry = info->FindDict(directory);
  if (!entry) {
    return base::UTF8ToUTF16(directory);
  }
  const std::string* name = entry->FindString("name");
  return name && !name->empty() ? base::UTF8ToUTF16(*name) : base::UTF8ToUTF16(directory);
}

// A profile directory is one that has the files we are going to read. Checked rather than assumed,
// because a "Default" directory left behind by an uninstall has none of them.
bool LooksLikeProfile(const base::FilePath& path) {
  return base::PathExists(path.AppendASCII("Preferences")) ||
         base::PathExists(path.AppendASCII("Bookmarks")) ||
         base::PathExists(path.AppendASCII("History"));
}

// Chromium-family browsers hold a lock in the user-data directory while running. The name differs by
// platform, and its presence is a hint rather than a fact -- a crashed browser leaves one behind.
bool AppearsRunning(const base::FilePath& user_data_dir) {
#if BUILDFLAG(IS_WIN)
  return base::PathExists(user_data_dir.AppendASCII("lockfile"));
#else
  const base::FilePath lock = user_data_dir.AppendASCII("SingletonLock");
  base::FilePath target;
  // A symlink whose target names this host and a live pid. Existence alone is not enough, but reading
  // it is more than we need here: any SingletonLock is worth warning about.
  return base::PathExists(lock) || base::ReadSymbolicLink(lock, &target);
#endif
}

}  // namespace

std::vector<ChromiumSource> DetectChromiumSources() {
  std::vector<ChromiumSource> sources;
  const base::FilePath root = UserDataRoot();
  if (root.empty()) {
    return sources;
  }

  for (const Product& product : kProducts) {
    const base::FilePath user_data_dir =
        root.Append(base::FilePath::FromUTF8Unsafe(product.relative_path));
    if (!base::DirectoryExists(user_data_dir)) {
      continue;
    }
    const bool running = AppearsRunning(user_data_dir);

    // "Default" first, then "Profile N". Enumerated rather than guessed at, so a user with six
    // profiles sees six -- and sorted by the enumerator's order rather than ours, since inventing an
    // order would just be a different arbitrary one.
    std::vector<base::FilePath> candidates;
    const base::FilePath default_profile = user_data_dir.AppendASCII("Default");
    if (LooksLikeProfile(default_profile)) {
      candidates.push_back(default_profile);
    }
    base::FileEnumerator enumerator(user_data_dir, /*recursive=*/false,
                                    base::FileEnumerator::DIRECTORIES);
    for (base::FilePath entry = enumerator.Next(); !entry.empty();
         entry = enumerator.Next()) {
      const std::string name = entry.BaseName().MaybeAsASCII();
      if (name.rfind("Profile ", 0) != 0 || !LooksLikeProfile(entry)) {
        continue;
      }
      candidates.push_back(entry);
    }

    for (const base::FilePath& profile : candidates) {
      ChromiumSource source;
      source.product_name = base::UTF8ToUTF16(product.name);
      source.profile_path = profile;
      source.profile_name = ProfileDisplayName(user_data_dir, profile);
      source.appears_running = running;
      sources.push_back(std::move(source));
    }
  }
  return sources;
}

}  // namespace redrob
