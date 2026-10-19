diff --git a/chrome/browser/ui/toasts/toast_service.cc b/chrome/browser/ui/toasts/toast_service.cc
index 1173165e84d87..4a1e4dbb2180a 100644
--- a/chrome/browser/ui/toasts/toast_service.cc
+++ b/chrome/browser/ui/toasts/toast_service.cc
@@ -436,6 +436,13 @@ void ToastService::RegisterToasts(
           features::IsRoundedIconsEnabled() ? kInfoIcon : kInfoOldIcon)
           .Build());
 
+  // BrowserOS extension toast. The body text is supplied dynamically at show
+  // time via ToastParams::body_string_override, so the spec has no body string
+  // id. Global-scoped so it survives tab switches while it is visible.
+  toast_registry_->RegisterToast(
+      ToastId::kBrowserOSToast,
+      ToastSpecification::Builder(kInfoIcon).AddGlobalScoped().Build());
+
   toast_registry_->RegisterToast(
       ToastId::kAutoSignIn,
       ToastSpecification::Builder(features::IsRoundedIconsEnabled()
