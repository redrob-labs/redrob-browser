diff --git a/chrome/browser/devtools/protocol/browser_handler_android.cc b/chrome/browser/devtools/protocol/browser_handler_android.cc
index 82199c6e2e93b..ea33e3877dbe6 100644
--- a/chrome/browser/devtools/protocol/browser_handler_android.cc
+++ b/chrome/browser/devtools/protocol/browser_handler_android.cc
@@ -11,6 +11,7 @@
 #include "chrome/browser/android/tab_android.h"
 #include "chrome/browser/ui/android/tab_model/tab_model.h"
 #include "chrome/browser/ui/android/tab_model/tab_model_list.h"
+#include "content/public/browser/devtools_agent_host.h"
 
 using protocol::Response;
 
@@ -55,6 +56,59 @@ Response BrowserHandlerAndroid::GetWindowForTarget(
   return Response::ServerError("Browser window not found");
 }
 
+Response BrowserHandlerAndroid::GetTabForTarget(
+    std::optional<std::string> target_id,
+    int* out_tab_id,
+    int* out_window_id) {
+  auto host =
+      content::DevToolsAgentHost::GetForId(target_id.value_or(target_id_));
+  if (!host)
+    return Response::ServerError("No matching target");
+  content::WebContents* web_contents = host->GetWebContents();
+  if (!web_contents)
+    return Response::ServerError("No web contents in the target");
+
+  for (TabModel* model : TabModelList::models()) {
+    for (int i = 0; i < model->GetTabCount(); ++i) {
+      TabAndroid* tab = model->GetTabAt(i);
+      if (tab->web_contents() == web_contents) {
+        *out_tab_id = tab->GetAndroidId();
+        *out_window_id = tab->GetWindowId().id();
+        return Response::Success();
+      }
+    }
+  }
+
+  return Response::ServerError("Tab not found");
+}
+
+Response BrowserHandlerAndroid::GetTargetForTab(
+    int tab_id,
+    std::string* out_target_id,
+    int* out_window_id) {
+  for (TabModel* model : TabModelList::models()) {
+    for (int i = 0; i < model->GetTabCount(); ++i) {
+      TabAndroid* tab = model->GetTabAt(i);
+      if (tab->GetAndroidId() == tab_id) {
+        content::WebContents* web_contents = tab->web_contents();
+        if (!web_contents)
+          return Response::ServerError("Tab has no web contents");
+
+        scoped_refptr<content::DevToolsAgentHost> host =
+            content::DevToolsAgentHost::GetOrCreateFor(web_contents);
+        if (!host)
+          return Response::ServerError("No target for tab");
+
+        *out_target_id = host->GetId();
+        *out_window_id = tab->GetWindowId().id();
+        return Response::Success();
+      }
+    }
+  }
+
+  return Response::ServerError("No tab with given id");
+}
+
 Response BrowserHandlerAndroid::GetWindowBounds(
     int window_id,
     std::unique_ptr<protocol::Browser::Bounds>* out_bounds) {
