// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_MEMORY_STORE_H_
#define CHROME_BROWSER_REDROB_MEMORY_STORE_H_

#include <optional>
#include <string>
#include <vector>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/scoped_refptr.h"
#include "base/memory/weak_ptr.h"
#include "base/task/sequenced_task_runner.h"
#include "base/timer/wall_clock_timer.h"
#include "components/keyed_service/core/keyed_service.h"

class Profile;

namespace redrob {

// What the agent is allowed to remember between tasks: a folder of markdown files in the profile.
//
//   <profile>/Redrob/memory/
//     MEMORY.md                 the index, one line per file
//     USER.md                   who the user is
//     episodic/YYYY-MM-DD.md    what happened, day by day
//     sites/<host>.md           paths through a site that worked
//     people/  projects/        durable facts, moved there by consolidation
//     .snapshots/<run id>/      the whole tree as it was before a run first wrote to it
//
// Why it changed. This used to be one bounded list of sentences in prefs, chosen so the whole of it
// fitted on one screen and stayed reviewable. That bound was the only review it had: you could read the
// list and delete rows, but not see what a task had changed, and not undo it. Files are reviewable in a
// stronger way -- every write belongs to a RUN, every run snapshots the tree before its first write and
// records which files it touched with +/- line counts, and any run can be reverted from Settings. The
// size ceiling is still here (64 KiB a file, 4 MiB in all); it is just no longer the review mechanism.
//
// The write boundary. Nothing writes these files except this class, and this class writes only inside
// a run. The engine never touches the disk: it proposes memory_write / memory_edit tool calls, and
// TaskStore declares those tools ONLY to its hidden memory tasks (extraction after a task, and
// consolidation), so an ordinary task cannot rewrite memory as a side effect of browsing. A user edit
// in Settings is a run too ("user"), so it is snapshotted and revertible like the agent's.
//
// All disk work happens on one sequenced blocking task runner, which is also what orders "snapshot,
// then write" for a run without a lock.
class MemoryStore : public KeyedService {
 public:
  enum class RunKind {
    kExtract,
    kConsolidate,
    // An edit made by the user in Settings.
    kUser,
    // A revert of an earlier run; snapshotted itself, so a revert can be reverted.
    kRevert,
  };

  struct FileInfo {
    // Relative to the memory root, with '/' separators, e.g. "sites/example.com.md".
    std::string path;
    int64_t bytes = 0;
    int64_t modified_ms = 0;
  };

  struct FileChange {
    std::string path;
    int added = 0;
    int removed = 0;
  };

  struct Run {
    // The unix time in milliseconds the run began, as a string. Also its snapshot's directory name.
    std::string id;
    RunKind kind = RunKind::kExtract;
    int64_t started_ms = 0;
    // 0 while the run is still going.
    int64_t duration_ms = 0;
    // 0 when the engine did not report usage, which is the common case.
    int64_t tokens = 0;
    std::vector<FileChange> files;
    bool finished = false;
    // Whether a snapshot was taken, i.e. whether the run wrote anything. Only such a run can be reverted.
    bool has_snapshot = false;
  };

  struct SearchHit {
    std::string path;
    // 1-based.
    int line = 0;
    std::string snippet;
  };

  // `ok` false carries a message written for the engine (or the settings page) to act on.
  using DoneCallback = base::OnceCallback<void(bool ok, const std::string& message)>;
  using ReadCallback = base::OnceCallback<void(std::optional<std::string> content)>;
  using SearchCallback = base::OnceCallback<void(std::vector<SearchHit> hits)>;

  explicit MemoryStore(Profile* profile);
  MemoryStore(const MemoryStore&) = delete;
  MemoryStore& operator=(const MemoryStore&) = delete;
  ~MemoryStore() override;

  // False when memory is switched off, which is the one case a caller must not treat as failure.
  bool enabled() const;
  void SetEnabled(bool enabled);

