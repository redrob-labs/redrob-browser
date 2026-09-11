// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_AGENT_SERVICE_FACTORIES_H_
#define CHROME_BROWSER_REDROB_AGENT_SERVICE_FACTORIES_H_

#include "base/no_destructor.h"
#include "chrome/browser/profiles/profile_keyed_service_factory.h"

class Profile;

namespace redrob {

class MemoryStore;
class ModelStore;
class RoutineStore;
class RpcServer;

// The three services that sit beside TaskStore, in one file because they are one decision: what the
// agent keeps, what starts it on a schedule, and which model answers it. All three are regular-profile
// only -- an incognito window's agent that remembered things, or ran routines, would be an incognito
// window in name.

class MemoryStoreFactory : public ProfileKeyedServiceFactory {
 public:
  static MemoryStore* GetForProfile(Profile* profile);
  static MemoryStoreFactory* GetInstance();

 private:
  friend base::NoDestructor<MemoryStoreFactory>;
  MemoryStoreFactory();
  ~MemoryStoreFactory() override;

  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
      content::BrowserContext* context) const override;
};

class ModelStoreFactory : public ProfileKeyedServiceFactory {
 public:
  static ModelStore* GetForProfile(Profile* profile);
  static ModelStoreFactory* GetInstance();

 private:
  friend base::NoDestructor<ModelStoreFactory>;
  ModelStoreFactory();
  ~ModelStoreFactory() override;

  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
      content::BrowserContext* context) const override;
};

class RoutineStoreFactory : public ProfileKeyedServiceFactory {
 public:
  static RoutineStore* GetForProfile(Profile* profile);
  static RoutineStoreFactory* GetInstance();

 private:
  friend base::NoDestructor<RoutineStoreFactory>;
  RoutineStoreFactory();
  ~RoutineStoreFactory() override;

  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
      content::BrowserContext* context) const override;
  // Unlike the other two, this one must EXIST to do its job: nothing opens a routine, so a lazily
  // created scheduler would never arm its timer and every routine would silently never run.
  bool ServiceIsCreatedWithBrowserContext() const override;
};

class RpcServerFactory : public ProfileKeyedServiceFactory {
 public:
  static RpcServer* GetForProfile(Profile* profile);
  static RpcServerFactory* GetInstance();

 private:
  friend base::NoDestructor<RpcServerFactory>;
  RpcServerFactory();
  ~RpcServerFactory() override;

  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
      content::BrowserContext* context) const override;
  // Same reason as the scheduler: a socket nobody has asked for is a socket that never gets bound. The
  // service is created at startup and decides for itself whether to listen.
  bool ServiceIsCreatedWithBrowserContext() const override;
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_AGENT_SERVICE_FACTORIES_H_
