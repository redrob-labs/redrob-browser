// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/task_store.h"

#include <set>
#include <utility>

#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/strings/string_util.h"
#include "base/json/json_writer.h"
#include "base/strings/escape.h"
#include "base/strings/utf_string_conversions.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/stringprintf.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include "base/base64.h"
#include "base/path_service.h"
#include "base/task/sequenced_task_runner.h"
#include "chrome/browser/redrob/resources/grit/redrob_strings.h"
#include "chrome/browser/redrob/agent_tabs.h"
#include "chrome/browser/redrob/memory_store.h"
#include "ui/base/l10n/l10n_util.h"
#include "chrome/browser/redrob/model_store.h"
#include "chrome/common/chrome_paths.h"
#include "chrome/browser/redrob/file_tools.h"
#include "chrome/browser/redrob/page_tools.h"
#include "chrome/browser/redrob/redrob_prefs.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/thumbnails/thumbnail_tab_helper.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/profile_browser_collection.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/tabs/public/tab_interface.h"
#include "components/prefs/pref_service.h"
#include "content/public/browser/web_contents.h"
#include "url/gurl.h"

namespace redrob {
namespace {

// A renderer can send any string. These are not UX limits; they bound what the browser process will
// hold on behalf of a page.
constexpr size_t kMaxPromptBytes = 32 * 1024;
constexpr size_t kMaxContextRefs = 32;
constexpr size_t kMaxConcurrentTasks = 4;
constexpr size_t kMaxTasks = 200;
constexpr size_t kMaxNarrationBytes = 256 * 1024;
constexpr size_t kMaxStepsPerTask = 200;
constexpr size_t kMaxDetailsPerStep = 40;
// A frame is base64 in a Mojo message. Thumbnails are a few KB; this is the ceiling past which we would
// rather show no picture than send that much through a pipe on every update.
constexpr size_t kMaxPreviewBytes = 512 * 1024;

// How many times one task may go engine -> tool -> engine. The loop is driven by model output, so
// without a ceiling a model that keeps proposing tools keeps the browser opening tabs forever. The
// ceiling is what the effort setting actually BUYS -- the difference between a lookup and Ultrabrowse
// is how many sources the browser will let one task walk through, not a word in a prompt.
int ToolBudget(mojom::Effort effort) {
  switch (effort) {
    case mojom::Effort::kQuick:
      return 3;
    case mojom::Effort::kStandard:
      return 8;
    case mojom::Effort::kUltrabrowse:
      return 32;
  }
}

// What the engine is told about the effort, in the field an OpenAI-compatible endpoint already has for
// it. If the engine ignores it, the budget and the plan step still make the setting mean something --
// which is why effort is not implemented as this line alone.
const char* ReasoningEffort(mojom::Effort effort) {
  switch (effort) {
    case mojom::Effort::kQuick:
      return "low";
    case mojom::Effort::kStandard:
      return "medium";
    case mojom::Effort::kUltrabrowse:
      return "high";
  }
}

// The number of user messages one task may have waiting. A queue is a courtesy, not a buffer for
// everything someone types while they wait.
constexpr size_t kMaxQueuedFollowUps = 8;

// The group the agent's tabs are collected under. Matches the sidebar's "Agent tabs" section.
constexpr char kAgentTabGroupTitle[] = "Agent tabs";

// The Redrob provider's model selector. "auto" lets the engine pick, which is what the surface's
// default model chip shows.
constexpr char kModel[] = "redrob/auto";

constexpr char kToolOpenPage[] = "open_page";
constexpr char kToolReadPage[] = "read_page";
constexpr char kToolClick[] = "click";
constexpr char kToolType[] = "type_text";
constexpr char kToolSaveFile[] = "save_file";
constexpr char kToolPlan[] = "plan_research";
constexpr char kToolRecall[] = "recall";
// Memory files. Read and list are offered to every task while memory is on; write and edit only to the
// hidden memory tasks, so an ordinary task cannot rewrite memory as a side effect of what it browsed.
constexpr char kToolMemoryRead[] = "memory_read";
constexpr char kToolMemoryList[] = "memory_list";
constexpr char kToolMemoryWrite[] = "memory_write";
constexpr char kToolMemoryEdit[] = "memory_edit";

// Tool rounds a memory task may take: enough to list, read a handful of files and write a few.
constexpr int kMemoryToolBudget = 16;
// How much of a finished task's answer extraction is shown. The tail, because that is the conclusion.
constexpr size_t kExtractionAnswerBytes = 6000;
constexpr size_t kExtractionMaxSteps = 60;

// The one system message every memory task gets.
constexpr char kMemorySystemPrompt[] =
    "You maintain the memory of the Redrob browser's agent: a folder of markdown files the user can "
    "read, edit and revert. Use memory_list and memory_read to see what is there, and memory_write or "
    "memory_edit to change it. Write short, plain markdown bullets a person can check at a glance. "
    "Record only what is durable and useful for future tasks: what the user wants, how they like "
    "things done, and paths through websites that worked. Never record passwords, payment details, "
    "one-time codes, or anything the user did not show you. When you are done, answer with one line "
    "saying what you changed, or that nothing was worth keeping.";

// Extraction: what to keep from ONE finished task. English on purpose: it is model input, not UI.
constexpr char kExtractionPrompt[] =
    "A browser task just finished. Decide what from it is worth remembering, then:\n"
    "1. Append to the episodic file named below (create it with a '# YYYY-MM-DD' heading if it does "
    "not exist): one bullet per thing worth keeping -- what the user asked for, what worked, and "
    "anything they told you about themselves. Do not copy page contents.\n"
    "2. For each site where a path through it worked (a search URL, which menu led where, a form "
    "that needed a particular order), update sites/<host>.md, e.g. sites/example.com.md, with that "
    "path. Edit the existing file rather than rewriting it when one exists.\n"
    "3. If you created a new file, add one line for it to MEMORY.md.\n"
    "If nothing in the task is worth keeping, change nothing and say so.";

// Consolidation: the offline review of the episodic log.
constexpr char kConsolidationPrompt[] =
    "Review the memory as a whole. Read MEMORY.md, USER.md and the files in episodic/. Then:\n"
    "1. Move durable facts out of the episodic files into where they belong: USER.md for who the "
    "user is and what they prefer, people/<name>.md for people they work with, projects/<name>.md "
    "for ongoing work, and sites/<host>.md for paths through websites. Merge duplicates and drop "
    "anything later episodes contradict.\n"
    "2. Leave the episodic files themselves in place; they age out on their own.\n"
    "3. Rewrite MEMORY.md as the index: one line per file, saying what it holds.\n"
    "Keep every file short. Prefer editing over rewriting.";

std::string TodayName() {
  base::Time::Exploded exploded;
  base::Time::Now().LocalExplode(&exploded);
  return base::StringPrintf("%04d-%02d-%02d", exploded.year, exploded.month,
                            exploded.day_of_month);
}

bool IsMemoryToolName(const std::string& name) {
  return name == kToolRecall || name == kToolMemoryRead || name == kToolMemoryList ||
         name == kToolMemoryWrite || name == kToolMemoryEdit;
}

// How many remembered entries a new task is given unasked, and how many `recall` returns. Small on
// purpose: memory that fills the context is memory that crowds out the task.
constexpr size_t kMemoryHits = 5;

int64_t NowMs() {
  return base::Time::Now().InMillisecondsSinceUnixEpoch();
}

bool IsTerminal(mojom::TaskState state) {
  switch (state) {
    case mojom::TaskState::kSucceeded:
    case mojom::TaskState::kFailed:
    case mojom::TaskState::kCancelled:
      return true;
    case mojom::TaskState::kQueued:
    case mojom::TaskState::kRunning:
    case mojom::TaskState::kBlockedOnPolicy:
      return false;
  }
}

base::DictValue TextMessage(const char* role, const std::string& content) {
  base::DictValue message;
  message.Set("role", role);
  message.Set("content", content);
  return message;
}

// What the BROWSER can do, declared to the engine in its own wire format.
//
// This list is the entire surface a model's output can reach, so ADDING to it is the decision worth
// reviewing -- not the loop that dispatches it. The declaration is filtered by the task's permission
// mode before it is sent, so a read-only task is not offered tools it would only be refused: telling a
// model about a capability and then denying it wastes a turn and teaches it to retry.
base::DictValue MakeTool(const char* name,
                         const std::string& description,
                         base::DictValue properties,
                         base::ListValue required) {
  base::DictValue parameters;
  parameters.Set("type", "object");
  parameters.Set("properties", std::move(properties));
  parameters.Set("required", std::move(required));

  base::DictValue function;
  function.Set("name", name);
  function.Set("description", description);
  function.Set("parameters", std::move(parameters));

  base::DictValue tool;
  tool.Set("type", "function");
  tool.Set("function", std::move(function));
  return tool;
}

base::DictValue StringProperty(const std::string& description) {
  base::DictValue property;
  property.Set("type", "string");
  property.Set("description", description);
  return property;
}

base::DictValue StringArrayProperty(const std::string& description) {
  base::DictValue items;
  items.Set("type", "string");
  base::DictValue property;
  property.Set("type", "array");
  property.Set("items", std::move(items));
  property.Set("description", description);
  return property;
}

// The memory tools. `writable` adds memory_write and memory_edit, and is true ONLY for a memory task.
void AppendMemoryTools(base::ListValue& tools, bool writable) {
  {
    base::DictValue properties;
    properties.Set("query", StringProperty("What you are trying to recall."));
    base::ListValue required;
    required.Append("query");
    tools.Append(MakeTool(kToolRecall,
                          "Search the memory files for lines matching a query. The most relevant lines "
                          "are given to you at the start of a task, so use this only when you need "
                          "something the task did not begin with.",
                          std::move(properties), std::move(required)));
  }
  tools.Append(MakeTool(kToolMemoryList,
                        "List the memory files, with their sizes. MEMORY.md is the index.",
                        base::DictValue(), base::ListValue()));
  {
    base::DictValue properties;
    properties.Set("path", StringProperty(
        "A memory file's relative path, e.g. USER.md or sites/example.com.md."));
    base::ListValue required;
    required.Append("path");
    tools.Append(MakeTool(kToolMemoryRead, "Read one memory file in full.", std::move(properties),
                          std::move(required)));
  }
  if (!writable) {
    return;
  }
  {
    base::DictValue properties;
    properties.Set("path", StringProperty(
        "Relative path ending in .md, lower-case letters, digits, '-', '_' and '/' only."));
    properties.Set("content", StringProperty("The complete new content of the file, in markdown."));
    base::ListValue required;
    required.Append("path");
    required.Append("content");
    tools.Append(MakeTool(kToolMemoryWrite,
                          "Create or replace a memory file. At most 64 KiB a file.",
                          std::move(properties), std::move(required)));
  }
  {
    base::DictValue properties;
    properties.Set("path", StringProperty("The memory file to edit."));
    properties.Set("old", StringProperty(
        "Text that occurs exactly once in the file. Use an empty-looking but real anchor such as the "
        "last line when appending."));
    properties.Set("new", StringProperty("What to replace it with."));
    base::ListValue required;
    required.Append("path");
    required.Append("old");
    required.Append("new");
    tools.Append(MakeTool(kToolMemoryEdit,
                          "Replace one exact passage in a memory file. Prefer this over memory_write "
                          "for an existing file.",
                          std::move(properties), std::move(required)));
  }
}

base::ListValue MemoryTaskTools() {
  base::ListValue tools;
  AppendMemoryTools(tools, /*writable=*/true);
  return tools;
}

base::ListValue BrowserTools(mojom::PermissionMode mode, mojom::Effort effort, bool memory_enabled) {
  base::ListValue tools;

  {
    base::DictValue properties;
    properties.Set("url", StringProperty("The http or https URL to open."));
    properties.Set("reason", StringProperty("Why this page is being opened, shown in the trace."));
    base::ListValue required;
    required.Append("url");
    tools.Append(MakeTool(kToolOpenPage,
                          "Open a page as a real browser tab, in the user's own session, grouped "
                          "under \"Agent tabs\" where the user can watch it, take it over, or close "
                          "it.",
                          std::move(properties), std::move(required)));
  }

  {
    base::DictValue properties;
    properties.Set("reason", StringProperty("What you are looking for on the page."));
    tools.Append(MakeTool(kToolReadPage,
                          "Read the visible text of the page you most recently opened.",
                          std::move(properties), base::ListValue()));
  }

  // Ultrabrowse's one extra capability, and it is not a capability over the machine: it is somewhere to
  // put a plan so the person watching can see the shape of the work before the tabs start opening.
  if (effort == mojom::Effort::kUltrabrowse) {
    base::DictValue properties;
    properties.Set("goal", StringProperty("What the finished answer will establish, in one line."));
    properties.Set("steps", StringArrayProperty(
        "The sources you intend to consult and what you expect each to settle, one per entry."));
    base::ListValue required;
    required.Append("goal");
    required.Append("steps");
    tools.Append(MakeTool(kToolPlan,
                          "Write your research plan into the task's trace before you start browsing. "
                          "Call this once, first. The user reads it to decide whether you understood "
                          "the question, so name real sources rather than describing method.",
                          std::move(properties), std::move(required)));
  }

  // Memory, when the user has it on. Declared in every permission mode because reading touches nothing
  // outside the profile's own memory folder. Writing is NOT declared here: only a memory task may write.
  if (memory_enabled) {
    AppendMemoryTools(tools, /*writable=*/false);
  }

  if (mode != mojom::PermissionMode::kReadOnly) {
    {
      base::DictValue properties;
      properties.Set("target", StringProperty(
          "The visible text or accessible label of the link or button to click."));
      base::ListValue required;
      required.Append("target");
      tools.Append(MakeTool(kToolClick,
                            "Click a link or button on the page by the text the user would see on "
                            "it. Only visible controls can be clicked.",
                            std::move(properties), std::move(required)));
    }
    {
      base::DictValue properties;
      properties.Set("field", StringProperty("The label or placeholder of the field to fill."));
      properties.Set("text", StringProperty("The text to put in it."));
      base::ListValue required;
      required.Append("field");
      required.Append("text");
      tools.Append(MakeTool(kToolType,
                            "Fill a form field. This never submits the form and never fills a "
                            "password field -- submitting is left to the user.",
                            std::move(properties), std::move(required)));
    }
    {
      base::DictValue properties;
      // A NAME, not a path, and the description says so. The interface cannot express a path at all,
      // but a model told the truth about the tool wastes fewer turns discovering it.
      properties.Set("name", StringProperty(
          "A file name only, with no folders in it -- the browser decides which folder it goes in."));
      properties.Set("contents", StringProperty("The complete text to write."));
      base::ListValue required;
      required.Append("name");
      required.Append("contents");
      std::string description = "Save text as a file in the folder the user chose for this task.";
      if (mode == mojom::PermissionMode::kFullAccess) {
        // The ONE argument full access adds. Declared with its limits in the description, because a
        // model that learns them by being refused spends a turn to learn each one.
        properties.Set("folder", StringProperty(
            "Optional. An absolute directory path to write into instead of the user's chosen folder. "
            "The browser refuses hidden directories, its own profile directory, and overwriting a "
            "file that already exists."));
        description +=
            " In this task the user granted full access, so you may also pass an absolute folder.";
      }
      tools.Append(MakeTool(kToolSaveFile, description, std::move(properties),
                            std::move(required)));
    }
  }

  return tools;
}

std::string SystemPrompt(mojom::Effort effort) {
  std::string prompt =
      "You are the agent inside the Redrob browser. You are answering a task the user typed on their "
      "new tab page. When you need to look at a page on the web, call open_page: it opens a real tab "
      "in the user's own browser, which they can see and take over. Explain what you are doing as you "
      "go, in short prose -- the user reads it as the task's trace.";
  switch (effort) {
    case mojom::Effort::kQuick:
      prompt +=
          " The user asked for a quick answer: open at most one or two pages and answer from them "
          "rather than surveying the subject.";
      break;
    case mojom::Effort::kStandard:
      break;
    case mojom::Effort::kUltrabrowse:
      prompt +=
          " The user asked for Ultrabrowse, a deep pass. Call plan_research FIRST, then work through "
          "your own plan across several independent sources, and say where two sources disagree "
          "instead of picking one silently. Where nothing you found settles a point, say that it is "
          "unsettled -- an answer that reads as complete when it is not is the failure this depth was "
          "meant to avoid.";
      break;
  }
  return prompt;
}

}  // namespace

TaskStore::TaskStore(Profile* profile,
                     scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory,
                     MemoryStore* memory,
                     ModelStore* models)
    : profile_(profile),
      memory_(memory),
      models_(models),
      url_loader_factory_(std::move(url_loader_factory)),
      sidecar_(std::make_unique<SidecarClient>()) {
  // A task answered by the user's own provider never launches the local engine, so the loader
  // factory has to arrive by a path that does not go through EnsureStarted.
  sidecar_->SetLoaderFactory(url_loader_factory_);
  // Looked up once here rather than per write: the blocking-thread check needs it, and PathService is
  // not something to call from a write path on every save.
  base::PathService::Get(chrome::DIR_USER_DATA, &user_data_dir_);
}

TaskStore::~TaskStore() = default;

void TaskStore::AddObserver(Observer* observer) {
  observers_.AddObserver(observer);
}

void TaskStore::RemoveObserver(Observer* observer) {
  observers_.RemoveObserver(observer);
}

std::string TaskStore::CreateTask(const std::string& prompt,
                                  mojom::PermissionMode mode,
                                  mojom::Effort effort,
                                  const std::string& model) {
  // The id is generated here rather than by the engine: the page needs something to render against
  // before any request has been answered, and a browser-side id cannot be forged by the renderer.
  const std::string task_id = base::Uuid::GenerateRandomV4().AsLowercaseString();

  mojom::TaskPtr task = mojom::Task::New();
  task->id = task_id;
  task->prompt = prompt;
  task->state = mojom::TaskState::kQueued;
  task->started_at_ms = NowMs();
  task->mode = mode;
  task->effort = effort;
  task->model = model;

  // The folder the user last chose, carried forward. Asking again for every task would train people to
  // click through the picker, which is the opposite of what a picker is for -- and the folder is still
  // theirs to change per task from the task's own composer.
  const base::FilePath remembered =
      profile_ ? profile_->GetPrefs()->GetFilePath(prefs::kWorkingFolder) : base::FilePath();
  if (!remembered.empty()) {
    working_folders_[task_id] = remembered;
    task->working_folder = remembered.BaseName().AsUTF8Unsafe();
  }
  tasks_[task_id] = std::move(task);

  Conversation conversation;
  conversation.messages.Append(TextMessage("system", SystemPrompt(effort)));

  conversation.messages.Append(TextMessage("user", prompt));
  // What we already know, searched with the task's own words. Given to the engine as a system message
  // AND recorded as a step, because an answer shaped by something the user told the browser weeks ago
  // is only fair if they can see that it was. The search reads files, so it answers later; the first
  // turn waits for it (see StartTurn).
  const bool search_memory = memory_ && memory_->enabled();
  conversation.awaiting_memory = search_memory;
  conversations_[task_id] = std::move(conversation);
  if (search_memory) {
    memory_->Search(prompt, kMemoryHits,
                    base::BindOnce(&TaskStore::OnMemoryPrefill, weak_factory_.GetWeakPtr(),
                                   task_id));
  }

  // Bounded history. Without this the map is a renderer-driven allocation for the life of the profile.
  while (tasks_.size() > kMaxTasks) {
    auto oldest = tasks_.begin();
    for (auto it = tasks_.begin(); it != tasks_.end(); ++it) {
      if (IsTerminal(it->second->state) &&
          it->second->started_at_ms < oldest->second->started_at_ms) {
        oldest = it;
      }
    }
    if (!IsTerminal(oldest->second->state)) {
      break;
    }
    conversations_.erase(oldest->first);
    working_folders_.erase(oldest->first);
    previews_.erase(oldest->first);
    tasks_.erase(oldest);
  }

  return task_id;
}

std::pair<std::optional<std::string>, std::optional<mojom::StartError>> TaskStore::StartTask(
    const std::string& prompt,
    const std::vector<std::string>& context_refs,
    mojom::PermissionMode mode,
    mojom::Effort effort,
    const std::string& model) {
  if (prompt.empty() || prompt.size() > kMaxPromptBytes ||
      context_refs.size() > kMaxContextRefs) {
    // Dropping the extra refs silently would make the page's view of its own request wrong, which is
    // a worse failure than refusing it.
    return {std::nullopt, mojom::StartError::kEmptyPrompt};
  }

  size_t running = 0;
  for (const auto& [id, task] : tasks_) {
    // Memory tasks are the browser's own housekeeping; they never count against the user's tasks.
    if (!IsTerminal(task->state) && !IsMemoryTask(id)) {
      ++running;
    }
  }
  if (running >= kMaxConcurrentTasks) {
    return {std::nullopt, mojom::StartError::kTooManyRunningTasks};
  }

  sidecar_->EnsureStarted(
      url_loader_factory_,
      base::BindRepeating(&TaskStore::OnSidecarStatusChanged, base::Unretained(this)));
  // Only the built-in engine has to be there. A user answering tasks with their own provider gets no
  // benefit from being told a sidecar binary is missing.
  const bool direct = models_ && models_->Selected().has_value();
  if (!direct && (sidecar_->status() == SidecarClient::Status::kUnavailable ||
                  sidecar_->status() == SidecarClient::Status::kFailed)) {
    return {std::nullopt, mojom::StartError::kSidecarUnavailable};
  }

  const std::string task_id = CreateTask(prompt, mode, effort, model);
  CaptureContextTab(task_id);
  StartTurn(task_id);
  return {task_id, std::nullopt};
}

std::string TaskStore::StartRoutineTask(const std::string& title,
                                        const std::string& prompt,
                                        mojom::PermissionMode mode,
                                        mojom::Effort effort) {
  if (prompt.empty() || prompt.size() > kMaxPromptBytes) {
    return std::string();
  }
  size_t running = 0;
  for (const auto& [id, task] : tasks_) {
    // Memory tasks are the browser's own housekeeping; they never count against the user's tasks.
    if (!IsTerminal(task->state) && !IsMemoryTask(id)) {
      ++running;
    }
  }
  // A routine that fires while the user has four tasks going does not get to push one of them out.
  // It is skipped and its next run is scheduled as usual -- a missed routine is recoverable, a task
  // the user was watching being evicted is not.
  if (running >= kMaxConcurrentTasks) {
    return std::string();
  }
  sidecar_->EnsureStarted(
      url_loader_factory_,
      base::BindRepeating(&TaskStore::OnSidecarStatusChanged, base::Unretained(this)));
  const bool direct = models_ && models_->Selected().has_value();
  if (!direct && (sidecar_->status() == SidecarClient::Status::kUnavailable ||
                  sidecar_->status() == SidecarClient::Status::kFailed)) {
    return std::string();
  }

  // A routine has no chooser, so it takes the default rather than inheriting whatever the new tab
  // was last set to -- a scheduled task should not change model because someone touched a menu.
  const std::string task_id = CreateTask(prompt, mode, effort, std::string());
  // First step in the trace, before any model output: a task the user did not type needs to say where
  // it came from, or its tabs appear out of nowhere.
  AddStep(task_id, mojom::StepKind::kRoutine,
          title.empty() ? "Started by a routine" : "Started by the routine \"" + title + "\"");
  StartTurn(task_id);
  return task_id;
}

bool TaskStore::WakeTask(const std::string& task_id, const std::string& prompt) {
  auto task = tasks_.find(task_id);
  auto conversation = conversations_.find(task_id);
  if (task == tasks_.end() || conversation == conversations_.end() || prompt.empty() ||
      prompt.size() > kMaxPromptBytes) {
    return false;
  }
  AddStep(task_id, mojom::StepKind::kRoutine, "Woken by a routine");
  // Queued rather than forced when the task happens to be mid-run: a heartbeat is a nudge, and a nudge
  // that interrupts work in progress is not a nudge.
  if (!IsTerminal(task->second->state)) {
    if (conversation->second.queued.size() < kMaxQueuedFollowUps) {
      conversation->second.queued.push_back(prompt);
    }
    Notify(task_id);
    return true;
  }
  conversation->second.messages.Append(TextMessage("user", prompt));
  conversation->second.tool_rounds = 0;
  task->second->error.reset();
  Notify(task_id);
  base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(&TaskStore::StartTurn, weak_factory_.GetWeakPtr(), task_id));
  return true;
}

