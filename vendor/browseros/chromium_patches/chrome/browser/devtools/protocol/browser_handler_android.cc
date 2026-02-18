diff --git a/chrome/browser/devtools/protocol/browser_handler_android.cc b/chrome/browser/devtools/protocol/browser_handler_android.cc
index 82199c6e2e93b..c53c1cf6843a9 100644
--- a/chrome/browser/devtools/protocol/browser_handler_android.cc
+++ b/chrome/browser/devtools/protocol/browser_handler_android.cc
@@ -55,6 +55,32 @@ Response BrowserHandlerAndroid::GetWindowForTarget(
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
 Response BrowserHandlerAndroid::GetWindowBounds(
     int window_id,
     std::unique_ptr<protocol::Browser::Bounds>* out_bounds) {
