diff --git a/chrome/browser/devtools/protocol/browser_handler.h b/chrome/browser/devtools/protocol/browser_handler.h
index e1424aa52cbf6..25c5734178492 100644
--- a/chrome/browser/devtools/protocol/browser_handler.h
+++ b/chrome/browser/devtools/protocol/browser_handler.h
@@ -23,6 +23,14 @@ class BrowserHandler : public protocol::Browser::Backend {
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
