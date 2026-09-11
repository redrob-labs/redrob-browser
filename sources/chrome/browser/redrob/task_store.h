// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_TASK_STORE_H_
#define CHROME_BROWSER_REDROB_TASK_STORE_H_

#include <map>
#include <memory>
#include <string>
#include <vector>

#include "base/observer_list.h"
#include "chrome/browser/redrob/sidecar_client.h"
#include "chrome/browser/ui/webui/redrob/redrob.mojom.h"
#include "components/keyed_service/core/keyed_service.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"

namespace redrob {

// The tasks of one profile, and the sidecar that runs them.
//
// This is a profile service rather than state on the WebUI's Mojo handler, and that is the whole
// point: a task opens as a TAB. Navigating creates a new document, a new handler and -- when the
// tasks lived on the handler -- a new empty list, so the task tab you had just opened said "task not
// found". Tasks outlive documents because the product treats them as something you go back to.
class TaskStore : public KeyedService {
 public:
  class Observer : public base::CheckedObserver {
   public:
    virtual void OnTaskChanged(const mojom::Task& task) = 0;
  };

  explicit TaskStore(scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory);
  TaskStore(const TaskStore&) = delete;
  TaskStore& operator=(const TaskStore&) = delete;
  ~TaskStore() override;

  void AddObserver(Observer* observer);
  void RemoveObserver(Observer* observer);

  // Returns the new task's id, or the reason it could not start. Every argument came from a renderer,
  // so this is where the bounds live.
  std::pair<std::optional<std::string>, std::optional<mojom::StartError>> StartTask(
      const std::string& prompt,
      const std::vector<std::string>& context_refs);
  void CancelTask(const std::string& task_id);
  bool Reply(const std::string& task_id, const std::string& prompt);
  std::vector<mojom::TaskPtr> ListTasks() const;
  mojom::TaskPtr GetTask(const std::string& task_id) const;
  bool SetRouting(mojom::RoutingMode mode);

 private:
  void OnSidecarStatusChanged(SidecarClient::Status status);
  void AddStep(const std::string& task_id, mojom::StepKind kind, const std::string& label);
  void Notify(const std::string& task_id);

  std::map<std::string, mojom::TaskPtr> tasks_;
  mojom::RoutingMode routing_ = mojom::RoutingMode::kLocal;
  scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory_;
  std::unique_ptr<SidecarClient> sidecar_;
  base::ObserverList<Observer> observers_;
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_TASK_STORE_H_
