diff --git a/chrome/browser/ui/views/tabs/common/vertical_tab_style_views.cc b/chrome/browser/ui/views/tabs/common/vertical_tab_style_views.cc
--- a/chrome/browser/ui/views/tabs/common/vertical_tab_style_views.cc
+++ b/chrome/browser/ui/views/tabs/common/vertical_tab_style_views.cc
@@ -55,6 +55,8 @@ SkPath VerticalTabStyleViews::GetPath(TabStyle::PathType path_type,
                                       const TabPathFlags& flags) const {
   const SkScalar corner_radius = GetCornerRadius();
   gfx::RectF bounds(delegate_->GetView()->GetLocalBounds());
+  // The pill is the TOP of the view; the rest is the shadow's.
+  bounds.Inset(gfx::InsetsF::TLBR(0, 0, kVerticalTabShadowRoom, 0));
 
   if (flags.render_units == TabStyle::RenderUnits::kPixels) {
     bounds.Scale(scale);
@@ -88,11 +90,23 @@ void VerticalTabStyleViews::PaintTab(gfx::Canvas* canvas) const {
                                BrowserFrameActiveState::kUseCurrent)
                          : std::nullopt;
 
+  // Redrob: the selected tab is a raised card, so it casts a shadow. Before the fill, because
+  // PaintTabBackgroundFill clips to the tab's own path first and a shadow drawn inside that clip is entirely
+  // outside the path and therefore entirely discarded.
+  //
+  // Only for the states that read as raised. An inactive tab is flush with the column, and giving every row a
+  // shadow would make the list look embossed rather than telling one row from the rest.
+  const TabStyle::TabSelectionState selection_state = GetSelectionState();
+  if (selection_state == TabStyle::TabSelectionState::kActive ||
+      selection_state == TabStyle::TabSelectionState::kSelected) {
+    PaintTabShadow(canvas);
+  }
+
   if (active_tab_fill_id.has_value() || inactive_tab_fill_id.has_value()) {
     PaintTabBackgroundWithImages(canvas, active_tab_fill_id,
                                  inactive_tab_fill_id);
   } else {
-    PaintTabBackgroundFill(canvas, GetSelectionState(),
+    PaintTabBackgroundFill(canvas, selection_state,
                            delegate_->IsHoverAnimationActive(), std::nullopt);
   }
 }
@@ -225,8 +239,13 @@ SkScalar VerticalTabStyleViews::GetCornerRadius() const {
 }
 
 gfx::Insets VerticalTabStyleViews::GetContentsInsets() const {
-  return gfx::Insets::VH(
+  // The extra bottom inset keeps the label centred in the PILL rather than in the view, which is taller by
+  // the shadow's room. Without it the favicon and title sit low in every tab, which reads as the text being
+  // off rather than the box being big.
+  return gfx::Insets::TLBR(
       GetLayoutConstant(LayoutConstant::kTabVerticalPadding),
+      GetLayoutConstant(LayoutConstant::kTabHorizontalPadding),
+      GetLayoutConstant(LayoutConstant::kTabVerticalPadding) + kVerticalTabShadowRoom,
       GetLayoutConstant(LayoutConstant::kTabHorizontalPadding));
 }
 
