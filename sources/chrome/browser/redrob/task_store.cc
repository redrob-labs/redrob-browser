// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/task_store.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/strings/escape.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include "base/base64.h"
#include "base/path_service.h"
#include "base/task/sequenced_task_runner.h"
#include "chrome/browser/redrob/agent_tabs.h"
#include "chrome/common/chrome_paths.h"
#include "chrome/browser/redrob/file_tools.h"
#include "chrome/browser/redrob/page_tools.h"
#include "chrome/browser/ui/thumbnails/thumbnail_tab_helper.h"
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
// without a ceiling a model that keeps proposing tools keeps the browser opening tabs forever.
constexpr int kMaxToolRounds = 8;

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

base::ListValue BrowserTools(mojom::PermissionMode mode) {
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
      tools.Append(MakeTool(kToolSaveFile,
                            "Save text as a file in the folder the user chose for this task.",
                            std::move(properties), std::move(required)));
    }
  }

  return tools;
}

std::string SystemPrompt() {
  return
      "You are the agent inside the Redrob browser. You are answering a task the user typed on their "
      "new tab page. When you need to look at a page on the web, call open_page: it opens a real tab "
      "in the user's own browser, which they can see and take over. Explain what you are doing as you "
      "go, in short prose -- the user reads it as the task's trace.";
}

}  // namespace

TaskStore::TaskStore(Profile* profile,
                     scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory)
    : profile_(profile),
      url_loader_factory_(std::move(url_loader_factory)),
      sidecar_(std::make_unique<SidecarClient>()) {}

TaskStore::~TaskStore() = default;

void TaskStore::AddObserver(Observer* observer) {
  observers_.AddObserver(observer);
}

void TaskStore::RemoveObserver(Observer* observer) {
  observers_.RemoveObserver(observer);
}

std::pair<std::optional<std::string>, std::optional<mojom::StartError>> TaskStore::StartTask(
    const std::string& prompt,
    const std::vector<std::string>& context_refs,
    mojom::PermissionMode mode) {
  if (prompt.empty() || prompt.size() > kMaxPromptBytes ||
      context_refs.size() > kMaxContextRefs) {
    // Dropping the extra refs silently would make the page's view of its own request wrong, which is
    // a worse failure than refusing it.
    return {std::nullopt, mojom::StartError::kEmptyPrompt};
  }

  size_t running = 0;
  for (const auto& [id, task] : tasks_) {
    if (!IsTerminal(task->state)) {
      ++running;
    }
  }
  if (running >= kMaxConcurrentTasks) {
    return {std::nullopt, mojom::StartError::kTooManyRunningTasks};
  }

  sidecar_->EnsureStarted(
      url_loader_factory_,
      base::BindRepeating(&TaskStore::OnSidecarStatusChanged, base::Unretained(this)));
  if (sidecar_->status() == SidecarClient::Status::kUnavailable ||
      sidecar_->status() == SidecarClient::Status::kFailed) {
    return {std::nullopt, mojom::StartError::kSidecarUnavailable};
  }

  // The id is generated here rather than by the engine: the page needs something to render against
  // before any request has been answered, and a browser-side id cannot be forged by the renderer.
  const std::string task_id = base::Uuid::GenerateRandomV4().AsLowercaseString();

  mojom::TaskPtr task = mojom::Task::New();
  task->id = task_id;
  task->prompt = prompt;
  task->state = mojom::TaskState::kQueued;
  task->started_at_ms = NowMs();
  task->mode = mode;
  tasks_[task_id] = std::move(task);

  Conversation conversation;
  conversation.messages.Append(TextMessage("system", SystemPrompt()));
  conversation.messages.Append(TextMessage("user", prompt));
  conversations_[task_id] = std::move(conversation);

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
    tasks_.erase(oldest);
  }

  StartTurn(task_id);
  return {task_id, std::nullopt};
}

