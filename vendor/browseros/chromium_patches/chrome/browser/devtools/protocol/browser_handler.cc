diff --git a/chrome/browser/devtools/protocol/browser_handler.cc b/chrome/browser/devtools/protocol/browser_handler.cc
index 30bd52d09c3fc..e15fa4618c1e3 100644
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
@@ -120,6 +121,65 @@ Response BrowserHandler::GetWindowForTarget(
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
+Response BrowserHandler::GetTargetForTab(
+    int tab_id,
+    std::string* out_target_id,
+    int* out_window_id) {
+  content::WebContents* found_contents = nullptr;
+  int found_window_id = -1;
+  ForEachCurrentBrowserWindowInterfaceOrderedByActivation(
+      [tab_id, &found_contents,
+       &found_window_id](BrowserWindowInterface* browser_window_interface) {
+        TabStripModel* tab_strip = browser_window_interface->GetTabStripModel();
+        for (int i = 0; i < tab_strip->count(); ++i) {
+          content::WebContents* wc = tab_strip->GetWebContentsAt(i);
+          SessionID sid = sessions::SessionTabHelper::IdForTab(wc);
+          if (sid.is_valid() && sid.id() == tab_id) {
+            found_contents = wc;
+            found_window_id =
+                browser_window_interface->GetSessionID().id();
+            return false;
+          }
+        }
+        return true;
+      });
+  if (!found_contents)
+    return Response::ServerError("No tab with given id");
+
+  scoped_refptr<content::DevToolsAgentHost> host =
+      content::DevToolsAgentHost::GetOrCreateFor(found_contents);
+  if (!host)
+    return Response::ServerError("No target for tab");
+
+  *out_target_id = host->GetId();
+  *out_window_id = found_window_id;
+  return Response::Success();
+}
+
 Response BrowserHandler::GetWindowBounds(
     int window_id,
     std::unique_ptr<protocol::Browser::Bounds>* out_bounds) {
