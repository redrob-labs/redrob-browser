diff --git a/chrome/browser/autocomplete/chrome_autocomplete_provider_client.cc b/chrome/browser/autocomplete/chrome_autocomplete_provider_client.cc
--- a/chrome/browser/autocomplete/chrome_autocomplete_provider_client.cc
+++ b/chrome/browser/autocomplete/chrome_autocomplete_provider_client.cc
@@ -42,6 +42,8 @@
 #include "chrome/browser/preloading/prefetch/search_prefetch/search_prefetch_service.h"
 #include "chrome/browser/preloading/prefetch/search_prefetch/search_prefetch_service_factory.h"
 #include "chrome/browser/profiles/profile.h"
+#include "chrome/browser/redrob/agent_entry.h"
+#include "components/sessions/content/session_tab_helper.h"
 #include "chrome/browser/profiles/profile_key.h"
 #include "chrome/browser/search/search.h"
 #include "chrome/browser/search_engines/ai_mode_button_service_factory.h"
@@ -933,6 +935,22 @@ void ChromeAutocompleteProviderClient::IssueContextualSearchRequest(
 #endif  // !BUILDFLAG(IS_ANDROID)
 }
 
+void ChromeAutocompleteProviderClient::StartRedrobAgentTask(
+    const std::u16string& prompt) {
+  std::optional<int> context_tab_id;
+  if (auto* web_contents = GetWebContents(web_contents_getter_)) {
+    const GURL url = web_contents->GetLastCommittedURL();
+    if (url.is_valid() && url.SchemeIsHTTPOrHTTPS()) {
+      const SessionID id = sessions::SessionTabHelper::IdForTab(web_contents);
+      if (id.is_valid()) {
+        context_tab_id = id.id();
+      }
+    }
+  }
+
+  redrob::OpenAgentChat(profile_, base::UTF16ToUTF8(prompt), context_tab_id);
+}
+
 void ChromeAutocompleteProviderClient::PromptPageTranslation() {
 #if !BUILDFLAG(IS_ANDROID)
   BrowserWindowInterface* const bwi =
