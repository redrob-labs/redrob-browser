diff --git a/chrome/browser/prefs/browser_prefs.cc b/chrome/browser/prefs/browser_prefs.cc
--- a/chrome/browser/prefs/browser_prefs.cc
+++ b/chrome/browser/prefs/browser_prefs.cc
@@ -24,6 +24,8 @@
 #include "chrome/browser/accessibility/page_colors_controller.h"
 #include "chrome/browser/accessibility/prefers_default_scrollbar_styles_prefs.h"
 #include "chrome/browser/browser_process_impl.h"
+#include "chrome/browser/browseros/core/browseros_prefs.h"
+#include "chrome/browser/browseros/server/browseros_server_prefs.h"
 #include "chrome/browser/chrome_content_browser_client.h"
 #include "chrome/browser/component_updater/component_updater_prefs.h"
 #include "chrome/browser/context_hub/prefs.h"
@@ -76,6 +78,7 @@
 #include "chrome/browser/push_messaging/push_messaging_app_identifier.h"
 #include "chrome/browser/push_messaging/push_messaging_service_impl.h"
 #include "chrome/browser/push_messaging/push_messaging_unsubscribed_entry.h"
+#include "chrome/browser/redrob/redrob_prefs.h"
 #include "chrome/browser/rlz/chrome_rlz_tracker_delegate.h"
 #include "chrome/browser/search/background/ntp_custom_background_service.h"
 #include "chrome/browser/search/search.h"
@@ -1424,6 +1427,7 @@ void RegisterLocalState(PrefRegistrySimple* registry) {
   breadcrumbs::RegisterPrefs(registry);
   browser_shutdown::RegisterPrefs(registry);
   BrowserProcessImpl::RegisterPrefs(registry);
+  browseros_server::RegisterLocalStatePrefs(registry);
   ChromeContentBrowserClient::RegisterLocalStatePrefs(registry);
 #if BUILDFLAG(CHROME_FOR_TESTING)
   chrome_for_testing::RegisterPrefs(registry);
@@ -1852,6 +1856,7 @@ void RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry,
 #if !BUILDFLAG(IS_ANDROID)
   indigo::prefs::RegisterProfilePrefs(registry);
 #endif
+  RegisterBrowserOSPrefs(registry);
   RegisterPrefersDefaultScrollbarStylesPrefs(registry);
   RegisterSafetyHubProfilePrefs(registry);
 #if BUILDFLAG(IS_CHROMEOS)
@@ -2279,6 +2284,10 @@ void RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry,
 #endif  // BUILDFLAG(IS_ANDROID)
 
   registry->RegisterBooleanPref(prefs::kStaticStorageQuotaEnabled, false);
+
+  // Everything the agent keeps between runs, registered from one place so that the settings screen
+  // claiming to list all of it can be checked against a single file.
+  redrob::prefs::RegisterProfilePrefs(registry);
 }
 
 void RegisterUserProfilePrefs(user_prefs::PrefRegistrySyncable* registry) {
@@ -2307,6 +2316,10 @@ void RegisterGeminiSettingsPrefs(user_prefs::PrefRegistrySyncable* registry) {
   registry->RegisterIntegerPref(optimization_guide::prefs::kGeminiSettings, 0);
 }
 
+void RegisterBrowserOSPrefs(user_prefs::PrefRegistrySyncable* registry) {
+  browseros::RegisterProfilePrefs(registry);
+}
+
 #if BUILDFLAG(IS_CHROMEOS)
 void RegisterSigninProfilePrefs(user_prefs::PrefRegistrySyncable* registry,
                                 std::string_view country) {