void TaskStore::StartTurn(const std::string& task_id) {
  auto task = tasks_.find(task_id);
  auto conversation = conversations_.find(task_id);
  if (task == tasks_.end() || conversation == conversations_.end()) {
    return;
  }

  // The memory search for this task's prompt has not answered yet; OnMemoryPrefill starts the turn.
  if (conversation->second.awaiting_memory) {
    task->second->state = mojom::TaskState::kQueued;
    Notify(task_id);
    return;
  }

  // One stream per client. A second task must wait rather than silently replace the first, which the
  // concurrency ceiling in StartTask is what keeps bounded.
  if (!active_task_id_.empty() && active_task_id_ != task_id) {
    task->second->state = mojom::TaskState::kQueued;
    Notify(task_id);
    return;
  }
  // Already streaming this very task: a second start would be a duplicate request. Reachable now that
  // StartNextQueued can start a task that also has its own StartTurn posted.
  if (active_task_id_ == task_id) {
    return;
  }

  // Whose model answers this. Resolved per turn rather than per task, so switching provider in
  // Settings takes effect on the next turn instead of at the next browser launch.
  const std::optional<ModelStore::Provider> provider =
      models_ ? models_->Selected() : std::nullopt;

  if (!provider && sidecar_->status() != SidecarClient::Status::kReady) {
    // Still handshaking. The status callback brings us back here. Skipped entirely for a user's own
    // provider: that path never launches the local engine, so waiting on it would be waiting forever.
    task->second->state = mojom::TaskState::kQueued;
    Notify(task_id);
    return;
  }

  base::DictValue request;
  // Precedence: a user's own provider first (that path never touches the local engine, so its model is
  // the only one that can work), then the model this task was started with, then the default. kModel is
  // a WIRE value, not a label -- cycle 37's capture confirmed the engine receives it verbatim.
  const std::string& task_model = task->second->model;
  request.Set("model", provider ? provider->model
                                : (task_model.empty() ? std::string(kModel) : task_model));
  request.Set("stream", true);
  request.Set("reasoning_effort", ReasoningEffort(task->second->effort));
  request.Set("messages", conversation->second.messages.Clone());
  request.Set("tools", IsMemoryTask(task_id)
                           ? MemoryTaskTools()
                           : BrowserTools(task->second->mode, task->second->effort,
                                          memory_ && memory_->enabled()));
  // CAP-1/CAP-2: the page the task is on, so the engine can arm the skills whose `urls:` match it.
  // Built-in engine only: a user's own provider is a third-party endpoint, where an unknown field
  // can be refused outright and where the URL the user is reading has no reason to go.
  if (!provider && !IsMemoryTask(task_id)) {
    std::optional<base::DictValue> context = RedrobContext(conversation->second);
    if (context.has_value()) {
      request.Set("redrob_context", std::move(context).value());
    }
  }

  std::optional<std::string> body = base::WriteJson(request);
  if (!body.has_value()) {
    FinishTask(task_id, mojom::TaskState::kFailed, "The task could not be encoded for the engine.");
    return;
  }

  active_task_id_ = task_id;
  conversation->second.assistant_text.clear();
  conversation->second.proposed.clear();
  conversation->second.turn_text_started = false;
  task->second->state = mojom::TaskState::kRunning;
  Notify(task_id);

  if (provider) {
    // The credential is fetched at the moment the request is built, and asynchronously, because an
    // OAuth connection may need refreshing first. It exists for the duration of this hop and is not
    // held on this object where every other method could reach it.
    models_->EnsureToken(
        provider->id,
        base::BindOnce(
            [](base::WeakPtr<TaskStore> store, std::string task_id, std::string endpoint,
               std::string body, std::optional<std::string> token) {
              if (!store) {
                return;
              }
              if (!token.has_value() || token->empty()) {
                store->FinishTask(task_id, mojom::TaskState::kFailed,
                                  "That provider has no usable credential on this machine any more. "
                                  "Reconnect it in Settings, or switch back to the built-in engine.");
                return;
              }
              store->sidecar_->StartDirectCompletion(endpoint, token.value(), std::move(body),
                                                     store.get());
            },
            weak_factory_.GetWeakPtr(), task_id, provider->endpoint, std::move(body).value()));
    return;
  }
  sidecar_->StartCompletion(std::move(body).value(), this);
}

