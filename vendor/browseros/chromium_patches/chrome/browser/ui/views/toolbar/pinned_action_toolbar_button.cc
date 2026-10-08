diff --git a/chrome/browser/ui/views/toolbar/pinned_action_toolbar_button.cc b/chrome/browser/ui/views/toolbar/pinned_action_toolbar_button.cc
--- a/chrome/browser/ui/views/toolbar/pinned_action_toolbar_button.cc
+++ b/chrome/browser/ui/views/toolbar/pinned_action_toolbar_button.cc
@@ -13,13 +13,19 @@
 #include "base/metrics/user_metrics.h"
 #include "base/notreached.h"
 #include "base/strings/strcat.h"
+#include "chrome/browser/browseros/core/browseros_action_utils.h"
+#include "chrome/browser/browseros/core/browseros_prefs.h"
 #include "chrome/browser/profiles/profile.h"
+#include "chrome/browser/ui/actions/chrome_action_id.h"
 #include "chrome/browser/ui/browser_actions.h"
 #include "chrome/browser/ui/browser_commands.h"
 #include "chrome/browser/ui/browser_window/public/browser_window_features.h"
+#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
 #include "chrome/browser/ui/customize_chrome/side_panel_controller.h"
 #include "chrome/browser/ui/layout_constants.h"
 #include "chrome/browser/ui/side_panel/side_panel_action_callback.h"
+#include "chrome/browser/ui/side_panel/side_panel_entry.h"
+#include "chrome/browser/ui/side_panel/side_panel_entry_id.h"
 #include "chrome/browser/ui/tabs/public/tab_features.h"
 #include "chrome/browser/ui/toolbar/pinned_toolbar/pinned_toolbar_actions_ids.h"
 #include "chrome/browser/ui/views/event_utils.h"
@@ -32,7 +38,11 @@
 #include "chrome/browser/ui/views/toolbar/toolbar_ink_drop_util.h"
 #include "chrome/browser/ui/views/toolbar/toolbar_view.h"
 #include "chrome/browser/ui/web_applications/app_browser_controller.h"
+#include "chrome/common/extensions/extension_constants.h"
+#include "chrome/common/pref_names.h"
 #include "chrome/grit/generated_resources.h"
+#include "components/prefs/pref_service.h"
+#include "third_party/skia/include/core/SkColor.h"
 #include "ui/actions/action_id.h"
 #include "ui/actions/actions.h"
 #include "ui/base/metadata/metadata_impl_macros.h"
@@ -97,6 +107,28 @@ PinnedActionToolbarButton::PinnedActionToolbarButton(
   GetViewAccessibility().SetDescription(
       std::u16string(), ax::mojom::DescriptionFrom::kAttributeExplicitlyEmpty);
 
+  // Set text from action item if available for BrowserOS actions
+  if (auto* action_item = container_->GetActionItemFor(action_id)) {
+    if (browseros::IsBrowserOSAction(action_id)) {
+      // Check if labels should be shown
+      bool show_labels = true;
+      if (browser_ && browser_->GetProfile()) {
+        show_labels = browseros::ShouldShowToolbarLabels(
+            browser_->GetProfile()->GetPrefs());
+      }
+
+      if (show_labels) {
+        // Use LabelButton::SetText directly to set permanent text
+        views::LabelButton::SetText(action_item->GetText());
+        // Ensure the text is visible
+        SetTextSubpixelRenderingEnabled(false);
+      } else {
+        // Clear the text if labels are disabled
+        views::LabelButton::SetText(std::u16string());
+      }
+    }
+  }
+
   // Normally, the notify action is determined by whether a view is draggable
   // (and is set to press for non-draggable and release for draggable views).
   // However, PinnedActionToolbarButton may be draggable or non-draggable
@@ -236,6 +268,30 @@ void PinnedActionToolbarButton::OnMouseReleased(const ui::MouseEvent& event) {
   skip_execution_ = false;
 }
 
+void PinnedActionToolbarButton::UpdateLabelVisibility() {
+  if (!browseros::IsBrowserOSAction(action_id_)) {
+    return;
+  }
+
+  auto* action_item = container_->GetActionItemFor(action_id_);
+  if (!action_item) {
+    return;
+  }
+
+  bool show_labels = true;
+  if (browser_ && browser_->GetProfile()) {
+    show_labels = browseros::ShouldShowToolbarLabels(
+        browser_->GetProfile()->GetPrefs());
+  }
+
+  if (show_labels) {
+    views::LabelButton::SetText(action_item->GetText());
+    SetTextSubpixelRenderingEnabled(false);
+  } else {
+    views::LabelButton::SetText(std::u16string());
+  }
+}
+
 void PinnedActionToolbarButton::UpdateIcon() {
   const std::optional<VectorIcons>& icons = GetVectorIcons();
   // If the button is a cached permanent button the color provider will not be
@@ -341,6 +397,26 @@ void PinnedActionToolbarButtonActionViewInterface::ActionItemChangedImpl(
     }
   }
 
+  // Update the text from the action item for BrowserOS actions
+  if (browseros::IsBrowserOSAction(action_view_->GetActionId())) {
+    // Check if labels should be shown
+    bool show_labels = true;
+    if (action_view_->browser() && action_view_->browser()->GetProfile()) {
+      show_labels = browseros::ShouldShowToolbarLabels(
+          action_view_->browser()->GetProfile()->GetPrefs());
+    }
+
+    if (show_labels) {
+      // Use LabelButton::SetText directly to set permanent text
+      action_view_->views::LabelButton::SetText(action_item->GetText());
+      // Ensure the text is visible
+      action_view_->SetTextSubpixelRenderingEnabled(false);
+    } else {
+      // Clear the text if labels are disabled
+      action_view_->views::LabelButton::SetText(std::u16string());
+    }
+  }
+
   // Update whether the action is engaged before updating the view.
   action_view_->SetActionEngaged(
       action_item->GetProperty(kActionItemUnderlineIndicatorKey));
