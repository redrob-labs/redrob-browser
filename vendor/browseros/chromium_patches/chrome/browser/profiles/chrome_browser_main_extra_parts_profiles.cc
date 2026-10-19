diff --git a/chrome/browser/profiles/chrome_browser_main_extra_parts_profiles.cc b/chrome/browser/profiles/chrome_browser_main_extra_parts_profiles.cc
--- a/chrome/browser/profiles/chrome_browser_main_extra_parts_profiles.cc
+++ b/chrome/browser/profiles/chrome_browser_main_extra_parts_profiles.cc
@@ -394,7 +394,10 @@
 #include "chrome/browser/profile_resetter/reset_report_uploader_factory.h"
 #include "chrome/browser/record_replay/task_parameters_extractor_factory.h"
 #include "chrome/browser/record_replay/task_service_factory.h"
+#include "chrome/browser/redrob/agent_service_factories.h"
+#include "chrome/browser/redrob/task_store_factory.h"
 #include "chrome/browser/record_replay/task_store_factory.h"
+#include "chrome/browser/ui/views/redrob/quick_window_service.h"
 #include "chrome/browser/screen_ai/screen_ai_service_router_factory.h"
 #include "chrome/browser/search/instant_service_factory.h"
 #include "chrome/browser/search_engine_choice/search_engine_choice_dialog_service_factory.h"
@@ -727,7 +730,13 @@ void ChromeBrowserMainExtraPartsProfiles::
   // ---------------------------------------------------------------------------
   // Common factory registrations (Please keep this list ordered without taking
   // into consideration buildflags, repeating buildflags is ok):
+  redrob::TaskStoreFactory::GetInstance();
+  redrob::MemoryStoreFactory::GetInstance();
+  redrob::ModelStoreFactory::GetInstance();
+  redrob::RoutineStoreFactory::GetInstance();
+  redrob::RpcServerFactory::GetInstance();
   AboutSigninInternalsFactory::GetInstance();
+  redrob::QuickWindowServiceFactory::GetInstance();
   AboutThisSiteServiceFactory::GetInstance();
   AcceptLanguagesServiceFactory::GetInstance();
   AccessibilityLabelsServiceFactory::GetInstance();
