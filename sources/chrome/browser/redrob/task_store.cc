// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/task_store.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/time/time.h"
#include "base/uuid.h"

namespace redrob {
namespace {

// A renderer can send any string. These are not UX limits; they bound what the browser process will
// hold on behalf of a page.
constexpr size_t kMaxPromptBytes = 32 * 1024;
constexpr size_t kMaxContextRefs = 32;
constexpr size_t kMaxConcurrentTasks = 4;
constexpr size_t kMaxTasks = 200;

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

}  // namespace

TaskStore::TaskStore(scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory)
    : url_loader_factory_(std::move(url_loader_factory)),
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
    tasks_.erase(oldest);
  }

  AddStep(task_id, mojom::StepKind::kThinking, "Queued for the engine");
  return {task_id, std::nullopt};
}

void TaskStore::CancelTask(const std::string& task_id) {
  auto it = tasks_.find(task_id);
  // An unknown id is a no-op. It is reachable from a renderer, so it is not an error condition.
  if (it == tasks_.end() || IsTerminal(it->second->state)) {
    return;
  }
  it->second->state = mojom::TaskState::kCancelled;
  Notify(task_id);
}

bool TaskStore::Reply(const std::string& task_id, const std::string& prompt) {
  auto it = tasks_.find(task_id);
  if (it == tasks_.end() || prompt.empty() || prompt.size() > kMaxPromptBytes) {
    return false;
  }
  // A reply revives a finished task rather than starting a new one, which is what the task tab's
  // composer means. The engine turn itself waits on the completion transport.
  it->second->state = mojom::TaskState::kQueued;
  it->second->error.reset();
  AddStep(task_id, mojom::StepKind::kThinking, prompt);
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
  // Accepted unconditionally today because both modes are sidecar policy and the sidecar does not
  // run turns yet. When it does, a mode the engine refuses must come back false rather than be stored.
  routing_ = mode;
  return true;
}

void TaskStore::OnSidecarStatusChanged(SidecarClient::Status status) {
  if (status != SidecarClient::Status::kFailed) {
    return;
  }
  // Fail every non-terminal task rather than leaving cards spinning against a dead engine.
  for (auto& [id, task] : tasks_) {
    if (!IsTerminal(task->state)) {
      task->state = mojom::TaskState::kFailed;
      task->error = "The Redrob Code engine stopped responding.";
      Notify(id);
    }
  }
}

void TaskStore::AddStep(const std::string& task_id,
                        mojom::StepKind kind,
                        const std::string& label) {
  auto it = tasks_.find(task_id);
  if (it == tasks_.end()) {
    return;
  }
  mojom::StepPtr step = mojom::Step::New();
  step->kind = kind;
  step->label = label;
  step->started_at_ms = NowMs();
  it->second->steps.push_back(std::move(step));
  Notify(task_id);
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
