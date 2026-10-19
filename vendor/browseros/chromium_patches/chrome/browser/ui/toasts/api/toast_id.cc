diff --git a/chrome/browser/ui/toasts/api/toast_id.cc b/chrome/browser/ui/toasts/api/toast_id.cc
index 06603d62ef855..acb19cf86a86b 100644
--- a/chrome/browser/ui/toasts/api/toast_id.cc
+++ b/chrome/browser/ui/toasts/api/toast_id.cc
@@ -123,6 +123,8 @@ std::string_view GetToastName(ToastId toast_id) {
       return "EmailVerificationLoading";
     case ToastId::kScheduledRestartOnIdle:
       return "ScheduledRestartOnIdle";
+    case ToastId::kBrowserOSToast:
+      return "BrowserOSToast";
   }
 
   NOTREACHED();