void TaskStore::OnCompletionText(std::string_view text) {
  auto task = tasks_.find(active_task_id_);
  auto conversation = conversations_.find(active_task_id_);
  if (task == tasks_.end() || conversation == conversations_.end()) {
    return;
  }
  // Optional on the wire because a task that has not spoken yet has no narration, which is different
  // from having empty narration.
  if (!task->second->narration.has_value()) {
    task->second->narration = std::string();
  }
  // A turn's first words start a new paragraph rather than continuing the previous turn's sentence.
  // Without this a steered task read as "...the phone numberTaking the new instruction" -- two answers
  // presented as one, which misrepresents both.
  if (!conversation->second.turn_text_started) {
    conversation->second.turn_text_started = true;
    if (!task->second->narration->empty()) {
      task->second->narration->append("\n\n");
    }
  }
  if (task->second->narration->size() + text.size() <= kMaxNarrationBytes) {
    task->second->narration->append(text);
    conversation->second.assistant_text.append(text);
  }
  ScheduleNotify(active_task_id_);
}

void TaskStore::OnCompletionReasoning(std::string_view text) {
  // Recorded as a thinking step's detail rather than appended to the narration: it is the engine's
  // private reasoning, not its answer, and rendering the two as one paragraph would misrepresent it.
  auto task = tasks_.find(active_task_id_);
  if (task == tasks_.end()) {
    return;
  }
  if (task->second->steps.empty() ||
      task->second->steps.back()->kind != mojom::StepKind::kThinking) {
    AddStep(active_task_id_, mojom::StepKind::kThinking, "Thinking");
  }
  AddStepDetail(active_task_id_, std::string(text), std::string());
  ScheduleNotify(active_task_id_);
}

