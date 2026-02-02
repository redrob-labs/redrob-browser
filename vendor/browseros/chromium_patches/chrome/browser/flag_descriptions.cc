diff --git a/chrome/browser/flag_descriptions.cc b/chrome/browser/flag_descriptions.cc
index f9088ac701027..f3f892d69791b 100644
--- a/chrome/browser/flag_descriptions.cc
+++ b/chrome/browser/flag_descriptions.cc
@@ -270,6 +270,19 @@ const char kBookmarksTreeViewName[] = "Top Chrome Bookmarks Tree View";
 const char kBookmarksTreeViewDescription[] =
     "Show the bookmarks side panel in a tree view while in compact mode.";
 
+const char kBrowserOsAlphaFeaturesName[] = "BrowserOS Alpha Features";
+const char kBrowserOsAlphaFeaturesDescription[] =
+    "Enables BrowserOS alpha features.";
+
+const char kBrowserOsClawdbotName[] = "BrowserOS Clawdbot";
+const char kBrowserOsClawdbotDescription[] =
+    "Enables Clawdbot Browser Relay extension.";
+
+const char kBrowserOsKeyboardShortcutsName[] = "BrowserOS Keyboard Shortcuts";
+const char kBrowserOsKeyboardShortcutsDescription[] =
+    "Enables BrowserOS keyboard shortcuts (Cmd+Shift+K, Cmd+Shift+L, Option+A). "
+    "Disable if these conflict with your keyboard layout.";
+
 const char kBrowsingHistoryActorIntegrationM1Name[] =
     "Browsing History Actor Integration M1";
 const char kBrowsingHistoryActorIntegrationM1Description[] =
