// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_FILE_TOOLS_H_
#define CHROME_BROWSER_REDROB_FILE_TOOLS_H_

#include <string>

#include "base/files/file_path.h"
#include "base/functional/callback.h"

namespace redrob {

// Writing the files an agent produced.
//
// The shape of this API is the security boundary, not a check inside it. A model supplies a FILE NAME
// and never a path; the browser decides which directory that name lands in. There is deliberately no
// way to express "write to /etc/hosts" through this interface, so there is no traversal check to get
// wrong -- the dangerous input simply has nowhere to go.
class FileTools {
 public:
  // Absolute path written, or empty on refusal.
  using WriteCallback = base::OnceCallback<void(base::FilePath)>;

  // Is `name` something the browser is willing to treat as a file name at all? Rejects anything with a
  // separator or a parent reference, leading dots, and names long enough to be an attack on the
  // filesystem rather than a document.
  static bool IsAcceptableFileName(const std::string& name);

  // Writes `contents` as `name` inside `folder`. Refuses rather than overwriting: a task that
  // clobbers a file the user already had is not a task that saved its work, and the caller can report
  // the collision back to the engine, which can pick another name.
  static void WriteInFolder(const base::FilePath& folder,
                            const std::string& name,
                            const std::string& contents,
                            WriteCallback callback);

  // Full-access only: `folder` came from the MODEL rather than from the user's picker, so this is the
  // one entry point where the destination directory is untrusted input. The name rules are unchanged --
  // full access widens WHERE a file may go, not what may be called a file.
  //
  // What full access deliberately does NOT include, and why:
  //   * a relative path, or one containing `..` -- neither can be reasoned about by the person who
  //     granted the access;
  //   * any path with a dot-directory in it -- ~/.ssh, ~/.aws, ~/.config and everything like them.
  //     "Full access to my files" is a statement about documents, and reading it as permission to
  //     rewrite the credentials sitting next to them is not a reading the user made;
  //   * anything inside the browser's own user-data directory, which is where this profile's
  //     passwords, cookies and prefs live -- an agent that can rewrite its own permission prefs has
  //     no permission model at all;
  //   * overwriting an existing file, exactly as in the guarded path.
  // `user_data_dir` is passed in rather than looked up here so the check runs on the blocking thread
  // against a value the caller resolved on the UI thread.
  static void WriteAtPath(const base::FilePath& folder,
                          const std::string& name,
                          const std::string& contents,
                          const base::FilePath& user_data_dir,
                          WriteCallback callback);
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_FILE_TOOLS_H_
