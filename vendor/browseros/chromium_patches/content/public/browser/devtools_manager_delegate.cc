diff --git a/content/public/browser/devtools_manager_delegate.cc b/content/public/browser/devtools_manager_delegate.cc
index db9be7653aa0f..d094e7b10f648 100644
--- a/content/public/browser/devtools_manager_delegate.cc
+++ b/content/public/browser/devtools_manager_delegate.cc
@@ -64,6 +64,12 @@ std::optional<bool> DevToolsManagerDelegate::ShouldReportAsTabTarget(
   return std::nullopt;
 }
 
+bool DevToolsManagerDelegate::GetTargetTabId(WebContents* web_contents,
+                                              int* tab_id,
+                                              int* window_id) {
+  return false;
+}
+
 DevToolsAgentHost::List DevToolsManagerDelegate::RemoteDebuggingTargets(
     DevToolsManagerDelegate::TargetType target_type) {
   return DevToolsAgentHost::GetOrCreateAll();
