diff --git a/components/omnibox/browser/autocomplete_controller.cc b/components/omnibox/browser/autocomplete_controller.cc
--- a/components/omnibox/browser/autocomplete_controller.cc
+++ b/components/omnibox/browser/autocomplete_controller.cc
@@ -78,6 +78,7 @@
 #include "components/omnibox/browser/omnibox_prefs.h"
 #include "components/omnibox/browser/on_device_head_provider.h"
 #include "components/omnibox/browser/open_tab_provider.h"
+#include "components/omnibox/browser/redrob_agent_provider.h"
 #include "components/omnibox/browser/page_classification_functions.h"
 #include "components/omnibox/browser/recently_closed_tabs_provider.h"
 #include "components/omnibox/browser/search_provider.h"
@@ -1494,6 +1495,9 @@ void AutocompleteController::InitializeSyncProviders(int provider_types) {
         base::MakeRefCounted<TabGroupProvider>(provider_client_.get()));
   }
 #endif
+  if (provider_types & AutocompleteProvider::TYPE_REDROB_AGENT) {
+    providers_.push_back(base::MakeRefCounted<RedrobAgentProvider>());
+  }
 }
 
 void AutocompleteController::UpdateResult(UpdateType update_type,
