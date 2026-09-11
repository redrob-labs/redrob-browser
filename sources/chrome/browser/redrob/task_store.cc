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
#include "chrome/browser/redrob/agent_tabs.h"
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

// How many times one task may go engine -> tool -> engine. The loop is driven by model output, so
// without a ceiling a model that keeps proposing tools keeps the browser opening tabs forever.
constexpr int kMaxToolRounds = 8;

// The group the agent's tabs are collected under. Matches the sidebar's "Agent tabs" section.
constexpr char kAgentTabGroupTitle[] = "Agent tabs";

// The Redrob provider's model selector. "auto" lets the engine pick, which is what the surface's
// default model chip shows.
constexpr char kModel[] = "redrob/auto";

constexpr char kToolOpenPage[] = "open_page";

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

// What the BROWSER can do, declared to the engine in its own wire format. This list is the entire
// surface a model's output can reach: a name that is not here cannot be run, so adding to it is the
// decision worth reviewing, not the loop that dispatches it.
base::ListValue BrowserTools() {
  base::DictValue parameters;
  parameters.Set("type", "object");
  base::DictValue properties;
  base::DictValue url_property;
  url_property.Set("type", "string");
  url_property.Set("description", "The http or https URL to open.");
  properties.Set("url", std::move(url_property));
  base::DictValue reason_property;
  reason_property.Set("type", "string");
  reason_property.Set("description", "Why this page is being opened, shown to the user in the trace.");
  properties.Set("reason", std::move(reason_property));
  parameters.Set("properties", std::move(properties));
  base::ListValue required;
  required.Append("url");
  parameters.Set("required", std::move(required));

  base::DictValue function;
  function.Set("name", kToolOpenPage);
  function.Set("description",
                "Open a page as a real browser tab, in the user's own session, grouped under \"Agent "
                "tabs\" where the user can watch it, take it over, or close it.");
  function.Set("parameters", std::move(parameters));

  base::DictValue tool;
  tool.Set("type", "function");
  tool.Set("function", std::move(function));

  base::ListValue tools;
  tools.Append(std::move(tool));
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
    const std::vector<std::string>& context_refs) {
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
  request.Set("tools", BrowserTools());

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

  const std::vector<ProposedToolCall> proposed = conversation->second.proposed;
  for (const ProposedToolCall& call : proposed) {
    const std::string result = RunTool(task_id, call);
    base::DictValue message = TextMessage("tool", result);
    message.Set("tool_call_id", call.id);
    message.Set("name", call.name);
    conversation->second.messages.Append(std::move(message));
  }
  StartTurn(task_id);
}

std::string TaskStore::RunTool(const std::string& task_id, const ProposedToolCall& call) {
  // Dispatch by exact name against the declared list. An unknown name is refused rather than guessed
  // at, because the name came from model output.
  if (call.name != kToolOpenPage) {
    return "This browser does not offer a tool by that name.";
  }

  std::optional<base::DictValue> arguments =
      base::JSONReader::ReadDict(call.arguments_json, base::JSON_PARSE_RFC);
  const std::string* url_string = arguments ? arguments->FindString("url") : nullptr;
  if (!url_string) {
    return "open_page needs a url argument.";
  }
  const GURL url(*url_string);
  const std::string* reason = arguments->FindString("reason");

  if (!AgentTabs::OpenInAgentGroup(profile_, url, kAgentTabGroupTitle)) {
    // Reported back so the engine can choose another route instead of retrying the same refusal.
    return "That page could not be opened. Only http and https pages can be opened, and a normal "
           "browser window must be open.";
  }

  mojom::Step* step = AddStep(task_id, mojom::StepKind::kOpenedPage,
                              reason && !reason->empty() ? *reason : "Opened a page");
  if (step) {
    mojom::StepDetailPtr detail = mojom::StepDetail::New();
    detail->text = url.spec();
    detail->source = url.host();
    step->details.push_back(std::move(detail));
  }
  Notify(task_id);
  return "Opened " + url.spec() + " as a tab in the user's browser.";
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

bool TaskStore::SetRouting(mojom::RoutingMode mode) {
  // Accepted unconditionally today because both modes are sidecar policy and the sidecar does not yet
  // route by them. When it does, a mode the engine refuses must come back false rather than be stored.
  routing_ = mode;
  return true;
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
