// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_ROUTINE_STORE_H_
#define CHROME_BROWSER_REDROB_ROUTINE_STORE_H_

#include <string>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/timer/wall_clock_timer.h"
#include "chrome/browser/ui/webui/redrob/redrob.mojom.h"
#include "components/keyed_service/core/keyed_service.h"

class Profile;

namespace redrob {

class TaskStore;

// Tasks the browser starts on its own.
//
// Two kinds, because they answer different questions. A CRON routine starts a NEW task on a schedule:
// the morning summary, the weekly price check -- work whose value is that it happens again from
// scratch. A HEARTBEAT routine wakes an EXISTING chat with its context intact: the thread you have
// been iterating on, nudged to look again.
//
// The scheduling rules are deliberately conservative, because a browser that opens tabs while nobody
// is watching has to be predictable:
//   * a routine never runs while four tasks are already going -- it is skipped, not queued, and the
//     next run is scheduled as normal;
//   * a routine overdue because the browser was closed runs ONCE, not once per missed interval. A
//     backlog storm on launch is the failure mode of every naive scheduler;
//   * the timer is a wall-clock timer, so a machine that slept past the hour fires on resume.
class RoutineStore : public KeyedService {
 public:
  enum class Kind {
    // Starts a new task.
    kCron,
    // Wakes an existing task.
    kHeartbeat,
    // Built in, one per profile: reviews the memory files (TaskStore::StartConsolidation). Daily, and
    // only when at least three extraction runs happened since the last one. Cannot be added or removed
    // by the user; it can be switched off and run now like any other.
    kConsolidate,
  };

  struct Routine {
    std::string id;
    std::string title;
    std::string prompt;
    Kind kind = Kind::kCron;
    // Minutes between runs. The whole schedule: no cron expression, because a field nobody can read
    // back to themselves is a field that runs the wrong thing at the wrong time.
    int every_minutes = 1440;
    mojom::PermissionMode mode = mojom::PermissionMode::kGuard;
    mojom::Effort effort = mojom::Effort::kStandard;
    bool enabled = true;
    // Heartbeat only: the task to wake.
    std::string task_id;
    int64_t last_run_ms = 0;
    int64_t next_run_ms = 0;
    // Why the last run did not happen, when it did not. Shown in Settings rather than swallowed: a
    // routine that silently does nothing is worse than one that says it was busy.
    std::string last_error;
  };

  RoutineStore(Profile* profile, TaskStore* tasks);
  RoutineStore(const RoutineStore&) = delete;
  RoutineStore& operator=(const RoutineStore&) = delete;
  ~RoutineStore() override;

  std::vector<Routine> List() const;
  // Returns the new routine's id, or empty when the request is unusable.
  std::string Add(const Routine& routine);
  bool Update(const Routine& routine);
  bool Remove(const std::string& id);
  bool SetEnabled(const std::string& id, bool enabled);
  // Runs one now, without disturbing its schedule. Returns the task it started or woke, or empty.
  std::string RunNow(const std::string& id);

 private:
  void Save(const std::vector<Routine>& routines);
  // Adds the built-in consolidation routine when the list has none. Returns true if it added one.
  static bool EnsureConsolidation(std::vector<Routine>& routines);
  // Arms the timer for the earliest enabled routine. One timer for all of them: a timer per routine
  // would be one more thing to keep consistent with a list the user edits.
  void Rearm();
  void OnTimer();
  std::string Fire(Routine& routine);

  raw_ptr<Profile> profile_;
  raw_ptr<TaskStore> tasks_;
  base::WallClockTimer timer_;
  base::WeakPtrFactory<RoutineStore> weak_factory_{this};
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_ROUTINE_STORE_H_
