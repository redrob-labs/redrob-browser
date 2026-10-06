diff --git a/chrome/browser/flag_descriptions.h b/chrome/browser/flag_descriptions.h
--- a/chrome/browser/flag_descriptions.h
+++ b/chrome/browser/flag_descriptions.h
@@ -325,6 +325,18 @@ inline constexpr char kBlockingFocusWithoutUserActivationDescription[] =
     "(element.focus(), window.focus(), autofocus) from iframes unless "
     "triggered by a user gesture.";
 
+// BrowserOS: feature flags
+inline constexpr char kBrowserOsAlphaFeaturesName[] =
+    "Redrob Alpha Features";
+inline constexpr char kBrowserOsAlphaFeaturesDescription[] =
+    "Enables Redrob alpha features.";
+
+inline constexpr char kBrowserOsKeyboardShortcutsName[] =
+    "Redrob Keyboard Shortcuts";
+inline constexpr char kBrowserOsKeyboardShortcutsDescription[] =
+    "Enables Redrob keyboard shortcuts (Cmd+Shift+K, Cmd+Shift+L, "
+    "Option+A). Disable if these conflict with your keyboard layout.";
+
 inline constexpr char kBrowsingHistoryActorIntegrationM3Name[] =
     "Browsing History Actor Integration M3";
 inline constexpr char kBrowsingHistoryActorIntegrationM3Description[] =
