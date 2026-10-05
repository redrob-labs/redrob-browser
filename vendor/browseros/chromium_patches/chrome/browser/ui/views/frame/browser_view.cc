diff --git a/chrome/browser/ui/views/frame/browser_view.cc b/chrome/browser/ui/views/frame/browser_view.cc
--- a/chrome/browser/ui/views/frame/browser_view.cc
+++ b/chrome/browser/ui/views/frame/browser_view.cc
@@ -222,6 +222,7 @@
 #include "chrome/browser/ui/views/tabs/tab.h"
 #include "chrome/browser/ui/views/tabs/tab/tab_accessibility.h"
 #include "chrome/browser/ui/views/tabs/tab_strip.h"
+#include "chrome/browser/ui/views/tabs/vertical/redrob_sidebar_sections.h"
 #include "chrome/browser/ui/views/tabs/vertical/vertical_tab_strip_top_container.h"
 #include "chrome/browser/ui/views/theme_copying_widget.h"
 #include "chrome/browser/ui/views/toolbar/app_menu_control.h"
@@ -4285,8 +4286,19 @@ void BrowserView::UpdateTabSearchBubbleHost() {
       vertical_tab_strip_state_controller->ShouldDisplayVerticalTabs()) {
     auto* combo_button =
         vertical_tab_strip_region_view_->GetTopContainer()->GetComboButton();
-    tab_search_bubble_host_ = std::make_unique<TabSearchBubbleHost>(
-        combo_button->end_button(), browser_.get());
+    // Redrob: anchored to the SIDEBAR's magnifier. The same two actions -- tab search and new tab -- are
+    // drawn in the header row beside the workspace name, where the reference puts them, and the combo
+    // button they used to live in is hidden. Anchoring is not cosmetic: the host takes its anchor at
+    // construction and has no setter, so leaving it on the hidden button would open the bubble against a
+    // view with no on-screen bounds. The combo button is still TOLD about the host, because it observes it
+    // for its own pressed-state lock.
+    views::Button* anchor = combo_button->end_button();
+    if (redrob::RedrobSidebarSections* sections =
+            vertical_tab_strip_region_view_->GetRedrobSections()) {
+      anchor = sections->search_button();
+    }
+    tab_search_bubble_host_ =
+        std::make_unique<TabSearchBubbleHost>(anchor, browser_.get());
     combo_button->SetTabSearchBubbleHost(tab_search_bubble_host_.get());
   } else {
     auto* combo_button =
