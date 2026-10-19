diff --git a/chrome/browser/ui/webui/chrome_web_ui_configs.cc b/chrome/browser/ui/webui/chrome_web_ui_configs.cc
index 62b07dca08345..bc6c48c9d9c22 100644
--- a/chrome/browser/ui/webui/chrome_web_ui_configs.cc
+++ b/chrome/browser/ui/webui/chrome_web_ui_configs.cc
@@ -8,6 +8,7 @@
 #include "build/branding_buildflags.h"
 #include "build/build_config.h"
 #include "chrome/browser/browser_actuator/internals/browser_actuator_internals_ui.h"
+#include "chrome/browser/browseros/onboarding/browseros_onboarding.h"
 #include "chrome/browser/contextual_tasks/contextual_tasks_ui.h"
 #include "chrome/browser/glic/experimental_opt_in/glic_experimental_opt_in_ui.h"
 #include "chrome/browser/glic/host/glic_ui.h"
@@ -324,6 +325,7 @@ void RegisterChromeWebUIConfigs() {
   map.AddWebUIConfig(std::make_unique<SuggestInternalsUIConfig>());
   map.AddWebUIConfig(std::make_unique<SyncInternalsUIConfig>());
   map.AddWebUIConfig(std::make_unique<TranslateInternalsUIConfig>());
+  map.AddWebUIConfig(std::make_unique<BrowserOSOnboardingUIConfig>());
   map.AddWebUIConfig(std::make_unique<UsbInternalsUIConfig>());
   map.AddWebUIConfig(std::make_unique<user_actions_ui::UserActionsUIConfig>());
   map.AddWebUIConfig(std::make_unique<VersionUIConfig>());
