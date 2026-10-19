diff --git a/chrome/browser/ui/views/new_tab_footer/footer_controller.cc b/chrome/browser/ui/views/new_tab_footer/footer_controller.cc
index 7b33ea502d408..a19b0c873786e 100644
--- a/chrome/browser/ui/views/new_tab_footer/footer_controller.cc
+++ b/chrome/browser/ui/views/new_tab_footer/footer_controller.cc
@@ -214,14 +214,7 @@ bool NewTabFooterController::ContentsViewFooterCotroller::
 
 bool NewTabFooterController::ContentsViewFooterCotroller::
     ShouldShowExtensionFooter(const GURL& url) {
-  if (ShouldSkipForErrorPage()) {
-    return false;
-  }
-
-  return ntp_footer::IsExtensionNtp(url, owner_->profile_) &&
-         owner_->profile_->GetPrefs()->GetBoolean(
-             prefs::kNTPFooterExtensionAttributionEnabled) &&
-         owner_->profile_->GetPrefs()->GetBoolean(prefs::kNtpFooterVisible);
+  return false;
 }
 
 void NewTabFooterController::UpdateFooterVisibilities(bool log_on_load_metric) {
