diff --git a/chrome/browser/ui/actions/chrome_action_id.h b/chrome/browser/ui/actions/chrome_action_id.h
index fb916f99899f5..e13091705aef3 100644
--- a/chrome/browser/ui/actions/chrome_action_id.h
+++ b/chrome/browser/ui/actions/chrome_action_id.h
@@ -511,7 +511,9 @@
   E(kActionSidePanelShowSideSearch) \
   E(kActionSidePanelShowMerchantTrust) \
   E(kActionSidePanelShowTabsFromOtherDevices, \
-    IDC_SHOW_TABS_FROM_OTHER_DEVICES_SIDE_PANEL)
+    IDC_SHOW_TABS_FROM_OTHER_DEVICES_SIDE_PANEL) \
+  E(kActionSidePanelShowThirdPartyLlm) \
+  E(kActionBrowserOSAgent)
 
 #define TOOLBAR_PINNABLE_ACTION_IDS \
   E(kActionHome, IDC_HOME) \
