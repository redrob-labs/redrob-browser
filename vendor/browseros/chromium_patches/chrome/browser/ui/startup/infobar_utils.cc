diff --git a/chrome/browser/ui/startup/infobar_utils.cc b/chrome/browser/ui/startup/infobar_utils.cc
index d953dc89ed49c..4ce075231da88 100644
--- a/chrome/browser/ui/startup/infobar_utils.cc
+++ b/chrome/browser/ui/startup/infobar_utils.cc
@@ -163,10 +163,6 @@ void AddInfoBarsIfNecessary(Browser* browser,
     infobars::ContentInfoBarManager* infobar_manager =
         infobars::ContentInfoBarManager::FromWebContents(web_contents);
 
-    if (!google_apis::HasAPIKeyConfigured()) {
-      GoogleApiKeysInfoBarDelegate::Create(infobar_manager);
-    }
-
     if (ObsoleteSystem::IsObsoleteNowOrSoon()) {
       PrefService* local_state = g_browser_process->local_state();
       if (!local_state ||
