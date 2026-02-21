diff --git a/chrome/browser/devtools/protocol/browser_handler_android.h b/chrome/browser/devtools/protocol/browser_handler_android.h
index a80686d439110..045c092b74d7a 100644
--- a/chrome/browser/devtools/protocol/browser_handler_android.h
+++ b/chrome/browser/devtools/protocol/browser_handler_android.h
@@ -22,6 +22,14 @@ class BrowserHandlerAndroid : public protocol::Browser::Backend {
       std::optional<std::string> target_id,
       int* out_window_id,
       std::unique_ptr<protocol::Browser::Bounds>* out_bounds) override;
+  protocol::Response GetTabForTarget(
+      std::optional<std::string> target_id,
+      int* out_tab_id,
+      int* out_window_id) override;
+  protocol::Response GetTargetForTab(
+      int tab_id,
+      std::string* out_target_id,
+      int* out_window_id) override;
   protocol::Response GetWindowBounds(
       int window_id,
       std::unique_ptr<protocol::Browser::Bounds>* out_bounds) override;
