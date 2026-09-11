// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_MEMORY_STORE_H_
#define CHROME_BROWSER_REDROB_MEMORY_STORE_H_

#include <string>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/timer/wall_clock_timer.h"
#include "components/keyed_service/core/keyed_service.h"

class Profile;

namespace redrob {

// What the agent is allowed to remember between tasks.
//
// Prefs, not a database. That is a deliberate ceiling rather than a shortcut: memory the user cannot
// read and delete in one screen is memory they cannot reason about, and a store bounded small enough
// to render in one list is a store that stays reviewable. When this stops being enough the honest move
// is a paged UI first and a database second.
//
// Nothing is remembered implicitly. An entry exists because the agent called `remember` while working
// on a task the user asked for, and every entry carries the task's prompt as its source so the answer
// to "why do you know that" is in the row.
class MemoryStore : public KeyedService {
 public:
  struct Entry {
    std::string id;
    std::string text;
    // The task that produced it, in the user's own words.
    std::string source;
    int64_t created_at_ms = 0;
    // Pinned entries survive the retention sweep. The user's decision, never the agent's.
    bool pinned = false;
  };

  explicit MemoryStore(Profile* profile);
  MemoryStore(const MemoryStore&) = delete;
  MemoryStore& operator=(const MemoryStore&) = delete;
  ~MemoryStore() override;

  // False when memory is switched off, which is the one case a caller must not treat as failure.
  bool enabled() const;

  // Returns the new entry's id, or empty when memory is off or the text is unusable. Deduplicates on
  // exact text: an agent that re-learns the same fact each task should not fill the list with it.
  std::string Remember(const std::string& text, const std::string& source);

  // The entries most relevant to `query`, best first, at most `limit`. Token overlap, deliberately:
  // a fork does not get an embedding model for free, and a naive scorer that the user can see the
  // consequences of beats a clever one whose misses are unexplainable.
  std::vector<Entry> Search(const std::string& query, size_t limit) const;

  std::vector<Entry> List() const;
  bool Remove(const std::string& id);
  bool SetPinned(const std::string& id, bool pinned);
  void Clear();

  // Retention in days; 0 means keep until deleted. Setting it sweeps immediately, because a user who
  // has just chosen 30 days expects the 90-day entries to be gone now rather than tomorrow.
  int retention_days() const;
  void SetRetentionDays(int days);
  void SetEnabled(bool enabled);

 private:
  // Drops unpinned entries older than the retention window, and trims to the size ceiling. Runs at
  // construction and once a day after that.
  void Sweep();
  void ScheduleSweep();

  raw_ptr<Profile> profile_;
  base::WallClockTimer sweep_timer_;
  base::WeakPtrFactory<MemoryStore> weak_factory_{this};
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_MEMORY_STORE_H_
