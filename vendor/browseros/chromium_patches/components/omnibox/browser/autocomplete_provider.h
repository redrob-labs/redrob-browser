diff --git a/components/omnibox/browser/autocomplete_provider.h b/components/omnibox/browser/autocomplete_provider.h
--- a/components/omnibox/browser/autocomplete_provider.h
+++ b/components/omnibox/browser/autocomplete_provider.h
@@ -184,6 +184,7 @@ class AutocompleteProvider
     TYPE_CONTEXTUAL_SEARCH = 1 << 25,
     TYPE_TAB_GROUP = 1 << 26,
     TYPE_CROSS_DEVICE_TAB = 1 << 27,
+    TYPE_REDROB_AGENT = 1 << 28,
 
     // When adding a value here, also update:
     // - omnibox_event.proto