void TaskStore::OnCompletionToolCall(const std::string& id,
                                    const std::string& name,
                                    const std::string& arguments_json) {
  auto conversation = conversations_.find(active_task_id_);
  if (conversation == conversations_.end()) {
    return;
  }
  conversation->second.proposed.push_back({id, name, arguments_json});
}

void TaskStore::OnCompletionFinished(const std::string& finish_reason) {
  const std::string task_id = active_task_id_;
  active_task_id_.clear();

  auto task = tasks_.find(task_id);
  auto conversation = conversations_.find(task_id);
  if (task == tasks_.end() || conversation == conversations_.end()) {
    return;
  }
  // A task the user cancelled while the turn was in flight stays cancelled. The stream's late
  // completion must not resurrect it.
  if (IsTerminal(task->second->state)) {
    return;
  }

  // The assistant's own turn goes into the history first, tool calls included, because a tool result
  // message is only meaningful after the call it answers.
  base::DictValue assistant = TextMessage("assistant", conversation->second.assistant_text);
  if (!conversation->second.proposed.empty()) {
    base::ListValue tool_calls;
    for (const ProposedToolCall& call : conversation->second.proposed) {
      base::DictValue function;
      function.Set("name", call.name);
      function.Set("arguments", call.arguments_json);
      base::DictValue entry;
      entry.Set("id", call.id);
      entry.Set("type", "function");
      entry.Set("function", std::move(function));
      tool_calls.Append(std::move(entry));
    }
    assistant.Set("tool_calls", std::move(tool_calls));
  }
  conversation->second.messages.Append(std::move(assistant));

  if (conversation->second.proposed.empty()) {
    // The turn produced an answer rather than another tool call, which is the moment a queued
    // instruction was waiting for. Taking it here rather than finishing and starting a second task is
    // what makes "queue" mean the same conversation.
    if (DrainQueued(task_id)) {
      base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
          FROM_HERE, base::BindOnce(&TaskStore::StartTurn, weak_factory_.GetWeakPtr(), task_id));
      return;
    }
    // No tool call and nothing said is not success. This used to finish as Succeeded regardless, so a
    // turn that produced zero bytes showed the user a card reading DONE above an empty trace -- told
    // that the task worked and shown nothing. Observed against a real engine that answers the
    // completions route with 200 and an empty stream when it has no account configured, where the
    // browser cannot tell an empty answer from a silent refusal; either way the user has no answer, so
    // the honest report is a failure naming what happened. The engine's finish reason goes to the log
    // rather than the card, since it is a diagnostic and not something a user can act on.
    if (base::TrimWhitespaceASCII(conversation->second.assistant_text, base::TRIM_ALL).empty()) {
      LOG(ERROR) << "the engine ended a turn without an answer (finish_reason='" << finish_reason
                 << "')";
      FinishTask(task_id, mojom::TaskState::kFailed,
                 l10n_util::GetStringUTF8(IDS_REDROB_TASK_ENGINE_NO_ANSWER));
      return;
    }
    FinishTask(task_id, mojom::TaskState::kSucceeded, std::string());
    return;
  }

  const int budget =
      IsMemoryTask(task_id) ? kMemoryToolBudget : ToolBudget(task->second->effort);
  if (conversation->second.tool_rounds >= budget) {
    FinishTask(task_id, mojom::TaskState::kFailed,
               "The task reached the number of steps this effort setting allows. Ask again with a "
               "deeper effort, or narrow the question.");
    return;
  }
  ++conversation->second.tool_rounds;

  // Dispatched, not awaited: a tool may answer from a callback, and FinishTool starts the next turn
  // once the last of them has.
  const std::vector<ProposedToolCall> proposed = conversation->second.proposed;
  for (const ProposedToolCall& call : proposed) {
    RunTool(task_id, call);
  }
}

// static
bool TaskStore::ModeAllows(mojom::PermissionMode mode, const std::string& tool) {
  // Opening and reading are allowed everywhere. Everything that CHANGES something -- a page or the
  // disk -- needs more than read-only. One switch, so a new tool cannot quietly default to allowed.
  if (tool == kToolOpenPage || tool == kToolReadPage) {
    return true;
  }
  // Writing a plan into the trace changes nothing outside the trace, so it needs no more than the
  // narrowest mode. It is gated by EFFORT, not by permission, and the two are different questions.
  if (tool == kToolPlan) {
    return true;
  }
  // Memory is the profile's own list, reviewable and deletable in Settings. Gated by the memory
  // setting -- which is why these are not even declared when it is off -- not by permission mode.
  //
  // memory_write and memory_edit are NOT allowed here in any mode: they belong to memory tasks, which
  // RunTool dispatches before this question is asked.
  if (tool == kToolRecall || tool == kToolMemoryRead || tool == kToolMemoryList) {
    return true;
  }
  if (tool == kToolClick || tool == kToolType || tool == kToolSaveFile) {
    return mode != mojom::PermissionMode::kReadOnly;
  }
  return false;
}

void TaskStore::RunTool(const std::string& task_id, const ProposedToolCall& call) {
  auto task = tasks_.find(task_id);
  auto conversation = conversations_.find(task_id);
  if (task == tasks_.end() || conversation == conversations_.end()) {
    return;
  }

  // A memory task may use the memory tools and nothing else -- no tabs, no files, no clicks.
  const bool memory_task = IsMemoryTask(task_id);
  if (memory_task && !IsMemoryToolName(call.name)) {
    FinishTool(task_id, call, "This is a memory task. Only the memory tools are available here.");
    return;
  }

  // Refusals are recorded in the trace, not swallowed. Someone watching should see what the agent
  // wanted to do and did not get to do -- that is the difference between a permission boundary and a
  // silent failure.
  if (!memory_task && !ModeAllows(task->second->mode, call.name)) {
    if (call.name == kToolMemoryWrite || call.name == kToolMemoryEdit) {
      AddStep(task_id, mojom::StepKind::kRefused,
              l10n_util::GetStringUTF8(IDS_REDROB_TASK_MEMORY_WRITE_REFUSED));
      Notify(task_id);
      FinishTool(task_id, call,
                 "Memory is written after the task, by the browser's own memory run, not during it. "
                 "Carry on with the task.");
      return;
    }
    AddStep(task_id, mojom::StepKind::kRefused,
            "Refused: " + call.name + " is not allowed in this mode");
    Notify(task_id);
    FinishTool(task_id, call,
               "That is not allowed for this task. The user set a narrower permission mode; ask them "
               "to widen it rather than trying again.");
    return;
  }

  // A tool with no parameters (memory_list) may arrive with no argument text at all.
  std::optional<base::DictValue> arguments = base::JSONReader::ReadDict(
      base::TrimWhitespaceASCII(call.arguments_json, base::TRIM_ALL).empty()
          ? std::string_view("{}")
          : std::string_view(call.arguments_json),
      base::JSON_PARSE_RFC);
  if (!arguments) {
    FinishTool(task_id, call, "Those arguments were not readable JSON.");
    return;
  }

  if (IsMemoryToolName(call.name) && RunMemoryTool(task_id, call, *arguments)) {
    return;
  }

  if (call.name == kToolPlan) {
    const std::string* goal = arguments->FindString("goal");
    const base::ListValue* steps = arguments->FindList("steps");
    if (!goal || !steps) {
      FinishTool(task_id, call, "plan_research needs a goal and a list of steps.");
      return;
    }
    mojom::Step* step = AddStep(task_id, mojom::StepKind::kPlanned, *goal);
    if (step) {
      int index = 0;
      for (const base::Value& entry : *steps) {
        if (!entry.is_string() || step->details.size() >= 20) {
          continue;
        }
        mojom::StepDetailPtr detail = mojom::StepDetail::New();
        detail->text = entry.GetString();
        detail->source = base::NumberToString(++index);
        step->details.push_back(std::move(detail));
      }
    }
    Notify(task_id);
    FinishTool(task_id, call,
               "The plan is in the task's trace where the user can see it. Work through it now.");
    return;
  }

  if (call.name == kToolOpenPage) {
    const std::string* url_string = arguments->FindString("url");
    if (!url_string) {
      FinishTool(task_id, call, "open_page needs a url argument.");
      return;
    }
    const GURL url(*url_string);
    const std::string* reason = arguments->FindString("reason");
    content::WebContents* contents = AgentTabs::OpenInAgentGroup(profile_, url, kAgentTabGroupTitle);
    if (!contents) {
      FinishTool(task_id, call,
                 "That page could not be opened. Only http and https pages can be opened, and a "
                 "normal browser window must be open.");
      return;
    }
    // Weak: the tab belongs to the tab strip and the user can close it between one tool call and the
    // next, so every later page tool has to re-check that it is still there.
    conversation->second.page = contents->GetWeakPtr();
    if (conversation->second.visited.size() < kExtractionMaxSteps) {
      conversation->second.visited.emplace_back(url.spec(), std::string());
    }

    mojom::Step* step = AddStep(task_id, mojom::StepKind::kOpenedPage,
                                reason && !reason->empty() ? *reason : "Opened a page");
    if (step) {
      mojom::StepDetailPtr detail = mojom::StepDetail::New();
      detail->text = url.spec();
      detail->source = url.host();
      step->details.push_back(std::move(detail));
      WatchTabFrames(task_id, contents, tasks_[task_id]->steps.size() - 1);
    }
    Notify(task_id);
    FinishTool(task_id, call, "Opened " + url.spec() + " as a tab in the user's browser.");
    return;
  }

  content::WebContents* page = conversation->second.page.get();
  if (!page) {
    FinishTool(task_id, call, "There is no page open for this task. Open one first.");
    return;
  }

  if (call.name == kToolReadPage) {
    // The title is known by the time the agent reads the page; recorded for extraction's history input.
    {
      const std::string committed = page->GetLastCommittedURL().spec();
      const std::string title = base::UTF16ToUTF8(page->GetTitle());
      bool found = false;
      for (auto& [visited_url, visited_title] : conversation->second.visited) {
        if (visited_url == committed) {
          visited_title = title;
          found = true;
        }
      }
      if (!found && conversation->second.visited.size() < kExtractionMaxSteps) {
        conversation->second.visited.emplace_back(committed, title);
      }
    }
    ++conversation->second.pending_tools;
    PageTools::ReadPageText(
        page, base::BindOnce(
                  [](base::WeakPtr<TaskStore> store, std::string task_id, ProposedToolCall call,
                     std::string text) {
                    if (!store) {
                      return;
                    }
                    mojom::Step* step = store->AddStep(task_id, mojom::StepKind::kReadPage,
                                                       "Read the page");
                    if (step) {
                      mojom::StepDetailPtr detail = mojom::StepDetail::New();
                      // A short excerpt in the trace, not the whole page: the trace is for a human
                      // checking what happened, and the full text already went to the engine.
                      detail->text = text.substr(0, 300);
                      step->details.push_back(std::move(detail));
                    }
                    store->Notify(task_id);
                    store->FinishTool(task_id, call,
                                      text.empty() ? "That page had no readable text." : text);
                  },
                  weak_factory_.GetWeakPtr(), task_id, call));
    return;
  }

  if (call.name == kToolClick || call.name == kToolType) {
    const bool is_click = call.name == kToolClick;
    const std::string* target = arguments->FindString(is_click ? "target" : "field");
    const std::string* text = is_click ? nullptr : arguments->FindString("text");
    if (!target || (!is_click && !text)) {
      FinishTool(task_id, call, "That call was missing an argument.");
      return;
    }
    ++conversation->second.pending_tools;
    auto done = base::BindOnce(
        [](base::WeakPtr<TaskStore> store, std::string task_id, ProposedToolCall call,
           mojom::StepKind kind, std::string label, bool ok) {
          if (!store) {
            return;
          }
          if (ok) {
            store->AddStep(task_id, kind, label);
            store->Notify(task_id);
          }
          store->FinishTool(task_id, call,
                            ok ? "Done." : "Nothing on the page matched that. Read the page and use "
                                           "the text the user would see.");
        },
        weak_factory_.GetWeakPtr(), task_id, call,
        is_click ? mojom::StepKind::kClicked : mojom::StepKind::kTyped,
        is_click ? "Clicked \"" + *target + "\"" : "Filled \"" + *target + "\"");
    if (is_click) {
      PageTools::ClickByName(page, *target, std::move(done));
    } else {
      PageTools::TypeIntoField(page, *target, *text, std::move(done));
    }
    return;
  }

  if (call.name == kToolSaveFile) {
    const std::string* name = arguments->FindString("name");
    const std::string* contents = arguments->FindString("contents");
    if (!name || !contents) {
      FinishTool(task_id, call, "save_file needs a name and contents.");
      return;
    }
    // A destination the MODEL supplied. Honoured only in full access, and even then only through the
    // entry point that re-checks the directory on the thread that writes.
    const std::string* folder_argument = arguments->FindString("folder");
    const bool full = task->second->mode == mojom::PermissionMode::kFullAccess;
    if (folder_argument && !folder_argument->empty() && !full) {
      AddStep(task_id, mojom::StepKind::kRefused,
              "Refused: a folder was named, and this task may only write to the chosen one");
      Notify(task_id);
      FinishTool(task_id, call,
                 "This task cannot choose where files go. Save it by name and the browser will put it "
                 "in the folder the user chose.");
      return;
    }

    auto done = base::BindOnce(
        [](base::WeakPtr<TaskStore> store, std::string task_id, ProposedToolCall call,
           std::string name, base::FilePath written) {
          if (!store) {
            return;
          }
          if (written.empty()) {
            store->FinishTool(task_id, call,
                              "That file could not be written. A file of that name may already "
                              "exist, or that folder is one the browser will not write into -- "
                              "hidden directories and the browser's own profile are refused even in "
                              "full access. Choose another name or another folder.");
            return;
          }
          mojom::Step* step =
              store->AddStep(task_id, mojom::StepKind::kSavedArtifact, "Saved " + name);
          if (step) {
            mojom::StepDetailPtr detail = mojom::StepDetail::New();
            detail->text = written.AsUTF8Unsafe();
            step->details.push_back(std::move(detail));
          }
          store->Notify(task_id);
          store->FinishTool(task_id, call, "Saved as " + name + ".");
        },
        weak_factory_.GetWeakPtr(), task_id, call, *name);

    if (folder_argument && !folder_argument->empty()) {
      ++conversation->second.pending_tools;
      FileTools::WriteAtPath(base::FilePath::FromUTF8Unsafe(*folder_argument), *name, *contents,
                             user_data_dir_, std::move(done));
      return;
    }
    // No folder means the user has not chosen one, and no mode invents a destination.
    // Answering with what to ask for is more useful than refusing blankly.
    if (task->second->working_folder.value_or(std::string()).empty()) {
      FinishTool(task_id, call,
                 "No folder has been chosen for this task yet. Ask the user to pick one.");
      return;
    }
    ++conversation->second.pending_tools;
    FileTools::WriteInFolder(working_folders_[task_id], *name, *contents, std::move(done));
    return;
  }

  FinishTool(task_id, call, "This browser does not offer a tool by that name.");
}

