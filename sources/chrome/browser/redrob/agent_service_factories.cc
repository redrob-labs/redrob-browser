// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/agent_service_factories.h"

#include <memory>

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/memory_store.h"
#include "chrome/browser/redrob/model_store.h"
#include "base/command_line.h"
#include "chrome/browser/redrob/redrob_prefs.h"
#include "chrome/browser/redrob/routine_store.h"
#include "chrome/browser/redrob/rpc_server.h"
#include "chrome/common/chrome_switches.h"
#include "components/prefs/pref_service.h"
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

// static
RpcServer* RpcServerFactory::GetForProfile(Profile* profile) {
  return static_cast<RpcServer*>(
      GetInstance()->GetServiceForBrowserContext(profile, /*create=*/true));
}

// static
RpcServerFactory* RpcServerFactory::GetInstance() {
  static base::NoDestructor<RpcServerFactory> instance;
  return instance.get();
}

RpcServerFactory::RpcServerFactory()
    : ProfileKeyedServiceFactory("RedrobRpcServer",
                                 ProfileSelections::BuildForRegularProfile()) {
  DependsOn(TaskStoreFactory::GetInstance());
}

RpcServerFactory::~RpcServerFactory() = default;

std::unique_ptr<KeyedService> RpcServerFactory::BuildServiceInstanceForBrowserContext(
    content::BrowserContext* context) const {
  Profile* profile = Profile::FromBrowserContext(context);
  auto server =
      std::make_unique<RpcServer>(profile, TaskStoreFactory::GetForProfile(profile));
  // Two ways in, and both are the user asking: the setting, or the switch on this launch. The switch
  // exists so the endpoint can be turned on for one run without leaving it on -- which is what you want
  // when the reason you are enabling it is a script.
  const bool by_pref = profile->GetPrefs()->GetBoolean(prefs::kRpcEnabled);
  const bool by_switch =
      base::CommandLine::ForCurrentProcess()->HasSwitch(switches::kRedrobRpc);
  if (by_pref || by_switch) {
    server->Start();
  }
  return server;
}

bool RpcServerFactory::ServiceIsCreatedWithBrowserContext() const {
  return true;
}

}  // namespace redrob
