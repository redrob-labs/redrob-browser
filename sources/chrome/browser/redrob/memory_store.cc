// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/memory_store.h"

#include <algorithm>
#include <map>
#include <set>
#include <utility>

#include "base/files/file_enumerator.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_split.h"
#include "base/strings/string_util.h"
#include "base/strings/stringprintf.h"
#include "base/task/thread_pool.h"
#include "base/time/time.h"
#include "base/values.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/redrob_prefs.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/scoped_user_pref_update.h"

namespace redrob {
namespace {

constexpr size_t kMinTokenLength = 3;
constexpr size_t kMaxPathBytes = 200;
constexpr size_t kMaxSnippetBytes = 240;
constexpr char kSnapshotsDir[] = ".snapshots";
constexpr char kEpisodicDir[] = "episodic";

constexpr char kIndexHeader[] =
    "# Memory index\n\n"
    "One line per file: what it holds. Rewritten by consolidation.\n\n"
    "- USER.md: who the user is\n";
constexpr char kUserHeader[] = "# About the user\n\n";

int64_t NowMs() {
  return base::Time::Now().InMillisecondsSinceUnixEpoch();
}

std::set<std::string> Tokens(std::string_view text) {
  std::set<std::string> tokens;
  for (const std::string& piece :
       base::SplitString(base::ToLowerASCII(text), " \t\n.,;:!?()[]{}\"'/\\-_#*`|<>=",
                         base::TRIM_WHITESPACE, base::SPLIT_WANT_NONEMPTY)) {
    if (piece.size() >= kMinTokenLength) {
      tokens.insert(piece);
    }
  }
  return tokens;
}

std::vector<std::string> Lines(std::string_view text) {
  return base::SplitString(text, "\n", base::KEEP_WHITESPACE, base::SPLIT_WANT_ALL);
}

// +/- as a multiset difference of lines. Not a real diff -- a moved line counts as unchanged -- but it is
// the number a reviewer wants: how much did this run add, and how much did it take away.
std::pair<int, int> LineDelta(const std::string& before, const std::string& after) {
  std::map<std::string, int> counts;
  if (!before.empty()) {
    for (const std::string& line : Lines(before)) {
      ++counts[line];
    }
  }
  int added = 0;
  if (!after.empty()) {
    for (const std::string& line : Lines(after)) {
      auto it = counts.find(line);
      if (it != counts.end() && it->second > 0) {
        --it->second;
      } else {
        ++added;
      }
    }
  }
  int removed = 0;
  for (const auto& [line, count] : counts) {
    removed += count;
  }
  return {added, removed};
}

std::string DateName(base::Time time) {
  base::Time::Exploded exploded;
  time.LocalExplode(&exploded);
  return base::StringPrintf("%04d-%02d-%02d", exploded.year, exploded.month,
                            exploded.day_of_month);
}

const char* KindName(MemoryStore::RunKind kind) {
  switch (kind) {
    case MemoryStore::RunKind::kExtract:
      return "extract";
    case MemoryStore::RunKind::kConsolidate:
      return "consolidate";
    case MemoryStore::RunKind::kUser:
      return "user";
    case MemoryStore::RunKind::kRevert:
      return "revert";
  }
  return "extract";
}

MemoryStore::RunKind KindFromName(const std::string& name) {
  if (name == "consolidate") {
    return MemoryStore::RunKind::kConsolidate;
  }
  if (name == "user") {
    return MemoryStore::RunKind::kUser;
  }
  if (name == "revert") {
    return MemoryStore::RunKind::kRevert;
  }
  return MemoryStore::RunKind::kExtract;
}

MemoryStore::Run RunFromDict(const base::DictValue& dict) {
  MemoryStore::Run run;
  if (const std::string* id = dict.FindString("id")) {
    run.id = *id;
  }
  if (const std::string* kind = dict.FindString("kind")) {
    run.kind = KindFromName(*kind);
  }
  // Doubles because prefs have no 64-bit integer type; they hold this range exactly.
  run.started_ms = static_cast<int64_t>(dict.FindDouble("started_ms").value_or(0));
  run.duration_ms = static_cast<int64_t>(dict.FindDouble("duration_ms").value_or(0));
  run.tokens = static_cast<int64_t>(dict.FindDouble("tokens").value_or(0));
  run.finished = dict.FindBool("finished").value_or(false);
  run.has_snapshot = dict.FindBool("has_snapshot").value_or(false);
  if (const base::ListValue* files = dict.FindList("files")) {
    for (const base::Value& value : *files) {
      const base::DictValue* file = value.GetIfDict();
      if (!file) {
        continue;
      }
      MemoryStore::FileChange change;
      if (const std::string* path = file->FindString("path")) {
        change.path = *path;
      }
      change.added = file->FindInt("added").value_or(0);
      change.removed = file->FindInt("removed").value_or(0);
      run.files.push_back(std::move(change));
    }
  }
  return run;
}

base::DictValue DictFromRun(const MemoryStore::Run& run) {
  base::DictValue dict;
  dict.Set("id", run.id);
  dict.Set("kind", KindName(run.kind));
  dict.Set("started_ms", static_cast<double>(run.started_ms));
  dict.Set("duration_ms", static_cast<double>(run.duration_ms));
  dict.Set("tokens", static_cast<double>(run.tokens));
  dict.Set("finished", run.finished);
  dict.Set("has_snapshot", run.has_snapshot);
  base::ListValue files;
  for (const MemoryStore::FileChange& change : run.files) {
    base::DictValue file;
    file.Set("path", change.path);
    file.Set("added", change.added);
    file.Set("removed", change.removed);
    files.Append(std::move(file));
  }
  dict.Set("files", std::move(files));
  return dict;
}

// --- Blocking side. Everything below runs on file_runner_ and only there. ----------------------------

base::FilePath Resolve(const base::FilePath& root, const std::string& relative) {
  return root.Append(base::FilePath::FromUTF8Unsafe(relative));
}

void EnsureLayout(const base::FilePath& root) {
  if (!base::DirectoryExists(root)) {
    base::CreateDirectory(root);
  }
  for (const char* dir : {kEpisodicDir, "sites", "people", "projects"}) {
    const base::FilePath sub = root.AppendASCII(dir);
    if (!base::DirectoryExists(sub)) {
      base::CreateDirectory(sub);
    }
  }
  const base::FilePath index = root.AppendASCII("MEMORY.md");
  if (!base::PathExists(index)) {
    base::WriteFile(index, kIndexHeader);
  }
  const base::FilePath user = root.AppendASCII("USER.md");
  if (!base::PathExists(user)) {
    base::WriteFile(user, kUserHeader);
  }
}

// Every .md under the root except the snapshots. The relative path is re-validated, so a file someone
// dropped in by hand with a name the tools would refuse is not listed either: what the agent cannot
// address, it should not be shown.
std::vector<MemoryStore::FileInfo> ListTree(const base::FilePath& root) {
  std::vector<MemoryStore::FileInfo> out;
  if (!base::DirectoryExists(root)) {
    return out;
  }
  base::FileEnumerator walk(root, /*recursive=*/true, base::FileEnumerator::FILES);
  for (base::FilePath file = walk.Next(); !file.empty(); file = walk.Next()) {
    base::FilePath relative;
    if (!root.AppendRelativePath(file, &relative)) {
      continue;
    }
    const std::string path = relative.NormalizePathSeparatorsTo('/').AsUTF8Unsafe();
    std::optional<std::string> valid = MemoryStore::ValidatePath(path);
    if (!valid) {
      continue;
    }
    const base::FileEnumerator::FileInfo info = walk.GetInfo();
    MemoryStore::FileInfo entry;
    entry.path = *valid;
    entry.bytes = info.GetSize();
    entry.modified_ms = info.GetLastModifiedTime().InMillisecondsSinceUnixEpoch();
    out.push_back(std::move(entry));
  }
  std::sort(out.begin(), out.end(),
            [](const auto& a, const auto& b) { return a.path < b.path; });
  return out;
}

std::vector<MemoryStore::FileInfo> IndexOnDisk(base::FilePath root) {
  EnsureLayout(root);
  return ListTree(root);
}

int64_t TotalBytes(const std::vector<MemoryStore::FileInfo>& files) {
  int64_t total = 0;
  for (const auto& file : files) {
    total += file.bytes;
  }
  return total;
}

// Copies the live tree into .snapshots/<run_id>/. The directory is created even for an empty tree, so
// "this run has a snapshot" never depends on whether there was anything to copy.
bool Snapshot(const base::FilePath& root, const std::string& run_id) {
  const base::FilePath target = root.AppendASCII(kSnapshotsDir).AppendASCII(run_id);
  if (base::DirectoryExists(target)) {
    return true;
  }
  if (!base::CreateDirectory(target)) {
    return false;
  }
  for (const MemoryStore::FileInfo& file : ListTree(root)) {
    const base::FilePath to = Resolve(target, file.path);
    if (!base::CreateDirectory(to.DirName()) || !base::CopyFile(Resolve(root, file.path), to)) {
      return false;
    }
  }
  return true;
}

// Keeps the snapshots whose run rows are still kept, and nothing else.
void PruneSnapshots(const base::FilePath& root, const std::set<std::string>& keep) {
  const base::FilePath dir = root.AppendASCII(kSnapshotsDir);
  if (!base::DirectoryExists(dir)) {
    return;
  }
  base::FileEnumerator walk(dir, /*recursive=*/false, base::FileEnumerator::DIRECTORIES);
  for (base::FilePath sub = walk.Next(); !sub.empty(); sub = walk.Next()) {
    if (!keep.count(sub.BaseName().AsUTF8Unsafe())) {
      base::DeletePathRecursively(sub);
    }
  }
}

}  // namespace

struct MemoryStore::ChangeResult {
  bool ok = false;
  std::string message;
  bool snapshotted = false;
  FileChange change;
  std::vector<FileInfo> files;
};

namespace {

MemoryStore::ChangeResult ChangeOnDisk(base::FilePath root,
                                       std::string run_id,
                                       bool needs_snapshot,
                                       int op,
                                       std::string path,
                                       std::string content,
                                       std::string old_text) {
  MemoryStore::ChangeResult result;
  EnsureLayout(root);
  const base::FilePath file = Resolve(root, path);

  std::string before;
  const bool exists = base::PathExists(file);
  if (exists && !base::ReadFileToStringWithMaxSize(file, &before, MemoryStore::kMaxFileBytes * 2)) {
    result.message = "That memory file could not be read.";
    result.files = ListTree(root);
    return result;
  }

  // 0 = write, 1 = edit, 2 = delete; matches MemoryStore::Op.
  std::string after;
  if (op == 0) {
    after = content;
  } else if (op == 1) {
    if (!exists) {
      result.message = "There is no memory file at " + path + ". Use memory_write to create it.";
      result.files = ListTree(root);
      return result;
    }
    if (old_text.empty()) {
      result.message = "memory_edit needs the exact text to replace.";
      result.files = ListTree(root);
      return result;
    }
    const size_t first = before.find(old_text);
    if (first == std::string::npos) {
      result.message = "That text is not in " + path + ". Read the file and copy it exactly.";
      result.files = ListTree(root);
      return result;
    }
    if (before.find(old_text, first + old_text.size()) != std::string::npos) {
      result.message = "That text appears more than once in " + path +
                       ". Include more of the surrounding line so it matches once.";
      result.files = ListTree(root);
      return result;
    }
    after = before;
    after.replace(first, old_text.size(), content);
  } else if (!exists) {
    result.ok = true;
    result.files = ListTree(root);
    return result;
  }

  if (op != 2) {
    if (after.size() > MemoryStore::kMaxFileBytes) {
      result.message = "A memory file may hold at most 64 KiB. Summarise, or split it into files.";
      result.files = ListTree(root);
      return result;
    }
    const std::vector<MemoryStore::FileInfo> current = ListTree(root);
    const int64_t total = TotalBytes(current) - static_cast<int64_t>(before.size()) +
                          static_cast<int64_t>(after.size());
    if (total > static_cast<int64_t>(MemoryStore::kMaxTotalBytes)) {
      result.message =
          "Memory is full (4 MiB in all). Consolidate or delete older episodic files first.";
      result.files = current;
      return result;
    }
  }

  // Snapshot BEFORE the first write of the run, on this same sequence, so nothing can land between.
  if (needs_snapshot) {
    if (!Snapshot(root, run_id)) {
      result.message = "Memory could not be snapshotted, so nothing was changed.";
      result.files = ListTree(root);
      return result;
    }
    result.snapshotted = true;
  }

  bool written = false;
  if (op == 2) {
    written = base::DeleteFile(file);
  } else {
    written = base::CreateDirectory(file.DirName()) && base::WriteFile(file, after);
  }
  if (!written) {
    result.message = "That memory file could not be written.";
    result.files = ListTree(root);
    return result;
  }

  const auto [added, removed] = LineDelta(before, after);
  result.ok = true;
  result.change.path = path;
  result.change.added = added;
  result.change.removed = removed;
  result.files = ListTree(root);
  return result;
}

std::optional<std::string> ReadOnDisk(base::FilePath root, std::string path) {
  EnsureLayout(root);
  std::string content;
  if (!base::ReadFileToStringWithMaxSize(Resolve(root, path), &content,
                                         MemoryStore::kMaxFileBytes * 2)) {
    return std::nullopt;
  }
  return content;
}

std::vector<MemoryStore::SearchHit> SearchOnDisk(base::FilePath root,
                                                 std::string query,
                                                 size_t limit) {
  std::vector<MemoryStore::SearchHit> hits;
  const std::set<std::string> wanted = Tokens(query);
  if (wanted.empty() || limit == 0) {
    return hits;
  }
  struct Scored {
    size_t score;
    MemoryStore::SearchHit hit;
  };
  std::vector<Scored> scored;
  for (const MemoryStore::FileInfo& file : ListTree(root)) {
    std::string content;
    if (!base::ReadFileToStringWithMaxSize(Resolve(root, file.path), &content,
                                           MemoryStore::kMaxFileBytes * 2)) {
      continue;
    }
    // The file's name counts as part of every line in it: a search for a site should find its file.
    const std::set<std::string> name_tokens = Tokens(file.path);
    int number = 0;
    for (const std::string& line : Lines(content)) {
      ++number;
      const std::string_view trimmed = base::TrimWhitespaceASCII(line, base::TRIM_ALL);
      if (trimmed.empty() || trimmed.front() == '#') {
        continue;
      }
      const std::set<std::string> have = Tokens(trimmed);
      size_t score = 0;
      for (const std::string& token : wanted) {
        if (have.count(token)) {
          score += 2;
        } else if (name_tokens.count(token)) {
          score += 1;
        }
      }
      if (score == 0) {
        continue;
      }
      MemoryStore::SearchHit hit;
      hit.path = file.path;
      hit.line = number;
      hit.snippet = std::string(trimmed.substr(0, kMaxSnippetBytes));
      scored.push_back({score, std::move(hit)});
    }
  }
  std::stable_sort(scored.begin(), scored.end(),
                   [](const Scored& a, const Scored& b) { return a.score > b.score; });
  for (Scored& entry : scored) {
    if (hits.size() >= limit) {
      break;
    }
    hits.push_back(std::move(entry.hit));
  }
  return hits;
}

MemoryStore::ChangeResult RevertOnDisk(base::FilePath root,
                                       std::string target_run_id,
                                       std::string revert_run_id) {
  MemoryStore::ChangeResult result;
  const base::FilePath source = root.AppendASCII(kSnapshotsDir).AppendASCII(target_run_id);
  if (!base::DirectoryExists(source)) {
    result.message = "That run's snapshot is no longer kept.";
    result.files = ListTree(root);
    return result;
  }
  // The revert is a run of its own, so the state it replaces is snapshotted and can come back.
  if (!Snapshot(root, revert_run_id)) {
    result.message = "Memory could not be snapshotted, so nothing was reverted.";
    result.files = ListTree(root);
    return result;
  }
  result.snapshotted = true;
  for (const MemoryStore::FileInfo& file : ListTree(root)) {
    base::DeleteFile(Resolve(root, file.path));
  }
  for (const MemoryStore::FileInfo& file : ListTree(source)) {
    const base::FilePath to = Resolve(root, file.path);
    base::CreateDirectory(to.DirName());
    base::CopyFile(Resolve(source, file.path), to);
  }
  EnsureLayout(root);
  result.ok = true;
  result.files = ListTree(root);
  return result;
}

std::vector<MemoryStore::FileInfo> SweepOnDisk(base::FilePath root,
                                               int days,
                                               std::set<std::string> keep_snapshots) {
  EnsureLayout(root);
  if (days > 0) {
    // Episodic files are named for their day, so the name IS the age; the mtime is not, because
    // extraction appends to today's file and a revert copies files back with a fresh mtime.
    const std::string cutoff = DateName(base::Time::Now() - base::Days(days));
    base::FileEnumerator walk(root.AppendASCII(kEpisodicDir), /*recursive=*/false,
                              base::FileEnumerator::FILES, FILE_PATH_LITERAL("*.md"));
    for (base::FilePath file = walk.Next(); !file.empty(); file = walk.Next()) {
      const std::string name = file.BaseName().RemoveFinalExtension().AsUTF8Unsafe();
      if (name.size() == 10 && name < cutoff) {
        base::DeleteFile(file);
      }
    }
  }
  PruneSnapshots(root, keep_snapshots);
  return ListTree(root);
}

struct LegacyEntry {
  std::string text;
  std::string source;
  int64_t created_ms = 0;
  bool pinned = false;
};

std::vector<MemoryStore::FileInfo> MigrateOnDisk(base::FilePath root,
                                                 std::vector<LegacyEntry> entries) {
  EnsureLayout(root);
  std::map<std::string, std::string> episodic;
  std::string user;
  for (const LegacyEntry& entry : entries) {
    const std::string line = "- " + entry.text +
                             (entry.source.empty() ? std::string() : " (from: " + entry.source + ")") +
                             "\n";
    if (entry.pinned) {
      user += line;
      continue;
    }
    const base::Time created = entry.created_ms > 0
                                   ? base::Time::FromMillisecondsSinceUnixEpoch(
                                         static_cast<double>(entry.created_ms))
                                   : base::Time::Now();
    episodic[DateName(created)] += line;
  }
  for (const auto& [day, lines] : episodic) {
    const base::FilePath file = root.AppendASCII(kEpisodicDir).AppendASCII(day + ".md");
    std::string existing;
    if (!base::ReadFileToString(file, &existing)) {
      existing = "# " + day + "\n\n";
    }
    base::WriteFile(file, existing + lines);
  }
  if (!user.empty()) {
    const base::FilePath file = root.AppendASCII("USER.md");
    std::string existing;
    base::ReadFileToString(file, &existing);
    base::WriteFile(file, existing + user);
  }
  return ListTree(root);
}

void ClearOnDisk(base::FilePath root) {
  base::DeletePathRecursively(root);
  EnsureLayout(root);
}

}  // namespace

// static
std::optional<std::string> MemoryStore::ValidatePath(const std::string& raw) {
  const std::string path(base::TrimWhitespaceASCII(raw, base::TRIM_ALL));
  if (path.empty() || path.size() > kMaxPathBytes || path.front() == '/' || path.back() == '/') {
    return std::nullopt;
  }
  // The character class is the traversal check: no backslash, no colon, no drive letter, no NUL.
  for (char c : path) {
    const bool allowed = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' ||
                         c == '_' || c == '/' || c == '.';
    // The two upper-case names the layout defines are allowed; nothing else upper-case is.
    if (!allowed && !(path == "MEMORY.md" || path == "USER.md")) {
      return std::nullopt;
    }
  }
  if (!base::EndsWith(path, ".md")) {
    return std::nullopt;
  }
  for (const std::string& segment :
       base::SplitString(path, "/", base::KEEP_WHITESPACE, base::SPLIT_WANT_ALL)) {
    // Empty ("a//b"), "." and ".." are refused, and so is any segment starting with a dot: that is
    // what keeps .snapshots out of reach of the tools.
    if (segment.empty() || segment.front() == '.') {
      return std::nullopt;
    }
  }
  return path;
}

MemoryStore::MemoryStore(Profile* profile)
    : profile_(profile),
      file_runner_(base::ThreadPool::CreateSequencedTaskRunner(
          {base::MayBlock(), base::TaskPriority::USER_VISIBLE,
           // A write that has started finishes: half a memory file is worse than a late one.
           base::TaskShutdownBehavior::BLOCK_SHUTDOWN})) {
  if (profile_) {
    root_ = profile_->GetPath().AppendASCII("Redrob").AppendASCII("memory");
  }
  MigrateFromPrefs();
  Sweep();
  ScheduleSweep();
}

MemoryStore::~MemoryStore() = default;

bool MemoryStore::enabled() const {
  return profile_ && profile_->GetPrefs()->GetBoolean(prefs::kMemoryEnabled);
}

void MemoryStore::SetEnabled(bool enabled) {
  if (profile_) {
    profile_->GetPrefs()->SetBoolean(prefs::kMemoryEnabled, enabled);
  }
}

int MemoryStore::retention_days() const {
  return profile_ ? profile_->GetPrefs()->GetInteger(prefs::kMemoryRetentionDays) : 0;
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

bool MemoryStore::history_input() const {
  return profile_ && profile_->GetPrefs()->GetBoolean(prefs::kMemoryHistoryInput);
}

void MemoryStore::SetHistoryInput(bool enabled) {
  if (profile_) {
    profile_->GetPrefs()->SetBoolean(prefs::kMemoryHistoryInput, enabled);
  }
}

std::string MemoryStore::BeginRun(RunKind kind) {
  // Unix milliseconds, bumped past the previous id so two runs in one millisecond never share a
  // snapshot directory.
  int64_t now = NowMs();
  for (const Run& run : Runs()) {
    int64_t existing = 0;
    if (base::StringToInt64(run.id, &existing)) {
      last_run_id_ms_ = std::max(last_run_id_ms_, existing);
    }
  }
  if (now <= last_run_id_ms_) {
    now = last_run_id_ms_ + 1;
  }
  last_run_id_ms_ = now;

  Run run;
  run.id = base::NumberToString(now);
  run.kind = kind;
  run.started_ms = NowMs();
  if (profile_) {
    ScopedListPrefUpdate update(profile_->GetPrefs(), prefs::kMemoryRuns);
    update->Append(DictFromRun(run));
    while (update->size() > kMaxRuns) {
      update->erase(update->begin());
    }
  }
  return run.id;
}

void MemoryStore::EndRun(const std::string& run_id, int64_t tokens) {
  std::optional<Run> run = FindRun(run_id);
  if (!run || run->finished) {
    return;
  }
  run->finished = true;
  run->duration_ms = std::max<int64_t>(0, NowMs() - run->started_ms);
  run->tokens = tokens;
  SaveRun(*run);
  // Snapshots beyond the kept runs go now rather than at the next daily sweep.
  if (!root_.empty()) {
    std::set<std::string> keep;
    for (const Run& kept : Runs()) {
      keep.insert(kept.id);
    }
    file_runner_->PostTask(FROM_HERE, base::BindOnce(&PruneSnapshots, root_, std::move(keep)));
  }
  if (run->kind == RunKind::kConsolidate && profile_) {
    profile_->GetPrefs()->SetDouble(prefs::kMemoryLastConsolidationMs,
                                    static_cast<double>(run->started_ms));
  }
}

std::vector<MemoryStore::Run> MemoryStore::Runs() const {
  std::vector<Run> runs;
  if (!profile_) {
    return runs;
  }
  for (const base::Value& value : profile_->GetPrefs()->GetList(prefs::kMemoryRuns)) {
    if (value.is_dict()) {
      runs.push_back(RunFromDict(value.GetDict()));
    }
  }
  std::reverse(runs.begin(), runs.end());
  return runs;
}

int64_t MemoryStore::last_consolidation_ms() const {
  return profile_ ? static_cast<int64_t>(
                        profile_->GetPrefs()->GetDouble(prefs::kMemoryLastConsolidationMs))
                  : 0;
}

int MemoryStore::ExtractionRunsSinceConsolidation() const {
  const int64_t since = last_consolidation_ms();
  int count = 0;
  for (const Run& run : Runs()) {
    if (run.kind == RunKind::kExtract && run.finished && run.started_ms > since) {
      ++count;
    }
  }
  return count;
}

std::optional<MemoryStore::Run> MemoryStore::FindRun(const std::string& run_id) const {
  if (!profile_ || run_id.empty()) {
    return std::nullopt;
  }
  for (const base::Value& value : profile_->GetPrefs()->GetList(prefs::kMemoryRuns)) {
    if (value.is_dict()) {
      const std::string* id = value.GetDict().FindString("id");
      if (id && *id == run_id) {
        return RunFromDict(value.GetDict());
      }
    }
  }
  return std::nullopt;
}

void MemoryStore::SaveRun(const Run& run) {
  if (!profile_) {
    return;
  }
  ScopedListPrefUpdate update(profile_->GetPrefs(), prefs::kMemoryRuns);
  for (base::Value& value : *update) {
    if (!value.is_dict()) {
      continue;
    }
    const std::string* id = value.GetDict().FindString("id");
    if (id && *id == run.id) {
      value = base::Value(DictFromRun(run));
      return;
    }
  }
}

void MemoryStore::ReadFile(const std::string& path, ReadCallback callback) {
  std::optional<std::string> valid = ValidatePath(path);
  if (!valid || root_.empty()) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  file_runner_->PostTaskAndReplyWithResult(FROM_HERE,
                                           base::BindOnce(&ReadOnDisk, root_, *valid),
                                           std::move(callback));
}

void MemoryStore::WriteFile(const std::string& run_id,
                            const std::string& path,
                            const std::string& content,
                            DoneCallback callback) {
  Change(run_id, Op::kWrite, path, content, std::string(), std::move(callback));
}

void MemoryStore::EditFile(const std::string& run_id,
                           const std::string& path,
                           const std::string& old_text,
                           const std::string& new_text,
                           DoneCallback callback) {
  Change(run_id, Op::kEdit, path, new_text, old_text, std::move(callback));
}

void MemoryStore::DeleteFile(const std::string& run_id,
                             const std::string& path,
                             DoneCallback callback) {
  Change(run_id, Op::kDelete, path, std::string(), std::string(), std::move(callback));
}

void MemoryStore::Change(const std::string& run_id,
                         Op op,
                         const std::string& path,
                         const std::string& content,
                         const std::string& old_text,
                         DoneCallback callback) {
  std::optional<Run> run = FindRun(run_id);
  if (!run || run->finished) {
    // No run, no write. This is the boundary: nothing reaches the disk without a run row to show for it.
    std::move(callback).Run(false, "There is no open memory run for that change.");
    return;
  }
  std::optional<std::string> valid = ValidatePath(path);
  if (!valid || root_.empty()) {
    std::move(callback).Run(
        false,
        "That is not a memory path. Use a relative path ending in .md, with only lower-case letters, "
        "digits, '-', '_' and '/', for example sites/example.com.md or episodic/2026-01-31.md.");
    return;
  }
  const bool needs_snapshot = !run->has_snapshot;
  if (needs_snapshot) {
    // Marked now rather than on reply: a second change in the same run is posted behind this one on the
    // same sequence, so it must not ask for a second snapshot of a tree the first one already changed.
    run->has_snapshot = true;
    SaveRun(*run);
  }
  file_runner_->PostTaskAndReplyWithResult(
      FROM_HERE,
      base::BindOnce(&ChangeOnDisk, root_, run_id, needs_snapshot, static_cast<int>(op), *valid,
                     content, old_text),
      base::BindOnce(&MemoryStore::OnChanged, weak_factory_.GetWeakPtr(), run_id,
                     std::move(callback)));
}

void MemoryStore::OnChanged(std::string run_id, DoneCallback callback, ChangeResult result) {
  files_ = std::move(result.files);
  if (result.ok && !result.change.path.empty()) {
    if (std::optional<Run> run = FindRun(run_id)) {
      auto existing = std::find_if(run->files.begin(), run->files.end(),
                                   [&](const FileChange& c) { return c.path == result.change.path; });
      if (existing == run->files.end()) {
        run->files.push_back(result.change);
      } else {
        existing->added += result.change.added;
        existing->removed += result.change.removed;
      }
      SaveRun(*run);
    }
  }
  std::move(callback).Run(result.ok, result.message);
}

void MemoryStore::Search(const std::string& query, size_t limit, SearchCallback callback) {
  if (!enabled() || root_.empty()) {
    // Answered asynchronously even here: TaskStore starts a task's first turn from this callback and
    // relies on it not running inside the call that created the task.
    base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::BindOnce(std::move(callback), std::vector<SearchHit>()));
    return;
  }
  file_runner_->PostTaskAndReplyWithResult(
      FROM_HERE, base::BindOnce(&SearchOnDisk, root_, query, limit), std::move(callback));
}

void MemoryStore::Revert(const std::string& run_id, DoneCallback callback) {
  std::optional<Run> target = FindRun(run_id);
  if (!target || !target->has_snapshot || root_.empty()) {
    std::move(callback).Run(false, "That run changed nothing, or its snapshot is no longer kept.");
    return;
  }
  const std::string revert_id = BeginRun(RunKind::kRevert);
  if (std::optional<Run> revert = FindRun(revert_id)) {
    revert->has_snapshot = true;
    SaveRun(*revert);
  }
  file_runner_->PostTaskAndReplyWithResult(
      FROM_HERE, base::BindOnce(&RevertOnDisk, root_, run_id, revert_id),
      base::BindOnce(
          [](base::WeakPtr<MemoryStore> store, std::string revert_id, DoneCallback callback,
             ChangeResult result) {
            if (!store) {
              return;
            }
            store->files_ = std::move(result.files);
            store->EndRun(revert_id, 0);
            std::move(callback).Run(result.ok, result.message);
          },
          weak_factory_.GetWeakPtr(), revert_id, std::move(callback)));
}

void MemoryStore::Clear() {
  if (!profile_) {
    return;
  }
  profile_->GetPrefs()->SetList(prefs::kMemoryRuns, base::ListValue());
  profile_->GetPrefs()->SetDouble(prefs::kMemoryLastConsolidationMs, 0);
  files_.clear();
  if (!root_.empty()) {
    file_runner_->PostTaskAndReply(FROM_HERE, base::BindOnce(&ClearOnDisk, root_),
                                   base::BindOnce(&MemoryStore::RefreshIndex,
                                                  weak_factory_.GetWeakPtr()));
  }
}

void MemoryStore::RefreshIndex() {
  if (root_.empty()) {
    return;
  }
  file_runner_->PostTaskAndReplyWithResult(
      FROM_HERE, base::BindOnce(&IndexOnDisk, root_),
      base::BindOnce(&MemoryStore::OnIndex, weak_factory_.GetWeakPtr()));
}

void MemoryStore::OnIndex(std::vector<FileInfo> files) {
  files_ = std::move(files);
}

void MemoryStore::MigrateFromPrefs() {
  if (!profile_ || root_.empty() || profile_->GetPrefs()->GetBoolean(prefs::kMemoryMigrated)) {
    return;
  }
  std::vector<LegacyEntry> entries;
  for (const base::Value& value : profile_->GetPrefs()->GetList(prefs::kMemoryEntries)) {
    const base::DictValue* dict = value.GetIfDict();
    if (!dict) {
      continue;
    }
    LegacyEntry entry;
    if (const std::string* text = dict->FindString("text")) {
      entry.text = *text;
    }
    if (const std::string* source = dict->FindString("source")) {
      entry.source = *source;
    }
    entry.created_ms = static_cast<int64_t>(dict->FindDouble("created_ms").value_or(0));
    entry.pinned = dict->FindBool("pinned").value_or(false);
    // A line break inside an entry would split it across two bullets; the old store never had one,
    // but it was a renderer-reachable string.
    std::string flat;
    base::ReplaceChars(entry.text, "\r\n", " ", &flat);
    entry.text = std::move(flat);
    if (!entry.text.empty()) {
      entries.push_back(std::move(entry));
    }
  }
  // The flag and the old list are cleared only once the files are written, so a crash mid-move
  // repeats the move rather than losing the entries.
  file_runner_->PostTaskAndReplyWithResult(
      FROM_HERE, base::BindOnce(&MigrateOnDisk, root_, std::move(entries)),
      base::BindOnce(
          [](base::WeakPtr<MemoryStore> store, std::vector<FileInfo> files) {
            if (!store || !store->profile_) {
              return;
            }
            store->files_ = std::move(files);
            store->profile_->GetPrefs()->SetList(prefs::kMemoryEntries, base::ListValue());
            store->profile_->GetPrefs()->SetBoolean(prefs::kMemoryMigrated, true);
          },
          weak_factory_.GetWeakPtr()));
}

void MemoryStore::Sweep() {
  if (root_.empty()) {
    return;
  }
  std::set<std::string> keep;
  for (const Run& run : Runs()) {
    keep.insert(run.id);
  }
  file_runner_->PostTaskAndReplyWithResult(
      FROM_HERE, base::BindOnce(&SweepOnDisk, root_, retention_days(), std::move(keep)),
      base::BindOnce(&MemoryStore::OnIndex, weak_factory_.GetWeakPtr()));
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
