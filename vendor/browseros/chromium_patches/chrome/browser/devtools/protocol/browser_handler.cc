diff --git a/chrome/browser/devtools/protocol/browser_handler.cc b/chrome/browser/devtools/protocol/browser_handler.cc
index 30bd52d09c3fc..cd32210d13bc2 100644
--- a/chrome/browser/devtools/protocol/browser_handler.cc
+++ b/chrome/browser/devtools/protocol/browser_handler.cc
@@ -21,6 +21,7 @@
 #include "chrome/browser/ui/exclusive_access/exclusive_access_context.h"
 #include "chrome/browser/ui/tabs/tab_strip_model.h"
 #include "components/privacy_sandbox/privacy_sandbox_attestations/privacy_sandbox_attestations.h"
+#include "components/sessions/content/session_tab_helper.h"
 #include "content/public/browser/browser_task_traits.h"
 #include "content/public/browser/browser_thread.h"
 #include "content/public/browser/devtools_agent_host.h"
@@ -120,6 +121,30 @@ Response BrowserHandler::GetWindowForTarget(
   return Response::Success();
 }
 
+Response BrowserHandler::GetTabForTarget(
+    std::optional<std::string> target_id,
+    int* out_tab_id,
+    int* out_window_id) {
+  auto host =
+      content::DevToolsAgentHost::GetForId(target_id.value_or(target_id_));
+  if (!host)
+    return Response::ServerError("No target with given id");
+  content::WebContents* web_contents = host->GetWebContents();
+  if (!web_contents)
+    return Response::ServerError("No web contents in the target");
+
+  SessionID tab_id = sessions::SessionTabHelper::IdForTab(web_contents);
+  if (!tab_id.is_valid())
+    return Response::ServerError("No tab id for target");
+
+  *out_tab_id = tab_id.id();
+
+  SessionID window_id =
+      sessions::SessionTabHelper::IdForWindowContainingTab(web_contents);
+  *out_window_id = window_id.is_valid() ? window_id.id() : -1;
+  return Response::Success();
+}
+
 Response BrowserHandler::GetWindowBounds(
     int window_id,
     std::unique_ptr<protocol::Browser::Bounds>* out_bounds) {
