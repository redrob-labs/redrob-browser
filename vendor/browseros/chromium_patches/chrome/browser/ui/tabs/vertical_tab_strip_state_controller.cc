diff --git a/chrome/browser/ui/tabs/vertical_tab_strip_state_controller.cc b/chrome/browser/ui/tabs/vertical_tab_strip_state_controller.cc
--- a/chrome/browser/ui/tabs/vertical_tab_strip_state_controller.cc
+++ b/chrome/browser/ui/tabs/vertical_tab_strip_state_controller.cc
@@ -12,6 +12,7 @@
 #include "base/strings/string_number_conversions.h"
 #include "base/strings/to_string.h"
 #include "base/timer/timer.h"
+#include "chrome/browser/browseros/core/browseros_prefs.h"
 #include "chrome/app/vector_icons/vector_icons.h"
 #include "chrome/browser/profiles/profile.h"
 #include "chrome/browser/sessions/session_service.h"
@@ -58,6 +59,8 @@ VerticalTabStripStateController::VerticalTabStripStateController(
       browser_window_(browser_window),
       scoped_unowned_user_data_(browser_window->GetUnownedUserDataHost(),
                                 *this) {
+  browseros::SyncVerticalTabsPref(pref_service_);
+
   pref_change_registrar_.Init(pref_service_);
 
   is_vertical_tabs_enabled_ =
@@ -79,6 +82,16 @@ VerticalTabStripStateController::VerticalTabStripStateController(
             base::Unretained(this)));
   }
 
+  pref_change_registrar_.Add(
+      browseros::prefs::kVerticalTabsEnabled,
+      base::BindRepeating(
+          [](PrefService* ps) {
+            ps->SetBoolean(
+                prefs::kVerticalTabsEnabled,
+                ps->GetBoolean(browseros::prefs::kVerticalTabsEnabled));
+          },
+          base::Unretained(pref_service_)));
+
   if (restored_state_collapsed.has_value()) {
     SetCollapsed(restored_state_collapsed.value());
   }
@@ -397,11 +410,16 @@ void VerticalTabStripStateController::UpdateCollapseActionItem() {
   const bool is_collapsed =
       GetCollapseState() != VerticalTabStripCollapseState::kExpanded;
 
+  // Redrob: a sidebar-panel glyph, not a hamburger-with-a-chevron. Upstream's kMenuOpenIcon /
+  // kMenuCloseCustomIcon pair draws three lines and an arrow, which says "menu" -- and the thing this button
+  // does is show and hide a PANEL. The reference draws exactly that: a 16x12 rounded rectangle with its
+  // leading column divided off, which is what dock_to_left / dock_to_right are.
+  //
+  // The pair still flips with state and still respects RTL, because which side the panel docks to is the
+  // whole content of the icon and getting it backwards in Hebrew or Arabic would point at the wrong edge.
   const gfx::VectorIcon& icon = (is_collapsed == base::i18n::IsRTL())
-                                    ? features::IsRoundedIconsEnabled()
-                                          ? views::kMenuOpenIcon
-                                          : views::kMenuOpenOldIcon
-                                    : views::kMenuCloseCustomIcon;
+                                    ? kDockToRightIcon
+                                    : kDockToLeftIcon;
 
   const auto& text =
       is_collapsed ? IDS_EXPAND_VERTICAL_TABS : IDS_COLLAPSE_VERTICAL_TABS;
