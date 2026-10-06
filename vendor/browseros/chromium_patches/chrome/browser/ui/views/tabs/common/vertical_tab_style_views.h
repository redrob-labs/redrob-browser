diff --git a/chrome/browser/ui/views/tabs/common/vertical_tab_style_views.h b/chrome/browser/ui/views/tabs/common/vertical_tab_style_views.h
--- a/chrome/browser/ui/views/tabs/common/vertical_tab_style_views.h
+++ b/chrome/browser/ui/views/tabs/common/vertical_tab_style_views.h
@@ -31,6 +31,10 @@ class VerticalTabStyleViews : public TabStyleViews {
       float paint_recording_scale) const override;
   void PaintTab(gfx::Canvas* canvas) const override;
 
+  // The raised-card shadow under a selected tab. Separate because it has to run before the fill clips to
+  // the tab's path.
+  void PaintTabShadow(gfx::Canvas* canvas) const;
+
   gfx::Insets GetContentsInsets() const override;
   int GetStrokeThickness() const override;
   SkPath GetOverlinePath(float scale) const override;