void TaskStore::StartTurn(const std::string& task_id) {
  auto task = tasks_.find(task_id);
  auto conversation = conversations_.find(task_id);
  if (task == tasks_.end() || conversation == conversations_.end()) {
    return;
  }

  // One stream per client. A second task must wait rather than silently replace the first, which the
  // concurrency ceiling in StartTask is what keeps bounded.
  if (!active_task_id_.empty() && active_task_id_ != task_id) {
    task->second->state = mojom::TaskState::kQueued;
    Notify(task_id);
    return;
  }

  if (sidecar_->status() != SidecarClient::Status::kReady) {
    // Still handshaking. The status callback brings us back here.
    task->second->state = mojom::TaskState::kQueued;
    Notify(task_id);
    return;
  }

  base::DictValue request;
  request.Set("model", kModel);
  request.Set("stream", true);
  request.Set("messages", conversation->second.messages.Clone());
  request.Set("tools", BrowserTools(task->second->mode));

  std::optional<std::string> body = base::WriteJson(request);
  if (!body.has_value()) {
    FinishTask(task_id, mojom::TaskState::kFailed, "The task could not be encoded for the engine.");
    return;
  }

  active_task_id_ = task_id;
  conversation->second.assistant_text.clear();
  conversation->second.proposed.clear();
  task->second->state = mojom::TaskState::kRunning;
  Notify(task_id);
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
    FinishTask(task_id, mojom::TaskState::kSucceeded, std::string());
    return;
  }

  if (conversation->second.tool_rounds >= kMaxToolRounds) {
    FinishTask(task_id, mojom::TaskState::kFailed,
               "The task kept asking for more pages than one task is allowed to open.");
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

  // Refusals are recorded in the trace, not swallowed. Someone watching should see what the agent
  // wanted to do and did not get to do -- that is the difference between a permission boundary and a
  // silent failure.
  if (!ModeAllows(task->second->mode, call.name)) {
    AddStep(task_id, mojom::StepKind::kRefused,
            "Refused: " + call.name + " is not allowed in this mode");
    Notify(task_id);
    FinishTool(task_id, call,
               "That is not allowed for this task. The user set a narrower permission mode; ask them "
               "to widen it rather than trying again.");
    return;
  }

  std::optional<base::DictValue> arguments =
      base::JSONReader::ReadDict(call.arguments_json, base::JSON_PARSE_RFC);
  if (!arguments) {
    FinishTool(task_id, call, "Those arguments were not readable JSON.");
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
    // No folder means the user has not chosen one, and Guard mode does not invent a destination.
    // Answering with what to ask for is more useful than refusing blankly.
    if (task->second->working_folder.value_or(std::string()).empty()) {
      FinishTool(task_id, call,
                 "No folder has been chosen for this task yet. Ask the user to pick one.");
      return;
    }
    ++conversation->second.pending_tools;
    FileTools::WriteInFolder(
        working_folders_[task_id], *name, *contents,
        base::BindOnce(
            [](base::WeakPtr<TaskStore> store, std::string task_id, ProposedToolCall call,
               std::string name, base::FilePath written) {
              if (!store) {
                return;
              }
              if (written.empty()) {
                store->FinishTool(task_id, call,
                                  "That file could not be written. A file of that name may already "
                                  "exist -- choose another name.");
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
            weak_factory_.GetWeakPtr(), task_id, call, *name));
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
    base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::BindOnce(&TaskStore::StartTurn, weak_factory_.GetWeakPtr(), task_id));
  }
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

bool TaskStore::Reply(const std::string& task_id, const std::string& prompt) {
  auto task = tasks_.find(task_id);
  auto conversation = conversations_.find(task_id);
  if (task == tasks_.end() || conversation == conversations_.end() || prompt.empty() ||
      prompt.size() > kMaxPromptBytes) {
    return false;
  }
  // A reply continues the same conversation rather than starting a new one, which is what the task
  // tab's composer means. The tool budget resets with it: the user asking for more work is exactly the
  // consent the ceiling was protecting.
  conversation->second.messages.Append(TextMessage("user", prompt));
  conversation->second.tool_rounds = 0;
  task->second->error.reset();
  task->second->narration.reset();
  StartTurn(task_id);
  return true;
}

std::vector<mojom::TaskPtr> TaskStore::ListTasks() const {
  std::vector<mojom::TaskPtr> out;
  out.reserve(tasks_.size());
  for (const auto& [id, task] : tasks_) {
    out.push_back(task->Clone());
  }
  return out;
}

mojom::TaskPtr TaskStore::GetTask(const std::string& task_id) const {
  auto it = tasks_.find(task_id);
  return it == tasks_.end() ? nullptr : it->second->Clone();
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

void TaskStore::ChooseWorkingFolder(
    const std::string& task_id,
    base::OnceCallback<void(const std::optional<std::string>&)> callback) {
  auto it = tasks_.find(task_id);
  if (it == tasks_.end()) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  // Downloads, until the picker is wired: a real directory the user already knows about and can find,
  // rather than a path this code invented. It is recorded on the task so the tab shows where its files
  // go, and the model is never told the path -- only that a folder exists.
  base::FilePath folder;
  if (!base::PathService::Get(chrome::DIR_DEFAULT_DOWNLOADS, &folder) || folder.empty()) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  working_folders_[task_id] = folder;
  it->second->working_folder = folder.BaseName().AsUTF8Unsafe();
  Notify(task_id);
  std::move(callback).Run(it->second->working_folder);
}

void TaskStore::OnSidecarStatusChanged(SidecarClient::Status status) {
  if (status == SidecarClient::Status::kReady) {
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
  // Fail every non-terminal task rather than leaving cards spinning against a dead engine.
  active_task_id_.clear();
  for (auto& [id, task] : tasks_) {
    if (!IsTerminal(task->state)) {
      task->state = mojom::TaskState::kFailed;
      task->error = "The Redrob Code engine stopped responding.";
      Notify(id);
    }
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
  ThumbnailTabHelper* helper = ThumbnailTabHelper::FromWebContents(contents);
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
  if (it == tasks_.end()) {
    return;
  }
  for (Observer& observer : observers_) {
    observer.OnTaskChanged(*it->second);
  }
}

}  // namespace redrob
