diff --git a/chrome/browser/ui/views/side_panel/side_panel_coordinator.cc b/chrome/browser/ui/views/side_panel/side_panel_coordinator.cc
index f65b51ef5ea4c..292ea0d78ebc7 100644
--- a/chrome/browser/ui/views/side_panel/side_panel_coordinator.cc
+++ b/chrome/browser/ui/views/side_panel/side_panel_coordinator.cc
@@ -345,9 +345,8 @@ void SidePanelCoordinator::PopulateSidePanel(
   entry->OnEntryShown();
   if (previous_entry) {
     previous_entry->OnEntryHidden();
-  } else {
-    content->RequestFocus();
   }
+  content->RequestFocus();
 
   side_panel->UpdateWidthOnEntryChanged();
 
