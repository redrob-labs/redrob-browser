diff --git a/chrome/browser/ui/window_feature_controller/window_feature_controller.cc b/chrome/browser/ui/window_feature_controller/window_feature_controller.cc
--- a/chrome/browser/ui/window_feature_controller/window_feature_controller.cc
+++ b/chrome/browser/ui/window_feature_controller/window_feature_controller.cc
@@ -81,8 +81,19 @@ bool WindowFeatureController::NormalBrowserSupportsWindowFeature(
     case WindowFeature::kFeatureBookmarkBar:
       return true;
     case WindowFeature::kFeatureTabStrip:
+      return check_can_support || !IsFullscreen();
     case WindowFeature::kFeatureToolbar:
     case WindowFeature::kFeatureLocationBar:
+      // Redrob DOES have a top row -- back, forward, reload, a magnifier and the address field, with
+      // nothing else in it. An earlier reading of the reference concluded there was no toolbar at all,
+      // which was wrong: the row is so quiet (no fill, no border, no box around the address) that it
+      // does not look like one, but it is there and it is where you type a URL.
+      //
+      // The row is the standard ToolbarView with its trailing half withdrawn rather than a new view: it
+      // is what owns back/forward/reload state, the omnibox, Ctrl+L, and the drop targets for a dragged
+      // link, and a hand-rolled row would have to re-earn all of it on every version bump. What we take
+      // out is done in ToolbarView itself -- the avatar (the sidebar owns it) and the app menu (the
+      // sidebar owns Settings).
       return check_can_support || !IsFullscreen();
     case WindowFeature::kFeatureTitleBar:
     case WindowFeature::kFeatureNone:
