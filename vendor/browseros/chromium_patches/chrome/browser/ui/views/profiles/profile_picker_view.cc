diff --git a/chrome/browser/ui/views/profiles/profile_picker_view.cc b/chrome/browser/ui/views/profiles/profile_picker_view.cc
--- a/chrome/browser/ui/views/profiles/profile_picker_view.cc
+++ b/chrome/browser/ui/views/profiles/profile_picker_view.cc
@@ -39,6 +39,7 @@
 #include "chrome/browser/ui/browser_window.h"
 #include "chrome/browser/ui/color/chrome_color_id.h"
 #include "chrome/browser/ui/views/profiles/first_run_flow_controller.h"
+#include "chrome/browser/ui/views/profiles/redrob_first_run_flow_controller.h"
 #include "chrome/browser/ui/views/profiles/profile_management_flow_controller.h"
 #include "chrome/browser/ui/views/profiles/profile_management_flow_controller_impl.h"
 #include "chrome/browser/ui/views/profiles/profile_management_types.h"
@@ -721,7 +722,9 @@ ProfilePickerView::CreateFlowController(Profile* picker_profile,
                        // Unretained ok because the controller is owned
                        // by this through `initialized_steps_`.
                        base::Unretained(&params_));
-    return std::make_unique<FirstRunFlowController>(
+    // Redrob's onboarding instead of Chromium's intro. The subclass overrides Init() only, so the
+    // completion path below this point is upstream's.
+    return std::make_unique<RedrobFirstRunFlowController>(
         /*host=*/this, std::move(clear_host_callback), picker_profile,
         std::move(first_run_exited_callback));
   }
