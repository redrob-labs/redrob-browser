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
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_FILE_TOOLS_H_
