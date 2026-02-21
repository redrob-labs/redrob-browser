diff --git a/chrome/browser/devtools/protocol/hidden_tab_manager.cc b/chrome/browser/devtools/protocol/hidden_tab_manager.cc
new file mode 100644
index 0000000000000..c6de538ee4d90
--- /dev/null
+++ b/chrome/browser/devtools/protocol/hidden_tab_manager.cc
@@ -0,0 +1,98 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#include "chrome/browser/devtools/protocol/hidden_tab_manager.h"
+
+#include <algorithm>
+
+#include "chrome/browser/sessions/session_tab_helper_factory.h"
+#include "components/sessions/content/session_tab_helper.h"
+#include "content/public/browser/devtools_agent_host.h"
+#include "content/public/browser/navigation_controller.h"
+#include "content/public/browser/web_contents.h"
+#include "url/gurl.h"
+
+HiddenTabManager::HiddenTabManager() = default;
+
+HiddenTabManager::~HiddenTabManager() = default;
+
+int HiddenTabManager::CreateHiddenTab(
+    const GURL& url,
+    content::BrowserContext* browser_context) {
+  content::WebContents::CreateParams params(browser_context);
+  auto web_contents = content::WebContents::Create(params);
+  web_contents->SetDelegate(this);
+
+  CreateSessionServiceTabHelper(web_contents.get());
+  content::DevToolsAgentHost::GetOrCreateFor(web_contents.get());
+
+  if (!url.is_empty()) {
+    content::NavigationController::LoadURLParams load_params(url);
+    web_contents->GetController().LoadURLWithParams(load_params);
+  }
+
+  int tab_id =
+      sessions::SessionTabHelper::IdForTab(web_contents.get()).id();
+  hidden_web_contents_.push_back(std::move(web_contents));
+  return tab_id;
+}
+
+content::WebContents* HiddenTabManager::FindByTabId(int tab_id) {
+  for (const auto& wc : hidden_web_contents_) {
+    SessionID sid = sessions::SessionTabHelper::IdForTab(wc.get());
+    if (sid.is_valid() && sid.id() == tab_id) {
+      return wc.get();
+    }
+  }
+  return nullptr;
+}
+
+content::WebContents* HiddenTabManager::FindByTargetId(
+    const std::string& target_id) {
+  for (const auto& wc : hidden_web_contents_) {
+    scoped_refptr<content::DevToolsAgentHost> host =
+        content::DevToolsAgentHost::GetOrCreateFor(wc.get());
+    if (host && host->GetId() == target_id) {
+      return wc.get();
+    }
+  }
+  return nullptr;
+}
+
+bool HiddenTabManager::IsHidden(int tab_id) {
+  return FindByTabId(tab_id) != nullptr;
+}
+
+std::unique_ptr<content::WebContents> HiddenTabManager::DetachByTabId(
+    int tab_id) {
+  for (auto it = hidden_web_contents_.begin();
+       it != hidden_web_contents_.end(); ++it) {
+    SessionID sid = sessions::SessionTabHelper::IdForTab(it->get());
+    if (sid.is_valid() && sid.id() == tab_id) {
+      std::unique_ptr<content::WebContents> result = std::move(*it);
+      hidden_web_contents_.erase(it);
+      return result;
+    }
+  }
+  return nullptr;
+}
+
+void HiddenTabManager::TakeWebContents(
+    std::unique_ptr<content::WebContents> web_contents) {
+  web_contents->SetDelegate(this);
+  hidden_web_contents_.push_back(std::move(web_contents));
+}
+
+void HiddenTabManager::Clear() {
+  hidden_web_contents_.clear();
+}
+
+void HiddenTabManager::CloseContents(content::WebContents* source) {
+  auto it = std::find_if(
+      hidden_web_contents_.begin(), hidden_web_contents_.end(),
+      [source](const auto& wc) { return wc.get() == source; });
+  if (it != hidden_web_contents_.end()) {
+    hidden_web_contents_.erase(it);
+  }
+}
