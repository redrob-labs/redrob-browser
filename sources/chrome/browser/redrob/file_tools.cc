// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/file_tools.h"

#include <utility>

#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/strings/string_util.h"
#include "base/task/thread_pool.h"

namespace redrob {
namespace {

// Long enough for a real document name, short enough not to be an attempt at the filesystem's limits.
constexpr size_t kMaxNameLength = 128;
// A tool result, not a download. Something larger than this is a file the user should be asked about
// rather than one a task writes on its way past.
constexpr size_t kMaxContentBytes = 8 * 1024 * 1024;

base::FilePath WriteOnBlockingThread(base::FilePath folder,
                                     std::string name,
                                     std::string contents) {
  if (!base::DirectoryExists(folder)) {
    return base::FilePath();
  }
  const base::FilePath path = folder.AppendASCII(name);
  // Checked here, on the thread that will do the write, rather than earlier: a check on the UI thread
  // would be answering a question about a filesystem that can change before the write happens.
  if (base::PathExists(path)) {
    return base::FilePath();
  }
  if (!base::WriteFile(path, contents)) {
    return base::FilePath();
  }
  return path;
}

}  // namespace

// static
bool FileTools::IsAcceptableFileName(const std::string& name) {
  if (name.empty() || name.size() > kMaxNameLength) {
    return false;
  }
  // No separators of either kind, whatever platform we are on: a name containing one is trying to be a
  // path, and a path is not what this interface accepts.
  if (name.find('/') != std::string::npos || name.find('\\') != std::string::npos) {
    return false;
  }
  if (name.find("..") != std::string::npos) {
    return false;
  }
  // A leading dot hides the file from the user who is supposed to be able to see what the agent made.
  if (name.front() == '.') {
    return false;
  }
  // ASCII only, and no control characters. This is deliberately narrow rather than clever: the set of
  // bytes that mean something surprising to a shell, a filesystem or a UI is large, and none of them
  // are needed to name a document.
  for (const char c : name) {
    const bool ok = base::IsAsciiAlphaNumeric(c) || c == '.' || c == '-' || c == '_' || c == ' ';
    if (!ok) {
      return false;
    }
  }
  return true;
}

// static
void FileTools::WriteInFolder(const base::FilePath& folder,
                             const std::string& name,
                             const std::string& contents,
                             WriteCallback callback) {
  if (folder.empty() || !IsAcceptableFileName(name) || contents.size() > kMaxContentBytes) {
    std::move(callback).Run(base::FilePath());
    return;
  }
  // Only the already-authorized destination and the data cross onto the blocking thread. Nothing there
  // can widen where this goes, because the folder was decided before the task was posted.
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock(), base::TaskShutdownBehavior::SKIP_ON_SHUTDOWN},
      base::BindOnce(&WriteOnBlockingThread, folder, name, contents), std::move(callback));
}

}  // namespace redrob