void TaskStore::FinishTool(const std::string& task_id,
                           const ProposedToolCall& call,
                           const std::string& result) {
  auto conversation = conversations_.find(task_id);
  if (conversation == conversations_.end()) {
    return;
  }
  base::DictValue message = TextMessage("tool", result);
  message.Set("tool_call_id", call.id);
  message.Set("name", call.name);
  conversation->second.messages.Append(std::move(message));

  if (conversation->second.pending_tools > 0) {
    --conversation->second.pending_tools;
  }
  // The next turn waits for the LAST answer. Sending a turn with some calls unanswered would leave the
  // engine holding a call it proposed and never heard about.
  //
  // POSTED, not called. A synchronous tool answers while the stream that delivered its call is still on
  // the stack, and starting a turn replaces that stream -- destroying the object whose method we are
  // inside. This crashed as a use-after-free the moment a task ran more than two tool rounds.
  if (conversation->second.pending_tools == 0) {
    // Between tool rounds is the other safe boundary: the engine has been answered for everything it
    // proposed, so an instruction inserted here changes what it does next rather than corrupting the
    // turn it is in the middle of.
    DrainQueued(task_id);
    base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::BindOnce(&TaskStore::StartTurn, weak_factory_.GetWeakPtr(), task_id));
  }
}

bool TaskStore::DrainQueued(const std::string& task_id) {
  auto task = tasks_.find(task_id);
  auto conversation = conversations_.find(task_id);
  if (task == tasks_.end() || conversation == conversations_.end() ||
      conversation->second.queued.empty()) {
    return false;
  }
  for (const std::string& prompt : conversation->second.queued) {
    conversation->second.messages.Append(TextMessage("user", prompt));
  }
  conversation->second.queued.clear();
  task->second->queued.clear();
  // The user asking for more work is exactly the consent the step ceiling was protecting, so it
  // resets -- otherwise a long task's queue would be answered by "out of steps".
  conversation->second.tool_rounds = 0;
  Notify(task_id);
  return true;
}

void TaskStore::OnCompletionFailed(const std::string& message) {
  const std::string task_id = active_task_id_;
  active_task_id_.clear();
  if (task_id.empty()) {
    return;
  }
  FinishTask(task_id, mojom::TaskState::kFailed, message);
}

void TaskStore::FinishTask(const std::string& task_id,
                           mojom::TaskState state,
                           const std::string& error) {
  auto task = tasks_.find(task_id);
  if (task == tasks_.end() || IsTerminal(task->second->state)) {
    return;
  }
  task->second->state = state;
  if (!error.empty()) {
    task->second->error = error;
  }
  Notify(task_id);

  if (IsMemoryTask(task_id)) {
    // The run closes whatever the outcome: a failed run that wrote half its changes still has a
    // snapshot and a row, and the user can revert it from Settings. The engine reports no token usage
    // over this endpoint today, so the count stays 0 until it does.
    memory_->EndRun(memory_tasks_[task_id].run_id, 0);
    base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE,
        base::BindOnce(&TaskStore::ForgetMemoryTask, weak_factory_.GetWeakPtr(), task_id));
  } else if (state == mojom::TaskState::kSucceeded && memory_ && memory_->enabled()) {
    StartExtraction(task_id);
  }
  // Posted: this can run inside the stream that just finished, and starting a turn replaces it.
  base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(&TaskStore::StartNextQueued, weak_factory_.GetWeakPtr()));
}

std::vector<mojom::ModelOptionPtr> TaskStore::ListModels() const {
  // The cache, not a fetch: this answers a mojom call that returns a value, and the list is only as
  // fresh as the last time the engine said it was ready. Empty is a MEANINGFUL answer -- it is what a
  // machine with no engine should report, and the chooser says so rather than rendering an empty table.
  std::vector<mojom::ModelOptionPtr> out;
  out.reserve(model_options_.size());
  for (const ModelRecord& record : model_options_) {
    mojom::ModelOptionPtr option = mojom::ModelOption::New();
    option->id = record.id;
    option->provider_id = record.provider_id;
    option->name = record.name;
    option->capabilities = record.capabilities;
    option->price_band = record.price_band;
    out.push_back(std::move(option));
  }
  return out;
}

SidecarClient::Status TaskStore::EngineStatus() const {
  // No client at all reads as not installed rather than failed: nothing has gone wrong, there is simply
  // nothing to talk to, and those are different things to tell a user.
  return sidecar_ ? sidecar_->status() : SidecarClient::Status::kUnavailable;
}

std::string TaskStore::EngineCredential() const {
  // Empty when there is no client, and empty is a refusal upstream, not a licence to send a request with
  // no credential. The only reason this is reachable at all is that the extension's alternative was to
  // keep its own copy in storage and drop the header when that copy was missing (F-5).
  return sidecar_ ? sidecar_->engine_credential() : std::string();
}

std::string TaskStore::EngineBaseUrl() const {
  return sidecar_ ? sidecar_->base_url() : std::string();
}

size_t TaskStore::ModelOptionCount() const {
  return model_options_.size();
}

std::string TaskStore::DefaultModel() {
  return kModel;
}

