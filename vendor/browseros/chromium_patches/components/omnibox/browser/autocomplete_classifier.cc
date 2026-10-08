diff --git a/components/omnibox/browser/autocomplete_classifier.cc b/components/omnibox/browser/autocomplete_classifier.cc
--- a/components/omnibox/browser/autocomplete_classifier.cc
+++ b/components/omnibox/browser/autocomplete_classifier.cc
@@ -68,6 +68,7 @@ int AutocompleteClassifier::DefaultOmniboxProviders(bool is_low_memory_device) {
            ? AutocompleteProvider::TYPE_RECENTLY_CLOSED_TABS
            : 0) |
       AutocompleteProvider::TYPE_CONTEXTUAL_SEARCH |
+      AutocompleteProvider::TYPE_REDROB_AGENT |
 #elif !BUILDFLAG(IS_DESKTOP_ANDROID)
       AutocompleteProvider::TYPE_CLIPBOARD |
       AutocompleteProvider::TYPE_MOST_VISITED_SITES |
