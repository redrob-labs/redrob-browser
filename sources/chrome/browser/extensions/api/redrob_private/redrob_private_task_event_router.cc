// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_task_event_router.h"

#include <memory>
#include <utility>

#include "chrome/browser/extensions/api/redrob_private/redrob_private_api.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/task_store_factory.h"
#include "chrome/common/extensions/api/redrob_private.h"
#include "content/public/browser/browser_context.h"
#include "extensions/browser/event_router.h"

namespace extensions {

namespace redrob_private = api::redrob_private;

RedrobPrivateTaskEventRouter::RedrobPrivateTaskEventRouter(
    content::BrowserContext* context)
    : context_(context) {
  Profile* profile = Profile::FromBrowserContext(context);
  store_ = profile ? redrob::TaskStoreFactory::GetForProfile(profile) : nullptr;
  if (store_) {
    store_->AddObserver(this);
  }
}

RedrobPrivateTaskEventRouter::~RedrobPrivateTaskEventRouter() = default;

void RedrobPrivateTaskEventRouter::Shutdown() {
  // Dropped here rather than in the destructor: at shutdown both services are
  // still alive and the order is known, which it is not once destruction starts.
  if (store_) {
    store_->RemoveObserver(this);
    store_ = nullptr;
  }
}

void RedrobPrivateTaskEventRouter::OnTaskChanged(
    const redrob::mojom::Task& task) {
  EventRouter* event_router = EventRouter::Get(context_);
  if (!event_router) {
    return;
  }
  // The whole task, not a diff: a page that missed one event would otherwise be
  // left holding a record it cannot repair.
  auto event = std::make_unique<Event>(
      events::REDROBPRIVATE_ON_TASK_CHANGED,
      redrob_private::OnTaskChanged::kEventName,
      redrob_private::OnTaskChanged::Create(ToPrivateTask(task)));
  event_router->BroadcastEvent(std::move(event));
}

}  // namespace extensions