void TaskStore::RefreshModels() {
  if (!sidecar_) {
    return;
  }
  sidecar_->FetchProviders(
      base::BindOnce(&TaskStore::OnProvidersFetched, weak_factory_.GetWeakPtr()));
}

void TaskStore::OnProvidersFetched(std::optional<std::string> body) {
  if (!body) {
    // Leave whatever was cached. A failed refresh is not evidence that the models went away, and
    // emptying the chooser because one request timed out would be worse than showing a stale list.
    return;
  }
  std::optional<base::DictValue> parsed =
      base::JSONReader::ReadDict(*body, base::JSON_PARSE_RFC);
  if (!parsed) {
    return;
  }
  const base::ListValue* providers = parsed->FindList("providers");
  if (!providers) {
    return;
  }
  std::vector<ModelRecord> found;
  for (const base::Value& provider_value : *providers) {
    const base::DictValue* provider = provider_value.GetIfDict();
    if (!provider) {
      continue;
    }
    const std::string* provider_id = provider->FindString("id");
    if (!provider_id) {
      continue;
    }
    // `models` is a RECORD keyed by model id, not an array -- the engine's schema is
    // Schema.Record(String, Model). This read a list at first and passed its test anyway, because the
    // stub I verified against had been written with a list too: a fixture that agrees with the code
    // proves only that they agree. The key is authoritative for the id, since a record's key is what the
    // engine routes on, and `id` inside the value is only echoed there.
    const base::DictValue* models = provider->FindDict("models");
    if (!models) {
      continue;
    }
    for (const auto [model_key, model_value] : *models) {
      const base::DictValue* model = model_value.GetIfDict();
      if (!model) {
        continue;
      }
      const std::string* model_id = &model_key;
      ModelRecord record;
      // The wire id is provider/model, which is the form the engine routes on and the form the one
      // hardcoded option already used.
      record.id = *provider_id + "/" + *model_id;
      record.provider_id = *provider_id;
      const std::string* name = model->FindString("name");
      record.name = name ? *name : *model_id;
      // Capabilities arrive as a record of flags. Only the TRUE ones are worth carrying: a chooser
      // filters on what a model can do, and a list of false flags is noise the renderer would have to
      // re-filter anyway.
      if (const base::DictValue* capabilities = model->FindDict("capabilities")) {
        for (const auto [flag, enabled] : *capabilities) {
          if (enabled.is_bool() && enabled.GetBool()) {
            record.capabilities.push_back(flag);
          }
        }
      }
      // A band rather than a number. The engine prices per token in fractions of a cent, which is not a
      // thing to put in a menu; and a model the engine does not price at all gets NO band rather than a
      // misleading "free".
      if (const base::DictValue* cost = model->FindDict("cost")) {
        const std::optional<double> input = cost->FindDouble("input");
        const std::optional<double> output = cost->FindDouble("output");
        if (input && output) {
          const double total = *input + *output;
          record.price_band = total == 0 ? "free" : (total < 5.0 ? "standard" : "premium");
        }
      }
      found.push_back(std::move(record));
    }
  }
  model_options_ = std::move(found);
}

void TaskStore::CancelTask(const std::string& task_id) {
  auto it = tasks_.find(task_id);
  // An unknown id is a no-op. It is reachable from a renderer, so it is not an error condition.
  if (it == tasks_.end() || IsTerminal(it->second->state)) {
    return;
  }
  it->second->state = mojom::TaskState::kCancelled;
  if (active_task_id_ == task_id) {
    // Stops delivery as well as the request: the stream's remaining deltas belong to a task the user
    // has already stopped.
    sidecar_->CancelCompletion();
    active_task_id_.clear();
  }
  Notify(task_id);
}

mojom::FollowUpOutcome TaskStore::SendFollowUp(const std::string& task_id,
                                              const std::string& prompt,
                                              mojom::FollowUpMode mode) {
  auto task = tasks_.find(task_id);
  auto conversation = conversations_.find(task_id);
  if (task == tasks_.end() || conversation == conversations_.end() || prompt.empty() ||
      prompt.size() > kMaxPromptBytes) {
    return mojom::FollowUpOutcome::kRejected;
  }

  // An idle task just takes its next turn. This is what a follow-up on a finished task has always
  // meant, and it is the only case where the timing question does not arise.
  if (IsTerminal(task->second->state)) {
    conversation->second.messages.Append(TextMessage("user", prompt));
    conversation->second.tool_rounds = 0;
    task->second->error.reset();
    task->second->state = mojom::TaskState::kQueued;
    Notify(task_id);
    base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::BindOnce(&TaskStore::StartTurn, weak_factory_.GetWeakPtr(), task_id));
    return mojom::FollowUpOutcome::kStartedTurn;
  }

  const bool interrupt = mode == mojom::FollowUpMode::kInterrupt;
  if (!interrupt) {
    // Queued, including for kAuto: pressing Enter on a running task should not throw away the work it
    // is in the middle of. Interrupting is a thing the user asks for by name.
    if (conversation->second.queued.size() >= kMaxQueuedFollowUps) {
      return mojom::FollowUpOutcome::kRejected;
    }
    conversation->second.queued.push_back(prompt);
    task->second->queued.push_back(prompt);
    // Was the literal "Queued: " + prompt, which put an untranslated English word into the trace of a
  // Korean task. Same class as the five strings moved out of the stores earlier.
  AddStep(task_id, mojom::StepKind::kQueuedMessage,
          l10n_util::GetStringFUTF8(IDS_REDROB_TASK_QUEUED_MESSAGE,
                                    base::UTF8ToUTF16(prompt)));
    Notify(task_id);
    return mojom::FollowUpOutcome::kQueued;
  }

  // Interrupting. The partial answer is committed to history first, WITHOUT the tool calls the engine
  // was in the middle of proposing: those were never sent to the browser as a complete turn, so
  // recording them would leave the engine holding calls that will never be answered -- which is
  // exactly the shape of history an OpenAI-compatible endpoint rejects.
  if (active_task_id_ == task_id) {
    if (!conversation->second.assistant_text.empty()) {
      conversation->second.messages.Append(
          TextMessage("assistant", conversation->second.assistant_text));
    }
    conversation->second.proposed.clear();
    conversation->second.pending_tools = 0;
    sidecar_->CancelCompletion();
    active_task_id_.clear();
  }
  conversation->second.messages.Append(TextMessage("user", prompt));
  conversation->second.tool_rounds = 0;
  task->second->error.reset();
  AddStep(task_id, mojom::StepKind::kSteered, "Steered: " + prompt);
  Notify(task_id);
  // Posted for the same reason FinishTool posts: this can be reached while the stream that
  // CancelCompletion just retired is still unwinding.
  base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(&TaskStore::StartTurn, weak_factory_.GetWeakPtr(), task_id));
  return mojom::FollowUpOutcome::kInterrupted;
}

bool TaskStore::WithdrawQueuedFollowUp(const std::string& task_id,
                                       uint32_t index,
                                       const std::string& expected_prompt) {
  auto task = tasks_.find(task_id);
  if (task == tasks_.end()) {
    return false;
  }
  auto conversation = conversations_.find(task_id);
  if (conversation == conversations_.end()) {
    return false;
  }
  // The queue is held twice: once here, and once mirrored onto the Task the renderer sees. Both are
  // checked before either is touched, so a disagreement between them cannot leave one of the two edited.
  std::vector<std::string>& queue = conversation->second.queued;
  std::vector<std::string>& mirror = task->second->queued;
  if (index >= queue.size() || index >= mirror.size()) {
    return false;
  }
  if (queue[index] != expected_prompt || mirror[index] != expected_prompt) {
    // The queue drained or shifted since the page drew it. Refusing is the safe answer: the click was
    // meant for a message that is no longer at this position, and deleting whatever is there now would
    // discard something the user never asked to discard.
    return false;
  }
  queue.erase(queue.begin() + index);
  mirror.erase(mirror.begin() + index);
  // Recorded in the trace for the same reason queueing is: the transcript should say what the user did,
  // and a message that silently disappears from the pending list reads like it ran.
  AddStep(task_id, mojom::StepKind::kQueuedMessage,
          l10n_util::GetStringFUTF8(IDS_REDROB_TASK_WITHDREW_QUEUED,
                                    base::UTF8ToUTF16(expected_prompt)));
  Notify(task_id);
  return true;
}
std::vector<mojom::TaskPtr> TaskStore::ListTasks() const {
  std::vector<mojom::TaskPtr> out;
  out.reserve(tasks_.size());
  for (const auto& [id, task] : tasks_) {
    if (!IsMemoryTask(id)) {
      out.push_back(task->Clone());
    }
  }
  return out;
}

mojom::TaskPtr TaskStore::GetTask(const std::string& task_id) const {
  auto it = tasks_.find(task_id);
  return it == tasks_.end() || IsMemoryTask(task_id) ? nullptr : it->second->Clone();
}

bool TaskStore::SetPermissionMode(const std::string& task_id, mojom::PermissionMode mode) {
  auto it = tasks_.find(task_id);
  if (it == tasks_.end()) {
    return false;
  }
  // Narrowing at any time, widening only before the task has started running. A task already acting on
  // the machine is not the moment to hand it more of it -- and the request to widen arrives from a
  // renderer, which is exactly the caller that should not be able to do that mid-flight.
  const bool widening = mode > it->second->mode;
  if (widening && it->second->state != mojom::TaskState::kQueued) {
    return false;
  }
  it->second->mode = mode;
  Notify(task_id);
  return true;
}

std::optional<std::string> TaskStore::SetWorkingFolder(const std::string& task_id,
                                                      const base::FilePath& folder) {
  auto it = tasks_.find(task_id);
  if (it == tasks_.end() || folder.empty() || !folder.IsAbsolute()) {
    return std::nullopt;
  }
  working_folders_[task_id] = folder;
  // The NAME, not the path. The page shows the user where their files go; the absolute path stays in
  // the browser process, because a renderer holding it has learned the shape of this machine's disk for
  // no benefit to the person using it.
  it->second->working_folder = folder.BaseName().AsUTF8Unsafe();
  // Remembered for the next task. This is the pref a settings screen shows and can clear.
  if (profile_) {
    profile_->GetPrefs()->SetFilePath(prefs::kWorkingFolder, folder);
  }
  Notify(task_id);
  return it->second->working_folder;
}

