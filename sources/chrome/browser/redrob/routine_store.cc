// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/resources/grit/redrob_strings.h"
#include "chrome/browser/redrob/routine_store.h"

#include <algorithm>

#include "base/functional/bind.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/redrob_prefs.h"
#include "chrome/browser/redrob/task_store.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/scoped_user_pref_update.h"
#include "ui/base/l10n/l10n_util.h"

namespace redrob {
namespace {

constexpr size_t kMaxRoutines = 50;
constexpr size_t kMaxPromptBytes = 4000;
constexpr size_t kMaxTitleBytes = 200;
// Ten minutes is the floor. Anything tighter is a poll, and a browser that opens a task every minute
// is a browser nobody leaves running.
constexpr int kMinMinutes = 10;
constexpr int kMaxMinutes = 60 * 24 * 30;

int64_t NowMs() {
  return base::Time::Now().InMillisecondsSinceUnixEpoch();
}

int ModeToInt(mojom::PermissionMode mode) {
  return static_cast<int>(mode);
}

mojom::PermissionMode IntToMode(int value) {
  switch (value) {
    case 0:
      return mojom::PermissionMode::kReadOnly;
    case 2:
      return mojom::PermissionMode::kFullAccess;
    default:
      // Guard for anything unrecognised, including a value a renderer made up. Defaulting a stored
      // permission UP would be the one bug in this file that matters.
      return mojom::PermissionMode::kGuard;
  }
}

mojom::Effort IntToEffort(int value) {
  switch (value) {
    case 0:
      return mojom::Effort::kQuick;
    case 2:
      return mojom::Effort::kUltrabrowse;
    default:
      return mojom::Effort::kStandard;
  }
}

RoutineStore::Routine FromDict(const base::DictValue& dict) {
  RoutineStore::Routine routine;
  if (const std::string* id = dict.FindString("id")) {
    routine.id = *id;
  }
  if (const std::string* title = dict.FindString("title")) {
    routine.title = *title;
  }
  if (const std::string* prompt = dict.FindString("prompt")) {
    routine.prompt = *prompt;
  }
  if (const std::string* task_id = dict.FindString("task_id")) {
    routine.task_id = *task_id;
  }
  if (const std::string* error = dict.FindString("last_error")) {
    routine.last_error = *error;
  }
  const std::string* kind = dict.FindString("kind");
  routine.kind = (kind && *kind == "heartbeat") ? RoutineStore::Kind::kHeartbeat
                                                : RoutineStore::Kind::kCron;
  routine.every_minutes =
      std::clamp(dict.FindInt("every_minutes").value_or(1440), kMinMinutes, kMaxMinutes);
  routine.mode = IntToMode(dict.FindInt("mode").value_or(1));
  routine.effort = IntToEffort(dict.FindInt("effort").value_or(1));
  routine.enabled = dict.FindBool("enabled").value_or(true);
  routine.last_run_ms = static_cast<int64_t>(dict.FindDouble("last_run_ms").value_or(0));
  routine.next_run_ms = static_cast<int64_t>(dict.FindDouble("next_run_ms").value_or(0));
  return routine;
}

base::DictValue ToDict(const RoutineStore::Routine& routine) {
  base::DictValue dict;
  dict.Set("id", routine.id);
  dict.Set("title", routine.title);
  dict.Set("prompt", routine.prompt);
  dict.Set("task_id", routine.task_id);
  dict.Set("last_error", routine.last_error);
  dict.Set("kind", routine.kind == RoutineStore::Kind::kHeartbeat ? "heartbeat" : "cron");
  dict.Set("every_minutes", routine.every_minutes);
  dict.Set("mode", ModeToInt(routine.mode));
  dict.Set("effort", static_cast<int>(routine.effort));
  dict.Set("enabled", routine.enabled);
  dict.Set("last_run_ms", static_cast<double>(routine.last_run_ms));
  dict.Set("next_run_ms", static_cast<double>(routine.next_run_ms));
  return dict;
}

}  // namespace

RoutineStore::RoutineStore(Profile* profile, TaskStore* tasks)
    : profile_(profile), tasks_(tasks) {
  // A routine whose next run is in the past because the browser was closed is brought forward to
  // "soon" rather than fired during startup: launching a task while the window is still being built
  // races the tab strip the task wants to open a tab in.
  std::vector<Routine> routines = List();
  const int64_t now = NowMs();
  bool changed = false;
  for (Routine& routine : routines) {
    if (routine.next_run_ms == 0) {
      routine.next_run_ms = now + base::Minutes(routine.every_minutes).InMilliseconds();
      changed = true;
    } else if (routine.next_run_ms < now) {
      // ONE catch-up run, thirty seconds after launch. Not one per interval missed.
      routine.next_run_ms = now + base::Seconds(30).InMilliseconds();
      changed = true;
    }
  }
  if (changed) {
    Save(routines);
  }
  Rearm();
}

RoutineStore::~RoutineStore() = default;

std::vector<RoutineStore::Routine> RoutineStore::List() const {
  std::vector<Routine> routines;
  if (!profile_) {
    return routines;
  }
  for (const base::Value& value : profile_->GetPrefs()->GetList(prefs::kRoutines)) {
    if (value.is_dict()) {
      routines.push_back(FromDict(value.GetDict()));
    }
  }
  return routines;
}

void RoutineStore::Save(const std::vector<Routine>& routines) {
  if (!profile_) {
    return;
  }
  base::ListValue list;
  for (const Routine& routine : routines) {
    list.Append(ToDict(routine));
  }
  profile_->GetPrefs()->SetList(prefs::kRoutines, std::move(list));
}

std::string RoutineStore::Add(const Routine& request) {
  if (!profile_ || request.prompt.empty() || request.prompt.size() > kMaxPromptBytes ||
      request.title.size() > kMaxTitleBytes) {
    return std::string();
  }
  // A heartbeat with no task to wake is not a routine, it is a routine that will fail every time it
  // fires. Refused at the point it is created, where the user can still see why.
  if (request.kind == Kind::kHeartbeat && request.task_id.empty()) {
    return std::string();
  }
  std::vector<Routine> routines = List();
  if (routines.size() >= kMaxRoutines) {
    return std::string();
  }
  Routine routine = request;
  routine.id = base::Uuid::GenerateRandomV4().AsLowercaseString();
  routine.every_minutes = std::clamp(routine.every_minutes, kMinMinutes, kMaxMinutes);
  routine.last_run_ms = 0;
  routine.last_error.clear();
  routine.next_run_ms = NowMs() + base::Minutes(routine.every_minutes).InMilliseconds();
  routines.push_back(routine);
  Save(routines);
  Rearm();
  return routine.id;
}

bool RoutineStore::Update(const Routine& request) {
  std::vector<Routine> routines = List();
  for (Routine& routine : routines) {
    if (routine.id != request.id) {
      continue;
    }
    if (request.prompt.empty() || request.prompt.size() > kMaxPromptBytes) {
      return false;
    }
    const int minutes = std::clamp(request.every_minutes, kMinMinutes, kMaxMinutes);
    // Changing the interval re-bases the next run from now. Keeping an old next_run_ms after the user
    // shortened the interval would make the change look ignored.
    const bool interval_changed = minutes != routine.every_minutes;
    routine.title = request.title.substr(0, kMaxTitleBytes);
    routine.prompt = request.prompt;
    routine.kind = request.kind;
    routine.every_minutes = minutes;
    routine.mode = request.mode;
    routine.effort = request.effort;
    routine.enabled = request.enabled;
    routine.task_id = request.task_id;
    if (interval_changed || routine.next_run_ms == 0) {
      routine.next_run_ms = NowMs() + base::Minutes(minutes).InMilliseconds();
    }
    Save(routines);
    Rearm();
    return true;
  }
  return false;
}

bool RoutineStore::Remove(const std::string& id) {
  std::vector<Routine> routines = List();
  const size_t before = routines.size();
  std::erase_if(routines, [&id](const Routine& routine) { return routine.id == id; });
  if (routines.size() == before) {
    return false;
  }
  Save(routines);
  Rearm();
  return true;
}

bool RoutineStore::SetEnabled(const std::string& id, bool enabled) {
  std::vector<Routine> routines = List();
  for (Routine& routine : routines) {
    if (routine.id == id) {
      routine.enabled = enabled;
      if (enabled) {
        routine.next_run_ms = NowMs() + base::Minutes(routine.every_minutes).InMilliseconds();
      }
      Save(routines);
      Rearm();
      return true;
    }
  }
  return false;
}

std::string RoutineStore::RunNow(const std::string& id) {
  std::vector<Routine> routines = List();
  for (Routine& routine : routines) {
    if (routine.id != id) {
      continue;
    }
    const std::string task_id = Fire(routine);
    Save(routines);
    Rearm();
    return task_id;
  }
  return std::string();
}

std::string RoutineStore::Fire(Routine& routine) {
  routine.last_run_ms = NowMs();
  routine.last_error.clear();
  if (!tasks_) {
    routine.last_error = l10n_util::GetStringUTF8(IDS_REDROB_SE_ROUTINE_ENGINE_UNAVAILABLE);
    return std::string();
  }
  if (routine.kind == Kind::kHeartbeat) {
    if (!tasks_->WakeTask(routine.task_id, routine.prompt)) {
      routine.last_error = l10n_util::GetStringUTF8(IDS_REDROB_SE_ROUTINE_CHAT_GONE);
      return std::string();
    }
    return routine.task_id;
  }
  const std::string task_id =
      tasks_->StartRoutineTask(routine.title, routine.prompt, routine.mode, routine.effort);
  if (task_id.empty()) {
    routine.last_error =
        "Skipped: too many tasks were already running, or the engine was unavailable.";
  }
  return task_id;
}

void RoutineStore::OnTimer() {
  std::vector<Routine> routines = List();
  const int64_t now = NowMs();
  for (Routine& routine : routines) {
    if (!routine.enabled || routine.next_run_ms > now) {
      continue;
    }
    Fire(routine);
    // Scheduled from NOW rather than from the run it was due at, which is what stops a routine that
    // fell behind from trying to catch up on every interval it missed.
    routine.next_run_ms = now + base::Minutes(routine.every_minutes).InMilliseconds();
  }
  Save(routines);
  Rearm();
}

void RoutineStore::Rearm() {
  timer_.Stop();
  int64_t earliest = 0;
  for (const Routine& routine : List()) {
    if (!routine.enabled || routine.next_run_ms == 0) {
      continue;
    }
    if (earliest == 0 || routine.next_run_ms < earliest) {
      earliest = routine.next_run_ms;
    }
  }
  if (earliest == 0) {
    return;
  }
  const base::Time when = base::Time::FromMillisecondsSinceUnixEpoch(
      static_cast<double>(std::max(earliest, NowMs() + 1000)));
  timer_.Start(FROM_HERE, when,
               base::BindOnce(&RoutineStore::OnTimer, weak_factory_.GetWeakPtr()));
}

}  // namespace redrob
