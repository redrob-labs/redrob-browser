// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/agent_service_factories.h"

#include <memory>

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/memory_store.h"
#include "chrome/browser/redrob/model_store.h"
#include "chrome/browser/redrob/routine_store.h"
#include "chrome/browser/redrob/task_store_factory.h"

namespace redrob {

// static
MemoryStore* MemoryStoreFactory::GetForProfile(Profile* profile) {
  return static_cast<MemoryStore*>(
      GetInstance()->GetServiceForBrowserContext(profile, /*create=*/true));
}

// static
MemoryStoreFactory* MemoryStoreFactory::GetInstance() {
  static base::NoDestructor<MemoryStoreFactory> instance;
  return instance.get();
}

MemoryStoreFactory::MemoryStoreFactory()
    : ProfileKeyedServiceFactory("RedrobMemoryStore",
                                 ProfileSelections::BuildForRegularProfile()) {}

MemoryStoreFactory::~MemoryStoreFactory() = default;

std::unique_ptr<KeyedService> MemoryStoreFactory::BuildServiceInstanceForBrowserContext(
    content::BrowserContext* context) const {
  return std::make_unique<MemoryStore>(Profile::FromBrowserContext(context));
}

// static
ModelStore* ModelStoreFactory::GetForProfile(Profile* profile) {
  return static_cast<ModelStore*>(
      GetInstance()->GetServiceForBrowserContext(profile, /*create=*/true));
}

// static
ModelStoreFactory* ModelStoreFactory::GetInstance() {
  static base::NoDestructor<ModelStoreFactory> instance;
  return instance.get();
}

ModelStoreFactory::ModelStoreFactory()
    : ProfileKeyedServiceFactory("RedrobModelStore",
                                 ProfileSelections::BuildForRegularProfile()) {}

ModelStoreFactory::~ModelStoreFactory() = default;

std::unique_ptr<KeyedService> ModelStoreFactory::BuildServiceInstanceForBrowserContext(
    content::BrowserContext* context) const {
  return std::make_unique<ModelStore>(Profile::FromBrowserContext(context));
}

// static
RoutineStore* RoutineStoreFactory::GetForProfile(Profile* profile) {
  return static_cast<RoutineStore*>(
      GetInstance()->GetServiceForBrowserContext(profile, /*create=*/true));
}

// static
RoutineStoreFactory* RoutineStoreFactory::GetInstance() {
  static base::NoDestructor<RoutineStoreFactory> instance;
  return instance.get();
}

RoutineStoreFactory::RoutineStoreFactory()
    : ProfileKeyedServiceFactory("RedrobRoutineStore",
                                 ProfileSelections::BuildForRegularProfile()) {
  // A routine starts tasks, so the thing that runs tasks has to outlive it.
  DependsOn(TaskStoreFactory::GetInstance());
}

RoutineStoreFactory::~RoutineStoreFactory() = default;

std::unique_ptr<KeyedService> RoutineStoreFactory::BuildServiceInstanceForBrowserContext(
    content::BrowserContext* context) const {
  Profile* profile = Profile::FromBrowserContext(context);
  return std::make_unique<RoutineStore>(profile, TaskStoreFactory::GetForProfile(profile));
}

bool RoutineStoreFactory::ServiceIsCreatedWithBrowserContext() const {
  return true;
}

}  // namespace redrob