  // Retention in days for episodic files; 0 means keep until deleted. Only episodic/ ages out: the
  // other files are what consolidation decided was durable. Setting it sweeps immediately.
  int retention_days() const;
  void SetRetentionDays(int days);

  // Whether extraction may be told the titles and URLs the agent's own tab visited during the task.
  // Off by default; never the user's wider history either way.
  bool history_input() const;
  void SetHistoryInput(bool enabled);

  // The tree as last seen, sorted by path. A cache refreshed after every change, so Settings can render
  // it synchronously; read the file itself with ReadFile.
  const std::vector<FileInfo>& files() const { return files_; }

  // Opens a run and returns its id. Every write names the run it belongs to.
  std::string BeginRun(RunKind kind);
  // Closes it: records the duration and any token count. Unknown ids are ignored.
  void EndRun(const std::string& run_id, int64_t tokens);
  // Newest first. At most kMaxRuns, matching the snapshots kept on disk.
  std::vector<Run> Runs() const;
  // How many extraction runs finished since the last consolidation, and when that was (0 = never).
  int ExtractionRunsSinceConsolidation() const;
  int64_t last_consolidation_ms() const;

  // File access. `path` comes from model output or a renderer and is validated here: relative, .md,
  // [a-z0-9-_/.] only, no "..", no hidden segment, under the root.
  void ReadFile(const std::string& path, ReadCallback callback);
  void WriteFile(const std::string& run_id,
                 const std::string& path,
                 const std::string& content,
                 DoneCallback callback);
  // Replaces exactly one occurrence of `old_text`. Zero or several occurrences is a refusal, because an
  // edit the caller cannot aim is an edit that lands in the wrong place.
  void EditFile(const std::string& run_id,
                const std::string& path,
                const std::string& old_text,
                const std::string& new_text,
                DoneCallback callback);
  void DeleteFile(const std::string& run_id, const std::string& path, DoneCallback callback);

  // Token overlap across every file, best lines first, at most `limit`. Deliberately naive: a scorer the
  // user can see the consequences of beats a clever one whose misses are unexplainable.
  void Search(const std::string& query, size_t limit, SearchCallback callback);

  // Puts the tree back the way it was before `run_id` first wrote. Recorded as a kRevert run.
  void Revert(const std::string& run_id, DoneCallback callback);

  // Deletes every file, every snapshot and every run row. "Forget everything" that quietly kept a
  // snapshot to revert to would be a lie told at the exact moment the user was trying to be sure.
  void Clear();

  // Path validation, exposed for TaskStore's own messages. Returns the normalised relative path.
  static std::optional<std::string> ValidatePath(const std::string& path);

  static constexpr size_t kMaxRuns = 30;
  static constexpr size_t kMaxFileBytes = 64 * 1024;
  static constexpr size_t kMaxTotalBytes = 4 * 1024 * 1024;

 // What one change did on disk. Public only so the blocking-side helpers in the .cc can return it.
  struct ChangeResult;

 private:
  enum class Op { kWrite, kEdit, kDelete };

  // The ONE write path. Snapshots first when the run has not written yet, applies the change, and
  // records the file's +/- on the run.
  void Change(const std::string& run_id,
              Op op,
              const std::string& path,
              const std::string& content,
              const std::string& old_text,
              DoneCallback callback);
  void OnChanged(std::string run_id, DoneCallback callback, ChangeResult result);
  void RefreshIndex();
  void OnIndex(std::vector<FileInfo> files);
  void SaveRun(const Run& run);
  std::optional<Run> FindRun(const std::string& run_id) const;
  // One-time move of the old pref entries into files.
  void MigrateFromPrefs();

  void Sweep();
  void ScheduleSweep();

  raw_ptr<Profile> profile_;
  base::FilePath root_;
  scoped_refptr<base::SequencedTaskRunner> file_runner_;
  std::vector<FileInfo> files_;
  int64_t last_run_id_ms_ = 0;
  base::WallClockTimer sweep_timer_;
  base::WeakPtrFactory<MemoryStore> weak_factory_{this};
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_MEMORY_STORE_H_
