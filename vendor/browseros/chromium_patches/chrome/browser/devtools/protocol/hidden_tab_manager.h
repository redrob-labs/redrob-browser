diff --git a/chrome/browser/devtools/protocol/hidden_tab_manager.h b/chrome/browser/devtools/protocol/hidden_tab_manager.h
new file mode 100644
index 0000000000000..52cb68e094c67
--- /dev/null
+++ b/chrome/browser/devtools/protocol/hidden_tab_manager.h
@@ -0,0 +1,59 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#ifndef CHROME_BROWSER_DEVTOOLS_PROTOCOL_HIDDEN_TAB_MANAGER_H_
+#define CHROME_BROWSER_DEVTOOLS_PROTOCOL_HIDDEN_TAB_MANAGER_H_
+
+#include <memory>
+#include <string>
+#include <vector>
+
+#include "content/public/browser/web_contents_delegate.h"
+
+namespace content {
+class BrowserContext;
+class WebContents;
+}  // namespace content
+
+class GURL;
+
+// Manages hidden tab WebContents that are not attached to any browser window.
+// Hidden tabs are first-class CDP targets and are destroyed on CDP disconnect.
+class HiddenTabManager : public content::WebContentsDelegate {
+ public:
+  HiddenTabManager();
+  ~HiddenTabManager() override;
+  HiddenTabManager(const HiddenTabManager&) = delete;
+  HiddenTabManager& operator=(const HiddenTabManager&) = delete;
+
+  // Create a hidden tab, optionally navigated to |url|. Returns the tab ID.
+  int CreateHiddenTab(const GURL& url,
+                      content::BrowserContext* browser_context);
+
+  content::WebContents* FindByTabId(int tab_id);
+  content::WebContents* FindByTargetId(const std::string& target_id);
+  bool IsHidden(int tab_id);
+
+  // Remove a hidden tab from management, returning ownership.
+  std::unique_ptr<content::WebContents> DetachByTabId(int tab_id);
+
+  // Take ownership of a WebContents (used by hideTab).
+  void TakeWebContents(std::unique_ptr<content::WebContents> web_contents);
+
+  // Destroy all hidden tabs (called on session disconnect).
+  void Clear();
+
+  const std::vector<std::unique_ptr<content::WebContents>>& hidden_tabs()
+      const {
+    return hidden_web_contents_;
+  }
+
+  // content::WebContentsDelegate:
+  void CloseContents(content::WebContents* source) override;
+
+ private:
+  std::vector<std::unique_ptr<content::WebContents>> hidden_web_contents_;
+};
+
+#endif  // CHROME_BROWSER_DEVTOOLS_PROTOCOL_HIDDEN_TAB_MANAGER_H_