void TaskStore::OnSidecarStatusChanged(SidecarClient::Status status) {
  if (status == SidecarClient::Status::kReady) {
    // Now that it is serving it can be asked what it routes to. Before the handshake this request would
    // be refused by the client itself.
    RefreshModels();
    // The handshake finished. Anything queued on it can go now.
    for (const auto& [id, task] : tasks_) {
      if (task->state == mojom::TaskState::kQueued) {
        StartTurn(id);
        break;
      }
    }
    return;
  }
  if (status != SidecarClient::Status::kFailed) {
    return;
  }
  // Fail every non-terminal task rather than leaving cards spinning against a dead engine, and say WHICH
  // failure it was. This used to be one hardcoded English sentence for every cause, so an engine too old
  // to serve the contract and an engine that died mid-run read identically -- and neither told the user
  // the one thing that would help. The too-old case is the common one on a machine whose engine has not
  // been updated: without it, the request 404s and the task reports that the connection ended.
  int message_id = IDS_REDROB_TASK_ENGINE_STOPPED;
  switch (sidecar_ ? sidecar_->failure() : SidecarClient::Failure::kOther) {
    case SidecarClient::Failure::kEngineTooOld:
      message_id = IDS_REDROB_TASK_ENGINE_TOO_OLD;
      break;
    case SidecarClient::Failure::kCredentialRejected:
      message_id = IDS_REDROB_TASK_ENGINE_CREDENTIAL;
      break;
    case SidecarClient::Failure::kNone:
    case SidecarClient::Failure::kOther:
      break;
  }
  const std::string message = l10n_util::GetStringUTF8(message_id);
  active_task_id_.clear();
  std::vector<std::string> failed_memory_tasks;
  for (auto& [id, task] : tasks_) {
    if (!IsTerminal(task->state)) {
      task->state = mojom::TaskState::kFailed;
      task->error = message;
      Notify(id);
      if (IsMemoryTask(id)) {
        failed_memory_tasks.push_back(id);
      }
    }
  }
  for (const std::string& id : failed_memory_tasks) {
    memory_->EndRun(memory_tasks_[id].run_id, 0);
    ForgetMemoryTask(id);
  }
}

mojom::Step* TaskStore::AddStep(const std::string& task_id,
                                mojom::StepKind kind,
                                const std::string& label) {
  auto it = tasks_.find(task_id);
  if (it == tasks_.end() || it->second->steps.size() >= kMaxStepsPerTask) {
    return nullptr;
  }
  mojom::StepPtr step = mojom::Step::New();
  step->kind = kind;
  step->label = label;
  step->started_at_ms = NowMs();
  it->second->steps.push_back(std::move(step));
  return it->second->steps.back().get();
}

void TaskStore::AddStepDetail(const std::string& task_id,
                              const std::string& text,
                              const std::string& source) {
  auto it = tasks_.find(task_id);
  if (it == tasks_.end() || it->second->steps.empty()) {
    return;
  }
  mojom::Step* step = it->second->steps.back().get();
  if (step->details.size() >= kMaxDetailsPerStep) {
    // Appended to the last row instead of growing without bound: reasoning arrives in fragments and
    // each fragment is not a row of its own.
    step->details.back()->text.append(text);
    return;
  }
  mojom::StepDetailPtr detail = mojom::StepDetail::New();
  detail->text = text;
  detail->source = source;
  step->details.push_back(std::move(detail));
}


void TaskStore::WatchTabFrames(const std::string& task_id,
                               content::WebContents* contents,
                               size_t step_index) {
  // Chromium 155 made ThumbnailTabHelper a per-tab feature: it is reached through
  // the tab, not through WebContentsUserData. A WebContents that is not in a tab
  // strip (a prerender, a devtools frame) has no TabInterface and no thumbnail.
  tabs::TabInterface* tab = tabs::TabInterface::MaybeGetFromContents(contents);
  ThumbnailTabHelper* helper = tab ? ThumbnailTabHelper::From(tab) : nullptr;
  if (!helper) {
    return;
  }
  scoped_refptr<ThumbnailImage> image = helper->thumbnail();
  if (!image) {
    return;
  }

  PreviewWatch watch;
  watch.image = image;
  watch.subscription = image->Subscribe();
  // Compressed, because the alternative is converting an SkBitmap per frame on the UI thread purely to
  // re-encode it for a data URL. The thumbnail machinery has already produced a JPEG.
  watch.subscription->SetCompressedImageCallback(
      base::BindRepeating(&TaskStore::OnTabFrame, base::Unretained(this), task_id, step_index));
  previews_[task_id].push_back(std::move(watch));
}

void TaskStore::OnTabFrame(std::string task_id,
                           size_t step_index,
                           ThumbnailImage::CompressedThumbnailData data) {
  auto task = tasks_.find(task_id);
  if (task == tasks_.end() || !data || step_index >= task->second->steps.size()) {
    return;
  }
  const std::vector<uint8_t>& bytes = data->data;
  if (bytes.empty() || bytes.size() > kMaxPreviewBytes) {
    return;
  }
  // Replaces rather than accumulates: this is the step's current picture of its page, and keeping every
  // frame a long-lived tab produced would grow without bound for no gain.
  task->second->steps[step_index]->preview_data_url =
      "data:image/jpeg;base64," + base::Base64Encode(bytes);
  ScheduleNotify(task_id);
}

void TaskStore::ScheduleNotify(const std::string& task_id) {
  pending_notify_task_id_ = task_id;
  if (notify_timer_.IsRunning()) {
    return;
  }
  notify_timer_.Start(FROM_HERE, base::Milliseconds(100),
                      base::BindOnce(
                          [](TaskStore* store) {
                            const std::string id = store->pending_notify_task_id_;
                            store->pending_notify_task_id_.clear();
                            if (!id.empty()) {
                              store->Notify(id);
                            }
                          },
                          base::Unretained(this)));
}

void TaskStore::Notify(const std::string& task_id) {
  auto it = tasks_.find(task_id);
  // Memory tasks are hidden: no page renders them, so no observer hears about them.
  if (it == tasks_.end() || IsMemoryTask(task_id)) {
    return;
  }
  for (Observer& observer : observers_) {
    observer.OnTaskChanged(*it->second);
  }
}

// --- CAP-1/CAP-2: page context for skill arming -------------------------------------------------

void TaskStore::CaptureContextTab(const std::string& task_id) {
  auto conversation = conversations_.find(task_id);
  if (conversation == conversations_.end() || !profile_) {
    return;
  }
  BrowserWindowInterface* browser =
      ProfileBrowserCollection::GetForProfile(profile_)->FindTabbedBrowser();
  if (!browser || !browser->GetTabStripModel()) {
    return;
  }
  content::WebContents* active = browser->GetTabStripModel()->GetActiveWebContents();
  if (!active) {
    return;
  }
  const GURL& url = active->GetLastCommittedURL();
  // Only an http(s) page counts as context. A chrome:// surface (the new tab
  // page the task was typed on, Settings) says nothing about which site skill applies.
  if (!url.is_valid() || !url.SchemeIsHTTPOrHTTPS()) {
    return;
  }
  conversation->second.context_url = url.spec();
  conversation->second.context_title = base::UTF16ToUTF8(active->GetTitle());
}

// static
std::optional<base::DictValue> TaskStore::RedrobContext(const Conversation& conversation) {
  std::string url;
  std::string title;
  // The agent's own tab wins: once the task has opened a page, that page is what its next step acts
  // on, so it is the page a site skill has to describe.
  if (content::WebContents* page = conversation.page.get()) {
    const GURL& committed = page->GetLastCommittedURL();
    if (committed.is_valid() && committed.SchemeIsHTTPOrHTTPS()) {
      url = committed.spec();
      title = base::UTF16ToUTF8(page->GetTitle());
    }
  }
  if (url.empty()) {
    url = conversation.context_url;
    title = conversation.context_title;
  }
  if (url.empty()) {
    return std::nullopt;
  }
  base::DictValue context;
  context.Set("page_url", url);
  if (!title.empty()) {
    context.Set("page_title", title);
  }
  return context;
}

// --- Memory runs --------------------------------------------------------------------------------------

bool TaskStore::IsMemoryTask(const std::string& task_id) const {
  return memory_tasks_.count(task_id) > 0;
}

void TaskStore::OnMemoryPrefill(std::string task_id, std::vector<MemoryStore::SearchHit> hits) {
  auto task = tasks_.find(task_id);
  auto conversation = conversations_.find(task_id);
  if (task == tasks_.end() || conversation == conversations_.end() ||
      !conversation->second.awaiting_memory) {
    return;
  }
  conversation->second.awaiting_memory = false;
  if (!hits.empty()) {
    std::string recalled =
        "Lines from this user's memory files that may or may not be relevant here (path:line):";
    for (const MemoryStore::SearchHit& hit : hits) {
      recalled += "\n- " + hit.path + ":" + base::NumberToString(hit.line) + ": " + hit.snippet;
    }
    // Before the user's message, which is the last one in a task that has not had a turn yet.
    base::ListValue& messages = conversation->second.messages;
    auto position = messages.end();
    if (!messages.empty()) {
      --position;
    }
    messages.Insert(position, base::Value(TextMessage("system", recalled)));
    mojom::Step* step =
        AddStep(task_id, mojom::StepKind::kSearchedMemory,
                l10n_util::GetStringFUTF8(IDS_REDROB_TASK_MEMORY_RECALLED,
                                          base::NumberToString16(hits.size())));
    if (step) {
      for (const MemoryStore::SearchHit& hit : hits) {
        mojom::StepDetailPtr detail = mojom::StepDetail::New();
        detail->text = hit.snippet;
        detail->source = hit.path;
        step->details.push_back(std::move(detail));
      }
    }
  }
  if (!IsTerminal(task->second->state)) {
    StartTurn(task_id);
  }
}

