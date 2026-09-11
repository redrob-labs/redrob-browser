// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/task_store_factory.h"

#include <memory>

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/agent_service_factories.h"
#include "chrome/browser/redrob/task_store.h"
#include "content/public/browser/storage_partition.h"

namespace redrob {

// static
TaskStore* TaskStoreFactory::GetForProfile(Profile* profile) {
  return static_cast<TaskStore*>(
      GetInstance()->GetServiceForBrowserContext(profile, /*create=*/true));
}

// static
TaskStoreFactory* TaskStoreFactory::GetInstance() {
  static base::NoDestructor<TaskStoreFactory> instance;
  return instance.get();
}

TaskStoreFactory::TaskStoreFactory()
    : ProfileKeyedServiceFactory("RedrobTaskStore",
                                 ProfileSelections::BuildForRegularProfile()) {
  // A task searches memory before its first turn and asks which provider answers it, so both stores
  // have to be built first and torn down after.
  DependsOn(MemoryStoreFactory::GetInstance());
  DependsOn(ModelStoreFactory::GetInstance());
}

TaskStoreFactory::~TaskStoreFactory() = default;

std::unique_ptr<KeyedService> TaskStoreFactory::BuildServiceInstanceForBrowserContext(
    content::BrowserContext* context) const {
  // The loader factory is the browser's, taken here rather than from a page: the sidecar health probe
  // is the browser's request and must not inherit anything a renderer could influence.
  Profile* profile = Profile::FromBrowserContext(context);
  return std::make_unique<TaskStore>(
      profile, context->GetDefaultStoragePartition()->GetURLLoaderFactoryForBrowserProcess(),
      MemoryStoreFactory::GetForProfile(profile), ModelStoreFactory::GetForProfile(profile));
}

}  // namespace redrob
