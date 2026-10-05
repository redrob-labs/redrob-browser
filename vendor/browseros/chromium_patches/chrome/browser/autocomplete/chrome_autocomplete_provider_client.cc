diff --git a/chrome/browser/autocomplete/chrome_autocomplete_provider_client.cc b/chrome/browser/autocomplete/chrome_autocomplete_provider_client.cc
--- a/chrome/browser/autocomplete/chrome_autocomplete_provider_client.cc
+++ b/chrome/browser/autocomplete/chrome_autocomplete_provider_client.cc
@@ -42,6 +42,9 @@
 #include "chrome/browser/preloading/prefetch/search_prefetch/search_prefetch_service.h"
 #include "chrome/browser/preloading/prefetch/search_prefetch/search_prefetch_service_factory.h"
 #include "chrome/browser/profiles/profile.h"
+#include "chrome/browser/redrob/task_store.h"
+#include "chrome/browser/redrob/task_store_factory.h"
+#include "chrome/browser/ui/webui/redrob/redrob.mojom.h"
 #include "chrome/browser/profiles/profile_key.h"
 #include "chrome/browser/search/search.h"
 #include "chrome/browser/search_engines/ai_mode_button_service_factory.h"
@@ -933,6 +936,31 @@ void ChromeAutocompleteProviderClient::IssueContextualSearchRequest(
 #endif  // !BUILDFLAG(IS_ANDROID)
 }
 
+void ChromeAutocompleteProviderClient::StartRedrobAgentTask(
+    const std::u16string& prompt) {
+  redrob::TaskStore* store = redrob::TaskStoreFactory::GetForProfile(profile_);
+  if (!store) {
+    return;
+  }
+
+  std::vector<std::string> context_refs;
+  if (auto* web_contents = GetWebContents(web_contents_getter_)) {
+    const GURL url = web_contents->GetLastCommittedURL();
+    if (url.is_valid() && url.SchemeIsHTTPOrHTTPS()) {
+      context_refs.push_back(url.spec());
+      const std::u16string title = web_contents->GetTitle();
+      if (!title.empty()) {
+        context_refs.push_back(base::UTF16ToUTF8(title));
+      }
+    }
+  }
+
+  store->StartTask(base::UTF16ToUTF8(prompt), context_refs,
+                   redrob::mojom::PermissionMode::kReadOnly,
+                   redrob::mojom::Effort::kStandard,
+                   /*model=*/std::string());
+}
+
 void ChromeAutocompleteProviderClient::PromptPageTranslation() {
 #if !BUILDFLAG(IS_ANDROID)
   BrowserWindowInterface* const bwi =
