// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/memory_store.h"

#include <algorithm>
#include <set>

#include "base/functional/bind.h"
#include "base/strings/string_split.h"
#include "base/strings/string_util.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/redrob_prefs.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/scoped_user_pref_update.h"

namespace redrob {
namespace {

// One screen's worth, and a hard stop. Memory that outgrows the list that shows it has stopped being
// reviewable, and unreviewable memory is the failure mode this feature has to avoid.
constexpr size_t kMaxEntries = 200;
constexpr size_t kMaxTextBytes = 2000;
constexpr size_t kMinTokenLength = 3;

std::set<std::string> Tokens(const std::string& text) {
  std::set<std::string> tokens;
  for (const std::string& piece :
       base::SplitString(base::ToLowerASCII(text), " \t\n.,;:!?()[]{}\"'/\\-_",
                         base::TRIM_WHITESPACE, base::SPLIT_WANT_NONEMPTY)) {
    if (piece.size() >= kMinTokenLength) {
      tokens.insert(piece);
    }
  }
  return tokens;
}

int64_t NowMs() {
  return base::Time::Now().InMillisecondsSinceUnixEpoch();
}

MemoryStore::Entry EntryFromDict(const base::DictValue& dict) {
  MemoryStore::Entry entry;
  if (const std::string* id = dict.FindString("id")) {
    entry.id = *id;
  }
  if (const std::string* text = dict.FindString("text")) {
    entry.text = *text;
  }
  if (const std::string* source = dict.FindString("source")) {
    entry.source = *source;
  }
  // Stored as a double because prefs have no 64-bit integer type and an epoch in milliseconds does not
  // fit in the int one. Doubles hold this range exactly, so nothing is lost.
  entry.created_at_ms = static_cast<int64_t>(dict.FindDouble("created_ms").value_or(0));
  entry.pinned = dict.FindBool("pinned").value_or(false);
  return entry;
}

base::DictValue DictFromEntry(const MemoryStore::Entry& entry) {
  base::DictValue dict;
  dict.Set("id", entry.id);
  dict.Set("text", entry.text);
  dict.Set("source", entry.source);
  dict.Set("created_ms", static_cast<double>(entry.created_at_ms));
  dict.Set("pinned", entry.pinned);
  return dict;
}

}  // namespace

MemoryStore::MemoryStore(Profile* profile) : profile_(profile) {
  Sweep();
  ScheduleSweep();
}

MemoryStore::~MemoryStore() = default;

bool MemoryStore::enabled() const {
  return profile_ && profile_->GetPrefs()->GetBoolean(prefs::kMemoryEnabled);
}

int MemoryStore::retention_days() const {
  return profile_ ? profile_->GetPrefs()->GetInteger(prefs::kMemoryRetentionDays) : 0;
}

std::string MemoryStore::Remember(const std::string& text, const std::string& source) {
  if (!enabled()) {
    return std::string();
  }
  const std::string trimmed(base::TrimWhitespaceASCII(text, base::TRIM_ALL));
  if (trimmed.empty() || trimmed.size() > kMaxTextBytes) {
    return std::string();
  }

  ScopedListPrefUpdate update(profile_->GetPrefs(), prefs::kMemoryEntries);
  for (const base::Value& value : *update) {
    if (value.is_dict()) {
      const std::string* existing = value.GetDict().FindString("text");
      if (existing && *existing == trimmed) {
        // Already known. Returning the existing id rather than nothing lets the caller answer the
        // engine truthfully -- the fact is remembered, it just did not need remembering twice.
        const std::string* id = value.GetDict().FindString("id");
        return id ? *id : std::string();
      }
    }
  }

  Entry entry;
  entry.id = base::Uuid::GenerateRandomV4().AsLowercaseString();
  entry.text = trimmed;
  entry.source = source.substr(0, 200);
  entry.created_at_ms = NowMs();
  update->Append(DictFromEntry(entry));
  while (update->size() > kMaxEntries) {
    update->erase(update->begin());
  }
  return entry.id;
}

std::vector<MemoryStore::Entry> MemoryStore::Search(const std::string& query,
                                                    size_t limit) const {
  std::vector<Entry> hits;
  if (!enabled() || limit == 0) {
    return hits;
  }
  const std::set<std::string> wanted = Tokens(query);
  if (wanted.empty()) {
    return hits;
  }

  std::vector<std::pair<size_t, Entry>> scored;
  for (const base::Value& value : profile_->GetPrefs()->GetList(prefs::kMemoryEntries)) {
    if (!value.is_dict()) {
      continue;
    }
    Entry entry = EntryFromDict(value.GetDict());
    const std::set<std::string> have = Tokens(entry.text);
    size_t score = 0;
    for (const std::string& token : wanted) {
      if (have.count(token)) {
        ++score;
      }
    }
    // A pinned entry is one the user said matters, so it needs less overlap to be worth surfacing --
    // but it still needs some, or every search would return it.
    if (score == 0) {
      continue;
    }
    if (entry.pinned) {
      ++score;
    }
    scored.emplace_back(score, std::move(entry));
  }
  std::stable_sort(scored.begin(), scored.end(),
                   [](const auto& a, const auto& b) { return a.first > b.first; });
  for (auto& [score, entry] : scored) {
    if (hits.size() >= limit) {
      break;
    }
    hits.push_back(std::move(entry));
  }
  return hits;
}

std::vector<MemoryStore::Entry> MemoryStore::List() const {
  std::vector<Entry> entries;
  if (!profile_) {
    return entries;
  }
  // Newest first, which is the order someone auditing this reads it in.
  for (const base::Value& value : profile_->GetPrefs()->GetList(prefs::kMemoryEntries)) {
    if (value.is_dict()) {
      entries.push_back(EntryFromDict(value.GetDict()));
    }
  }
  std::reverse(entries.begin(), entries.end());
  return entries;
}

bool MemoryStore::Remove(const std::string& id) {
  if (!profile_ || id.empty()) {
    return false;
  }
  ScopedListPrefUpdate update(profile_->GetPrefs(), prefs::kMemoryEntries);
  for (auto it = update->begin(); it != update->end(); ++it) {
    if (!it->is_dict()) {
      continue;
    }
    const std::string* existing = it->GetDict().FindString("id");
    if (existing && *existing == id) {
      update->erase(it);
      return true;
    }
  }
  return false;
}

bool MemoryStore::SetPinned(const std::string& id, bool pinned) {
  if (!profile_ || id.empty()) {
    return false;
  }
  ScopedListPrefUpdate update(profile_->GetPrefs(), prefs::kMemoryEntries);
  for (base::Value& value : *update) {
    if (!value.is_dict()) {
      continue;
    }
    const std::string* existing = value.GetDict().FindString("id");
    if (existing && *existing == id) {
      value.GetDict().Set("pinned", pinned);
      return true;
    }
  }
  return false;
}

void MemoryStore::Clear() {
  if (profile_) {
    // Everything, pinned included. "Forget everything" that quietly kept some of it would be a lie
    // told at the exact moment the user was trying to be sure.
    profile_->GetPrefs()->SetList(prefs::kMemoryEntries, base::ListValue());
  }
}

void MemoryStore::SetEnabled(bool enabled) {
  if (profile_) {
    profile_->GetPrefs()->SetBoolean(prefs::kMemoryEnabled, enabled);
  }
}

void MemoryStore::SetRetentionDays(int days) {
  if (!profile_) {
    return;
  }
  // Clamped rather than trusted: this arrives from a renderer, and a negative window would make the
  // sweep delete everything.
  profile_->GetPrefs()->SetInteger(prefs::kMemoryRetentionDays, std::clamp(days, 0, 3650));
  Sweep();
}

void MemoryStore::Sweep() {
  if (!profile_) {
    return;
  }
  const int days = retention_days();
  ScopedListPrefUpdate update(profile_->GetPrefs(), prefs::kMemoryEntries);
  if (days > 0) {
    const int64_t cutoff = NowMs() - base::Days(days).InMilliseconds();
    update->EraseIf([cutoff](const base::Value& value) {
      if (!value.is_dict()) {
        return true;
      }
      if (value.GetDict().FindBool("pinned").value_or(false)) {
        return false;
      }
      return static_cast<int64_t>(value.GetDict().FindDouble("created_ms").value_or(0)) < cutoff;
    });
  }
  while (update->size() > kMaxEntries) {
    update->erase(update->begin());
  }
}

void MemoryStore::ScheduleSweep() {
  // A wall-clock timer, so a laptop that was asleep past the boundary sweeps on resume instead of
  // waiting out the remainder of a suspended tick count.
  sweep_timer_.Start(FROM_HERE, base::Time::Now() + base::Days(1),
                     base::BindOnce(
                         [](base::WeakPtr<MemoryStore> store) {
                           if (!store) {
                             return;
                           }
                           store->Sweep();
                           store->ScheduleSweep();
                         },
                         weak_factory_.GetWeakPtr()));
}

}  // namespace redrob
