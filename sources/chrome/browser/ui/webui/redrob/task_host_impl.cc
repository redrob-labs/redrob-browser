// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/webui/redrob/task_host_impl.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/strings/strcat.h"
#include "base/time/time.h"
#include "base/uuid.h"

namespace redrob {
namespace {

// A renderer can send any string. This is not a UX limit; it is a bound on what the browser process
// will hold on behalf of a page.
constexpr size_t kMaxPromptBytes = 32 * 1024;
constexpr size_t kMaxContextRefs = 32;
constexpr size_t kMaxConcurrentTasks = 4;

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

TaskHostImpl::TaskHostImpl(mojo::PendingReceiver<mojom::TaskHost> receiver,
                           mojo::PendingRemote<mojom::Page> page,
                           scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory)
    : receiver_(this, std::move(receiver)),
      page_(std::move(page)),
      url_loader_factory_(std::move(url_loader_factory)),
      sidecar_(std::make_unique<SidecarClient>()) {}

TaskHostImpl::~TaskHostImpl() = default;

void TaskHostImpl::StartTask(const std::string& prompt,
                             const std::vector<std::string>& context_refs,
                             StartTaskCallback callback) {
  if (prompt.empty() || prompt.size() > kMaxPromptBytes) {
    std::move(callback).Run(std::nullopt, mojom::StartError::kEmptyPrompt);
    return;
  }
  if (context_refs.size() > kMaxContextRefs) {
    // Dropping the extras silently would make the page's view of its own request wrong, which is a
    // worse failure than refusing it.
    std::move(callback).Run(std::nullopt, mojom::StartError::kEmptyPrompt);
    return;
  }

  size_t running = 0;
  for (const auto& [id, task] : tasks_) {
    if (!IsTerminal(task->state)) {
      ++running;
    }
  }
  if (running >= kMaxConcurrentTasks) {
    std::move(callback).Run(std::nullopt, mojom::StartError::kTooManyRunningTasks);
    return;
  }

  sidecar_->EnsureStarted(url_loader_factory_,
                          base::BindRepeating(&TaskHostImpl::OnSidecarStatusChanged,
                                              base::Unretained(this)));
  if (sidecar_->status() == SidecarClient::Status::kUnavailable ||
      sidecar_->status() == SidecarClient::Status::kFailed) {
    std::move(callback).Run(std::nullopt, mojom::StartError::kSidecarUnavailable);
    return;
  }

  // The id is generated here rather than by the engine: the page needs something to render against
  // before any request has been answered, and a browser-side id cannot be forged by the renderer.
  const std::string task_id = base::Uuid::GenerateRandomV4().AsLowercaseString();

  mojom::TaskPtr task = mojom::Task::New();
  task->id = task_id;
  task->prompt = prompt;
  task->state = mojom::TaskState::kQueued;
  mojom::StepPtr step = mojom::Step::New();
  step->label = "Queued for the engine";
  step->started_at_ms = NowMs();
  task->steps.push_back(std::move(step));
  tasks_[task_id] = std::move(task);

  NotifyPage(task_id);
  std::move(callback).Run(task_id, std::nullopt);

  // The request itself is not sent yet. Readiness is a two-step handshake -- the engine's startup line
  // and GET /global/health -- and posting a completion request before it lands would race the bind.
  // The task therefore stays kQueued, visibly, instead of being reported as running.
}

void TaskHostImpl::CancelTask(const std::string& task_id) {
  auto it = tasks_.find(task_id);
  // An unknown id is a no-op. It is reachable from a renderer, so it is not an error condition.
  if (it == tasks_.end() || IsTerminal(it->second->state)) {
    return;
  }
  it->second->state = mojom::TaskState::kCancelled;
  NotifyPage(task_id);
}

void TaskHostImpl::ListTasks(ListTasksCallback callback) {
  std::vector<mojom::TaskPtr> out;
  out.reserve(tasks_.size());
  for (const auto& [id, task] : tasks_) {
    out.push_back(task->Clone());
  }
  std::move(callback).Run(std::move(out));
}

void TaskHostImpl::SetRouting(mojom::RoutingMode mode, SetRoutingCallback callback) {
  // Accepted unconditionally today because both modes are sidecar policy and the sidecar is not
  // connected. When it is, a mode the engine refuses must come back as false rather than be stored.
  routing_ = mode;
  std::move(callback).Run(true);
}

void TaskHostImpl::OnSidecarStatusChanged(SidecarClient::Status status) {
  if (status != SidecarClient::Status::kFailed) {
    return;
  }
  // Fail every non-terminal task rather than leaving cards spinning against a dead engine.
  for (auto& [id, task] : tasks_) {
    if (!IsTerminal(task->state)) {
      task->state = mojom::TaskState::kFailed;
      task->error = "The Redrob Code engine stopped responding.";
      NotifyPage(id);
    }
  }
}

void TaskHostImpl::NotifyPage(const std::string& task_id) {
  auto it = tasks_.find(task_id);
  if (it == tasks_.end() || !page_.is_bound()) {
    return;
  }
  page_->OnTaskChanged(it->second->Clone());
}

}  // namespace redrob
