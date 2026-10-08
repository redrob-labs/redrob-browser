diff --git a/chrome/browser/ui/views/profiles/profile_menu_view_base.cc b/chrome/browser/ui/views/profiles/profile_menu_view_base.cc
--- a/chrome/browser/ui/views/profiles/profile_menu_view_base.cc
+++ b/chrome/browser/ui/views/profiles/profile_menu_view_base.cc
@@ -82,6 +82,44 @@
 
 namespace {
 
+// Redrob: which corner the profile bubble hangs from.
+//
+// Upstream hardcoded TOP_RIGHT, which puts the arrow at the bubble's top-right and therefore extends its BODY
+// LEFTWARD from the anchor. That is right for upstream, whose avatar is the last button of a top-right
+// toolbar. Redrob moved the avatar to the head of a left-hand sidebar at x~17, so leftward is off the window
+// and off the screen. Measured on a 1560x860 window at 0,0: the body landed at a negative x and the only thing
+// on screen was a ~40px slice of the bubble's right edge, overlapping the sidebar it was anchored to. It read
+// as a rendering fault, and the controls inside it could not be reached.
+//
+// Decided from the anchor rather than pinned to TOP_LEFT. This class is also the incognito menu's base and the
+// anchor is whatever registered itself as the avatar, so a bubble that always opened rightward would clip on
+// the far side as soon as an anchor sat near the trailing edge. Comparing against the work area rather than
+// the window because the window can itself be positioned near a screen edge.
+views::BubbleBorder::Arrow ArrowForProfileBubbleAnchor(
+    const views::BubbleAnchor& anchor) {
+  const views::View* anchor_view = nullptr;
+  if (const ui::TrackedElement* tracked_element = anchor.GetIfElement();
+      tracked_element && tracked_element->IsA<views::TrackedElementViews>()) {
+    anchor_view = tracked_element->AsA<views::TrackedElementViews>()->view();
+  } else {
+    anchor_view = anchor.GetIfView();
+  }
+  // No anchor view yet means no position to reason from, so keep upstream's choice rather than guess.
+  if (!anchor_view || !anchor_view->GetWidget()) {
+    return views::BubbleBorder::TOP_RIGHT;
+  }
+  const gfx::Point anchor_centre = anchor_view->GetBoundsInScreen().CenterPoint();
+  // GetDisplayNearestPoint rather than NearestView: the same accessor GetMaxHeight() below already uses, and
+  // it needs no NativeView from a const view.
+  const gfx::Rect work_area =
+      display::Screen::Get()->GetDisplayNearestPoint(anchor_centre).work_area();
+  // Open away from the nearer edge: an anchor in the left half has room to its right, and vice versa.
+  return anchor_centre.x() < work_area.CenterPoint().x()
+             ? views::BubbleBorder::TOP_LEFT
+             : views::BubbleBorder::TOP_RIGHT;
+}
+
+
 // Helpers --------------------------------------------------------------------
 
 constexpr int kMenuWidth = 328;
@@ -456,7 +494,8 @@ class ProfileMenuViewBase::AXMenuWidgetObserver : public views::WidgetObserver {
 
 ProfileMenuViewBase::ProfileMenuViewBase(views::BubbleAnchor anchor_element,
                                          BrowserWindowInterface* browser)
-    : BubbleDialogDelegateView(anchor_element, views::BubbleBorder::TOP_RIGHT),
+    : BubbleDialogDelegateView(anchor_element,
+                               ArrowForProfileBubbleAnchor(anchor_element)),
       profile_(raw_ref<Profile>::from_ptr(browser->GetProfile())),
       close_bubble_helper_(this, browser->GetTabStripModel()) {
   SetButtons(static_cast<int>(ui::mojom::DialogButton::kNone));
