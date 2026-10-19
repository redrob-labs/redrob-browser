diff --git a/chrome/browser/ui/side_panel/side_panel_entry_id.h b/chrome/browser/ui/side_panel/side_panel_entry_id.h
index 3e9dc27c0b3e3..9fc3ea1348a6d 100644
--- a/chrome/browser/ui/side_panel/side_panel_entry_id.h
+++ b/chrome/browser/ui/side_panel/side_panel_entry_id.h
@@ -45,6 +45,7 @@
     "TabsFromOtherDevices")                                                   \
   V(kSidePanelDev, std::nullopt, "SidePanelDev")                              \
   V(kTestTabScopedEntry, std::nullopt, "TestTabScopedEntry")                  \
+  V(kThirdPartyLlm, kActionSidePanelShowThirdPartyLlm, "ThirdPartyLlm")       \
   /* Extensions (nothing more should be added below here) */                  \
   V(kExtension, std::nullopt, "Extension")
 