bool TaskStore::RunMemoryTool(const std::string& task_id,
                              const ProposedToolCall& call,
                              const base::DictValue& arguments) {
  auto conversation = conversations_.find(task_id);
  if (conversation == conversations_.end()) {
    return false;
  }
  if (!memory_ || !memory_->enabled()) {
    FinishTool(task_id, call,
               "Memory is switched off for this browser. Do not use the memory tools in this task.");
    return true;
  }
  const bool memory_task = IsMemoryTask(task_id);

  if (call.name == kToolMemoryList) {
    std::string answer;
    for (const MemoryStore::FileInfo& file : memory_->files()) {
      answer += file.path + " (" + base::NumberToString(file.bytes) + " bytes)\n";
    }
    FinishTool(task_id, call, answer.empty() ? "There are no memory files yet." : answer);
    return true;
  }

  if (call.name == kToolRecall) {
    const std::string* query = arguments.FindString("query");
    if (!query) {
      FinishTool(task_id, call, "recall needs a query argument.");
      return true;
    }
    ++conversation->second.pending_tools;
    memory_->Search(
        *query, kMemoryHits,
        base::BindOnce(
            [](base::WeakPtr<TaskStore> store, std::string task_id, ProposedToolCall call,
               std::string query, std::vector<MemoryStore::SearchHit> hits) {
              if (!store) {
                return;
              }
              mojom::Step* step = store->AddStep(task_id, mojom::StepKind::kSearchedMemory,
                                                 "Looked back for \"" + query + "\"");
              std::string answer;
              for (const MemoryStore::SearchHit& hit : hits) {
                answer += hit.path + ":" + base::NumberToString(hit.line) + ": " + hit.snippet + "\n";
                if (step) {
                  mojom::StepDetailPtr detail = mojom::StepDetail::New();
                  detail->text = hit.snippet;
                  detail->source = hit.path;
                  step->details.push_back(std::move(detail));
                }
              }
              store->Notify(task_id);
              store->FinishTool(task_id, call,
                                answer.empty() ? "Nothing in memory matches that." : answer);
            },
            weak_factory_.GetWeakPtr(), task_id, call, *query));
    return true;
  }

  const std::string* path = arguments.FindString("path");
  if (!path) {
    FinishTool(task_id, call, call.name + " needs a path argument.");
    return true;
  }

  if (call.name == kToolMemoryRead) {
    ++conversation->second.pending_tools;
    memory_->ReadFile(
        *path, base::BindOnce(
                   [](base::WeakPtr<TaskStore> store, std::string task_id, ProposedToolCall call,
                      std::string path, std::optional<std::string> content) {
                     if (!store) {
                       return;
                     }
                     if (!content) {
                       store->FinishTool(task_id, call,
                                         "There is no memory file at " + path +
                                             ". memory_list shows what exists.");
                       return;
                     }
                     store->AddStep(task_id, mojom::StepKind::kSearchedMemory,
                                    l10n_util::GetStringFUTF8(IDS_REDROB_TASK_MEMORY_READ,
                                                              base::UTF8ToUTF16(path)));
                     store->Notify(task_id);
                     store->FinishTool(task_id, call,
                                       content->empty() ? "(empty file)" : *content);
                   },
                   weak_factory_.GetWeakPtr(), task_id, call, *path));
    return true;
  }

  if (call.name != kToolMemoryWrite && call.name != kToolMemoryEdit) {
    return false;
  }
  // The write boundary, checked a second time where the write happens rather than only where the tool
  // is declared: a model can name a tool it was never offered.
  if (!memory_task) {
    AddStep(task_id, mojom::StepKind::kRefused,
            l10n_util::GetStringUTF8(IDS_REDROB_TASK_MEMORY_WRITE_REFUSED));
    Notify(task_id);
    FinishTool(task_id, call, "Only the browser's memory run may change memory.");
    return true;
  }
  const std::string run_id = memory_tasks_[task_id].run_id;
  auto done = base::BindOnce(
      [](base::WeakPtr<TaskStore> store, std::string task_id, ProposedToolCall call,
         std::string path, bool ok, const std::string& message) {
        if (!store) {
          return;
        }
        store->FinishTool(task_id, call, ok ? "Saved " + path + "." : message);
      },
      weak_factory_.GetWeakPtr(), task_id, call, *path);
  if (call.name == kToolMemoryWrite) {
    const std::string* content = arguments.FindString("content");
    if (!content) {
      FinishTool(task_id, call, "memory_write needs path and content.");
      return true;
    }
    ++conversation->second.pending_tools;
    memory_->WriteFile(run_id, *path, *content, std::move(done));
    return true;
  }
  const std::string* old_text = arguments.FindString("old");
  const std::string* new_text = arguments.FindString("new");
  if (!old_text || !new_text) {
    FinishTool(task_id, call, "memory_edit needs path, old and new.");
    return true;
  }
  ++conversation->second.pending_tools;
  memory_->EditFile(run_id, *path, *old_text, *new_text, std::move(done));
  return true;
}

std::string TaskStore::StartMemoryTask(bool consolidate, const std::string& prompt) {
  if (!memory_ || !memory_->enabled() || prompt.empty()) {
    return std::string();
  }
  sidecar_->EnsureStarted(
      url_loader_factory_,
      base::BindRepeating(&TaskStore::OnSidecarStatusChanged, base::Unretained(this)));
  const bool direct = models_ && models_->Selected().has_value();
  if (!direct && (sidecar_->status() == SidecarClient::Status::kUnavailable ||
                  sidecar_->status() == SidecarClient::Status::kFailed)) {
    return std::string();
  }

  const std::string task_id = base::Uuid::GenerateRandomV4().AsLowercaseString();
  mojom::TaskPtr task = mojom::Task::New();
  task->id = task_id;
  task->prompt = consolidate ? "Memory consolidation" : "Memory extraction";
  task->state = mojom::TaskState::kQueued;
  task->started_at_ms = NowMs();
  // Read-only: the browser tools a mode would grant are not declared to a memory task at all, but the
  // record should not claim a permission the task does not have.
  task->mode = mojom::PermissionMode::kReadOnly;
  task->effort = mojom::Effort::kStandard;
  tasks_[task_id] = std::move(task);

  Conversation conversation;
  conversation.messages.Append(TextMessage("system", kMemorySystemPrompt));
  conversation.messages.Append(TextMessage("user", prompt));
  conversations_[task_id] = std::move(conversation);

  MemoryTaskInfo info;
  info.consolidate = consolidate;
  info.run_id = memory_->BeginRun(consolidate ? MemoryStore::RunKind::kConsolidate
                                              : MemoryStore::RunKind::kExtract);
  memory_tasks_[task_id] = std::move(info);

  base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(&TaskStore::StartTurn, weak_factory_.GetWeakPtr(), task_id));
  return task_id;
}

void TaskStore::StartExtraction(const std::string& task_id) {
  auto task = tasks_.find(task_id);
  auto conversation = conversations_.find(task_id);
  if (task == tasks_.end() || conversation == conversations_.end()) {
    return;
  }
  std::string prompt = kExtractionPrompt;
  prompt += "\n\nThe episodic file for today is episodic/" + TodayName() + ".md.";
  prompt += "\n\n## What the user asked\n" + task->second->prompt;

  const std::string answer = task->second->narration.value_or(std::string());
  prompt += "\n\n## The final answer\n";
  prompt += answer.size() > kExtractionAnswerBytes
                ? answer.substr(answer.size() - kExtractionAnswerBytes)
                : answer;

  // The step list carries labels and hosts, never page text.
  prompt += "\n\n## What the agent did\n";
  std::set<std::string> hosts;
  size_t listed = 0;
  for (const mojom::StepPtr& step : task->second->steps) {
    if (step->kind == mojom::StepKind::kThinking) {
      continue;
    }
    if (step->kind == mojom::StepKind::kOpenedPage) {
      for (const mojom::StepDetailPtr& detail : step->details) {
        if (!detail->source.empty()) {
          hosts.insert(detail->source);
        }
      }
    }
    if (listed++ >= kExtractionMaxSteps) {
      break;
    }
    prompt += "- " + step->label + "\n";
  }
  if (!hosts.empty()) {
    prompt += "\n## Sites the agent used\n";
    for (const std::string& host : hosts) {
      prompt += "- " + host + "\n";
    }
  }
  // Titles and URLs only when the user turned history input on, and only this task's own tab.
  if (memory_->history_input() && !conversation->second.visited.empty()) {
    prompt += "\n## Pages the agent's tab visited during this task\n";
    for (const auto& [url, title] : conversation->second.visited) {
      prompt += "- " + (title.empty() ? url : title + " -- " + url) + "\n";
    }
  }
  StartMemoryTask(/*consolidate=*/false, prompt);
}

bool TaskStore::StartConsolidation(bool force) {
  if (!memory_ || !memory_->enabled()) {
    return false;
  }
  for (const auto& [id, info] : memory_tasks_) {
    if (info.consolidate) {
      return false;
    }
  }
  if (!force) {
    if (memory_->ExtractionRunsSinceConsolidation() < 3) {
      return false;
    }
    const int64_t last = memory_->last_consolidation_ms();
    if (last > 0 && NowMs() - last < base::Days(1).InMilliseconds()) {
      return false;
    }
  }
  std::string prompt = kConsolidationPrompt;
  prompt += "\n\nToday is " + TodayName() + ".";
  return !StartMemoryTask(/*consolidate=*/true, prompt).empty();
}

void TaskStore::StartNextQueued() {
  if (!active_task_id_.empty()) {
    return;
  }
  // Oldest first, so the user's waiting task goes before a memory run queued behind it.
  std::string next;
  int64_t oldest = 0;
  for (const auto& [id, task] : tasks_) {
    if (task->state != mojom::TaskState::kQueued) {
      continue;
    }
    auto conversation = conversations_.find(id);
    if (conversation == conversations_.end() || conversation->second.awaiting_memory) {
      continue;
    }
    if (next.empty() || task->started_at_ms < oldest) {
      next = id;
      oldest = task->started_at_ms;
    }
  }
  if (!next.empty()) {
    StartTurn(next);
  }
}

void TaskStore::ForgetMemoryTask(const std::string& task_id) {
  if (!IsMemoryTask(task_id) || active_task_id_ == task_id) {
    return;
  }
  memory_tasks_.erase(task_id);
  conversations_.erase(task_id);
  tasks_.erase(task_id);
}

}  // namespace redrob
