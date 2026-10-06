diff --git a/chrome/browser/extensions/api/api_browser_context_keyed_service_factories.cc b/chrome/browser/extensions/api/api_browser_context_keyed_service_factories.cc
--- a/chrome/browser/extensions/api/api_browser_context_keyed_service_factories.cc
+++ b/chrome/browser/extensions/api/api_browser_context_keyed_service_factories.cc
@@ -18,6 +18,9 @@
 #include "chrome/browser/extensions/api/preference/preference_api.h"
 #include "chrome/browser/extensions/api/processes/processes_api.h"
 #include "chrome/browser/extensions/api/reading_list/reading_list_event_router_factory.h"
+#include "chrome/browser/extensions/api/redrob_private/redrob_private_import_manager_factory.h"
+#include "chrome/browser/extensions/api/redrob_private/redrob_private_onboarding_service_factory.h"
+#include "chrome/browser/extensions/api/redrob_private/redrob_private_task_event_router_factory.h"
 #include "chrome/browser/extensions/api/sessions/sessions_api.h"
 #include "chrome/browser/extensions/api/side_panel/side_panel_service.h"
 #include "chrome/browser/extensions/api/tab_capture/tab_capture_registry.h"
@@ -100,6 +103,9 @@ void EnsureApiBrowserContextKeyedServiceFactoriesBuilt() {
   extensions::PreferenceAPI::GetFactoryInstance();
   extensions::ProcessesAPI::GetFactoryInstance();
   extensions::ReadingListEventRouterFactory::GetInstance();
+  extensions::RedrobPrivateImportManagerFactory::GetInstance();
+  extensions::RedrobPrivateOnboardingServiceFactory::GetInstance();
+  extensions::RedrobPrivateTaskEventRouterFactory::GetInstance();
   extensions::SessionsAPI::GetFactoryInstance();
   extensions::SidePanelService::GetFactoryInstance();
   extensions::TabCaptureRegistry::GetFactoryInstance();
