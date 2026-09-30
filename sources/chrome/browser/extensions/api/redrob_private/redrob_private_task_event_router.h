// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_TASK_EVENT_ROUTER_H_
#define CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_TASK_EVENT_ROUTER_H_

#include "base/memory/raw_ptr.h"
#include "chrome/browser/redrob/task_store.h"
#include "components/keyed_service/core/keyed_service.h"

namespace content {
class BrowserContext;
}  // namespace content

namespace extensions {

// Turns TaskStore's OnTaskChanged into the redrobPrivate.onTaskChanged event.
//
// This exists as a service rather than as part of a function because a task
// changes long after any call returned: the mojom carried the same signal on a
// Page remote the WebUI held open, and an extension has no equivalent to hold.
//
// It is created WITH the browser context, unlike the import manager, which is
// created lazily on first use. A lazily created observer would not be watching
// until something happened to call a function, so the first steps of the first
// task would be dropped — and those are exactly the ones a page is waiting for.
class RedrobPrivateTaskEventRouter : public KeyedService,
                                    public redrob::TaskStore::Observer {
 public:
  explicit RedrobPrivateTaskEventRouter(content::BrowserContext* context);
  RedrobPrivateTaskEventRouter(const RedrobPrivateTaskEventRouter&) = delete;
  RedrobPrivateTaskEventRouter& operator=(const RedrobPrivateTaskEventRouter&) =
      delete;
  ~RedrobPrivateTaskEventRouter() override;

  // KeyedService
  void Shutdown() override;

  // redrob::TaskStore::Observer
  void OnTaskChanged(const redrob::mojom::Task& task) override;

 private:
  const raw_ptr<content::BrowserContext> context_;
  // Cleared in Shutdown, so the observer is dropped while the store is still
  // alive rather than in a destructor whose order is not ours to choose.
  raw_ptr<redrob::TaskStore> store_ = nullptr;
};

}  // namespace extensions

#endif  // CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_TASK_EVENT_ROUTER_H_
