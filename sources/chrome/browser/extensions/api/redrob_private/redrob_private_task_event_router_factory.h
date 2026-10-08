// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_TASK_EVENT_ROUTER_FACTORY_H_
#define CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_TASK_EVENT_ROUTER_FACTORY_H_

#include <memory>

#include "base/no_destructor.h"
#include "chrome/browser/profiles/profile_keyed_service_factory.h"

class Profile;

namespace extensions {

class RedrobPrivateTaskEventRouter;

// Builds the router WITH the browser context. A lazily built observer would not
// be watching until something happened to call a function, so the first steps of
// the first task would be dropped — and those are the ones a page is waiting for.
class RedrobPrivateTaskEventRouterFactory : public ProfileKeyedServiceFactory {
 public:
  static RedrobPrivateTaskEventRouter* GetForProfile(Profile* profile);
  static RedrobPrivateTaskEventRouterFactory* GetInstance();

  RedrobPrivateTaskEventRouterFactory(
      const RedrobPrivateTaskEventRouterFactory&) = delete;
  RedrobPrivateTaskEventRouterFactory& operator=(
      const RedrobPrivateTaskEventRouterFactory&) = delete;

 private:
  friend base::NoDestructor<RedrobPrivateTaskEventRouterFactory>;

  RedrobPrivateTaskEventRouterFactory();
  ~RedrobPrivateTaskEventRouterFactory() override;

  // BrowserContextKeyedServiceFactory
  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
      content::BrowserContext* context) const override;
  bool ServiceIsCreatedWithBrowserContext() const override;
};

}  // namespace extensions

#endif  // CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_TASK_EVENT_ROUTER_FACTORY_H_
