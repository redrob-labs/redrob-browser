diff --git a/chrome/browser/browser_features.h b/chrome/browser/browser_features.h
index 5737721a47154..5ad629ba0ea88 100644
--- a/chrome/browser/browser_features.h
+++ b/chrome/browser/browser_features.h
@@ -35,6 +35,9 @@ BASE_DECLARE_FEATURE(kAllowUnmutedAutoplayForTWA);
 BASE_DECLARE_FEATURE(kAutocompleteActionPredictorConfidenceCutoff);
 BASE_DECLARE_FEATURE(kBookmarksTreeView);
 BASE_DECLARE_FEATURE(kBookmarkTriggerForPrerender2KillSwitch);
+BASE_DECLARE_FEATURE(kBrowserOsAlphaFeatures);
+BASE_DECLARE_FEATURE(kBrowserOsClawdbot);
+BASE_DECLARE_FEATURE(kBrowserOsKeyboardShortcuts);
 BASE_DECLARE_FEATURE(kBookmarkTriggerForPreconnect);
 BASE_DECLARE_FEATURE(kBookmarkTriggerForPrefetch);
 BASE_DECLARE_FEATURE(kCertificateTransparencyAskBeforeEnabling);
