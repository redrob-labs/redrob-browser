diff --git a/chrome/browser/about_flags.cc b/chrome/browser/about_flags.cc
index e80a06d6cb742..03f3835d6525b 100644
--- a/chrome/browser/about_flags.cc
+++ b/chrome/browser/about_flags.cc
@@ -12068,6 +12068,20 @@ const FeatureEntry kFeatureEntries[] = {
     {"bookmarks-tree-view", flag_descriptions::kBookmarksTreeViewName,
      flag_descriptions::kBookmarksTreeViewDescription, kOsDesktop,
      FEATURE_VALUE_TYPE(features::kBookmarksTreeView)},
+
+    {"enable-browseros-alpha-features",
+     flag_descriptions::kBrowserOsAlphaFeaturesName,
+     flag_descriptions::kBrowserOsAlphaFeaturesDescription, kOsDesktop,
+     FEATURE_VALUE_TYPE(features::kBrowserOsAlphaFeatures)},
+
+    {"enable-browseros-clawdbot", flag_descriptions::kBrowserOsClawdbotName,
+     flag_descriptions::kBrowserOsClawdbotDescription, kOsDesktop,
+     FEATURE_VALUE_TYPE(features::kBrowserOsClawdbot)},
+
+    {"enable-browseros-keyboard-shortcuts",
+     flag_descriptions::kBrowserOsKeyboardShortcutsName,
+     flag_descriptions::kBrowserOsKeyboardShortcutsDescription, kOsDesktop,
+     FEATURE_VALUE_TYPE(features::kBrowserOsKeyboardShortcuts)},
 #endif
 
     {"enable-secure-payment-confirmation-availability-api",
