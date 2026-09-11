// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_TASK_STORE_FACTORY_H_
#define CHROME_BROWSER_REDROB_TASK_STORE_FACTORY_H_

#include "base/no_destructor.h"
#include "chrome/browser/profiles/profile_keyed_service_factory.h"

class Profile;

namespace redrob {

class TaskStore;

// One TaskStore per profile. Off-the-record profiles get none: the new tab page there is Chromium's
// incognito NTP by design, so nothing asks for this.
class TaskStoreFactory : public ProfileKeyedServiceFactory {
 public:
  static TaskStore* GetForProfile(Profile* profile);
  static TaskStoreFactory* GetInstance();

 private:
  friend base::NoDestructor<TaskStoreFactory>;
  TaskStoreFactory();
  ~TaskStoreFactory() override;

  // BrowserContextKeyedServiceFactory:
  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
      content::BrowserContext* context) const override;
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_TASK_STORE_FACTORY_H_
