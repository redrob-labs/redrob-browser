// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/utility/importer/chromium_importer.h"

#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "base/files/file_util.h"
#include "base/json/json_reader.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/utf_string_conversions.h"
#include "base/time/time.h"
#include "base/values.h"
#include "chrome/common/importer/importer_bridge.h"
#include "chrome/grit/generated_resources.h"
#include "components/user_data_importer/common/imported_bookmark_entry.h"
#include "components/user_data_importer/common/importer_data_types.h"
#include "components/user_data_importer/common/importer_url_row.h"
#include "sql/database.h"
#include "sql/statement.h"
#include "url/gurl.h"

namespace redrob {
namespace {

inline constexpr sql::Database::Tag kDatabaseTag{"RedrobChromiumImporter"};

// Bounds on what one import will carry. A profile with a decade of history should not be able to make
// the utility process the reason the import failed.
constexpr int kMaxHistoryRows = 100000;
constexpr size_t kMaxBookmarks = 50000;
constexpr size_t kMaxSearchEngines = 500;
constexpr size_t kMaxBookmarkDepth = 32;

// Chromium writes times as microseconds since 1601-01-01 -- the Windows epoch -- in both its bookmarks
// JSON and its history database, on every platform. base::Time has this conversion, so the arithmetic
// does not need repeating here.
base::Time FromChromiumTime(int64_t microseconds) {
  if (microseconds <= 0) {
    return base::Time();
  }
  return base::Time::FromDeltaSinceWindowsEpoch(base::Microseconds(microseconds));
}

int64_t ParseInt64(const base::Value* value) {
  if (!value) {
    return 0;
  }
  // Chromium's own bookmark codec writes these as decimal STRINGS, because JSON numbers cannot hold
  // the range. A reader that expects a number silently gets zero for every date.
  if (value->is_string()) {
    int64_t parsed = 0;
    return base::StringToInt64(value->GetString(), &parsed) ? parsed : 0;
  }
  if (value->is_double()) {
    return static_cast<int64_t>(value->GetDouble());
  }
  if (value->is_int()) {
    return value->GetInt();
  }
  return 0;
}

// Walks one bookmark folder, depth first, in the order the source browser stored -- which is the order
// the user arranged them in, and the only ordering information the file carries.
void CollectBookmarks(const base::DictValue& node,
                      const std::vector<std::u16string>& path,
                      bool in_toolbar,
                      size_t depth,
                      std::vector<user_data_importer::ImportedBookmarkEntry>* out) {
  if (depth > kMaxBookmarkDepth || out->size() >= kMaxBookmarks) {
    return;
  }
  const std::string* type = node.FindString("type");
  if (!type) {
    return;
  }
  const std::string* name = node.FindString("name");
  const std::u16string title = name ? base::UTF8ToUTF16(*name) : std::u16string();

  if (*type == "url") {
    const std::string* url = node.FindString("url");
    if (!url) {
      return;
    }
    const GURL parsed(*url);
    // http(s) and nothing else. A javascript: bookmarklet or a chrome:// URL from another product is
    // not something to hand to this browser's bookmark model.
    if (!parsed.is_valid() || !parsed.SchemeIsHTTPOrHTTPS()) {
      return;
    }
    user_data_importer::ImportedBookmarkEntry entry;
    entry.in_toolbar = in_toolbar;
    entry.is_folder = false;
    entry.url = parsed;
    entry.path = path;
    entry.title = title;
    entry.creation_time = FromChromiumTime(ParseInt64(node.Find("date_added")));
    out->push_back(std::move(entry));
    return;
  }

  if (*type != "folder") {
    return;
  }
  const base::ListValue* children = node.FindList("children");
  if (!children) {
    return;
  }
  // An empty folder is worth carrying: someone made it.
  if (children->empty() && !path.empty()) {
    user_data_importer::ImportedBookmarkEntry entry;
    entry.in_toolbar = in_toolbar;
    entry.is_folder = true;
    entry.path = path;
    entry.title = title;
    entry.creation_time = FromChromiumTime(ParseInt64(node.Find("date_added")));
    out->push_back(std::move(entry));
  }
  std::vector<std::u16string> child_path = path;
  if (!title.empty()) {
    child_path.push_back(title);
  }
  for (const base::Value& child : *children) {
    if (child.is_dict()) {
      CollectBookmarks(child.GetDict(), child_path, in_toolbar, depth + 1, out);
    }
  }
}

}  // namespace

ChromiumImporter::ChromiumImporter() = default;
ChromiumImporter::~ChromiumImporter() = default;

void ChromiumImporter::StartImport(const user_data_importer::SourceProfile& source_profile,
                                  uint16_t items,
                                  ImporterBridge* bridge) {
  bridge_ = bridge;
  source_path_ = source_profile.source_path;
  items_ = items;

  bridge_->NotifyStarted();
  if (!copies_.CreateUniqueTempDir()) {
    bridge_->NotifyEnded();
    return;
  }

  // History before bookmarks, for the same reason the Firefox importer does it: favicons are stored
  // only for URLs that already exist in history or bookmarks.
  if ((items_ & user_data_importer::HISTORY) && !cancelled()) {
    bridge_->NotifyItemStarted(user_data_importer::HISTORY);
    ImportHistory();
    bridge_->NotifyItemEnded(user_data_importer::HISTORY);
  }
  if ((items_ & user_data_importer::FAVORITES) && !cancelled()) {
    bridge_->NotifyItemStarted(user_data_importer::FAVORITES);
    ImportBookmarks();
    bridge_->NotifyItemEnded(user_data_importer::FAVORITES);
  }
  if ((items_ & user_data_importer::SEARCH_ENGINES) && !cancelled()) {
    bridge_->NotifyItemStarted(user_data_importer::SEARCH_ENGINES);
    ImportSearchEngines();
    bridge_->NotifyItemEnded(user_data_importer::SEARCH_ENGINES);
  }
  // PASSWORDS and COOKIES are deliberately not handled even when their bits are set. `ALL` includes
  // both and always has, which is exactly why silently skipping them would be read as success by every
  // caller -- the browser side never offers them for this source, and the import step names the CSV
  // route for passwords instead.

  bridge_->NotifyEnded();
}

base::FilePath ChromiumImporter::CopyOut(const char* file_name) {
  const base::FilePath source = source_path_.AppendASCII(file_name);
  if (!base::PathExists(source)) {
    return base::FilePath();
  }
  const base::FilePath destination = copies_.GetPath().AppendASCII(file_name);
  if (!base::CopyFile(source, destination)) {
    return base::FilePath();
  }
  // The write-ahead log, when there is one. Copying the database without it loses every change the
  // source browser has not checkpointed yet -- which, for a browser that is still running, is most of
  // today's browsing.
  const base::FilePath wal = source_path_.AppendASCII(std::string(file_name) + "-wal");
  if (base::PathExists(wal)) {
    base::CopyFile(wal, copies_.GetPath().AppendASCII(std::string(file_name) + "-wal"));
  }
  return destination;
}

void ChromiumImporter::ImportBookmarks() {
  const base::FilePath file = source_path_.AppendASCII("Bookmarks");
  std::string contents;
  if (!base::ReadFileToStringWithMaxSize(file, &contents, 64 * 1024 * 1024)) {
    return;
  }
  std::optional<base::DictValue> root =
      base::JSONReader::ReadDict(contents, base::JSON_PARSE_RFC);
  if (!root) {
    return;
  }
  const base::DictValue* roots = root->FindDict("roots");
  if (!roots) {
    return;
  }

  std::vector<user_data_importer::ImportedBookmarkEntry> entries;
  // The bookmarks bar is flagged rather than pathed: `in_toolbar` is what puts these on this browser's
  // own bar instead of in a folder named after the other browser's bar.
  if (const base::DictValue* bar = roots->FindDict("bookmark_bar")) {
    CollectBookmarks(*bar, {}, /*in_toolbar=*/true, 0, &entries);
  }
  if (const base::DictValue* other = roots->FindDict("other")) {
    CollectBookmarks(*other, {}, /*in_toolbar=*/false, 0, &entries);
  }
  // "synced" is the mobile-bookmarks root in Chromium's own naming. Carried, because a user who
  // bookmarked something on their phone does not think of it as a different kind of bookmark.
  if (const base::DictValue* synced = roots->FindDict("synced")) {
    CollectBookmarks(*synced, {}, /*in_toolbar=*/false, 0, &entries);
  }

  if (!entries.empty() && !cancelled()) {
    bridge_->AddBookmarks(entries, bridge_->GetLocalizedString(IDS_BOOKMARK_GROUP));
  }
}

void ChromiumImporter::ImportHistory() {
  const base::FilePath file = CopyOut("History");
  if (file.empty()) {
    return;
  }
  sql::Database db(kDatabaseTag);
  if (!db.Open(file)) {
    return;
  }

  // Typed and visited URLs, most recent first, hidden rows excluded. `hidden` is how Chromium marks
  // subframe navigations and other things the user never chose to visit. A row with no visit time is
  // excluded too: Chromium keeps URL rows whose visits have all expired or arrived by sync with
  // last_visit_time 0, and history's AddPagesWithDetails requires a real time -- a debug-checked build
  // crashed on the first such row, and a shipped one would file it as visited in 1601.
  static constexpr char kQuery[] =
      "SELECT url, title, visit_count, typed_count, last_visit_time, hidden "
      "FROM urls WHERE hidden = 0 AND last_visit_time > 0 "
      "ORDER BY last_visit_time DESC LIMIT ?";
  sql::Statement statement(db.GetUniqueStatement(kQuery));
  statement.BindInt(0, kMaxHistoryRows);

  std::vector<user_data_importer::ImporterURLRow> rows;
  while (statement.Step()) {
    if (cancelled()) {
      return;
    }
    const GURL url(statement.ColumnStringView(0));
    if (!url.is_valid() || !url.SchemeIsHTTPOrHTTPS()) {
      continue;
    }
    user_data_importer::ImporterURLRow row(url);
    row.title = statement.ColumnString16(1);
    row.visit_count = statement.ColumnInt(2);
    row.typed_count = statement.ColumnInt(3);
    row.last_visit = FromChromiumTime(statement.ColumnInt64(4));
    if (row.last_visit.is_null()) {
      continue;  // The query already excludes these; this holds if the column ever reads back <= 0.
    }
    row.hidden = false;
    rows.push_back(std::move(row));
  }
  if (!rows.empty()) {
    bridge_->SetHistoryItems(rows, user_data_importer::VISIT_SOURCE_CHROMIUM_IMPORTED);
  }
}

void ChromiumImporter::ImportSearchEngines() {
  const base::FilePath file = CopyOut("Web Data");
  if (file.empty()) {
    return;
  }
  sql::Database db(kDatabaseTag);
  if (!db.Open(file)) {
    return;
  }

  static constexpr char kQuery[] =
      "SELECT short_name, keyword, url FROM keywords ORDER BY id LIMIT ?";
  sql::Statement statement(db.GetUniqueStatement(kQuery));
  statement.BindInt64(0, static_cast<int64_t>(kMaxSearchEngines));

  std::vector<user_data_importer::SearchEngineInfo> engines;
  while (statement.Step()) {
    if (cancelled()) {
      return;
    }
    user_data_importer::SearchEngineInfo engine;
    engine.display_name = statement.ColumnString16(0);
    engine.keyword = statement.ColumnString16(1);
    // Not parsed as a GURL: a search URL contains a {searchTerms} placeholder, so it is legitimately
    // not a valid URL until it is used. That is why SearchEngineInfo::url is a string.
    engine.url = statement.ColumnString16(2);
    if (engine.url.empty() || engine.keyword.empty()) {
      continue;
    }
    engines.push_back(std::move(engine));
  }
  if (engines.empty()) {
    return;
  }
  // Deduplicated on host and path by the browser side, which is what stops a second import from
  // creating a second "google.com" keyword.
  bridge_->SetKeywords(engines, /*unique_on_host_and_path=*/true);
}

}  // namespace redrob
