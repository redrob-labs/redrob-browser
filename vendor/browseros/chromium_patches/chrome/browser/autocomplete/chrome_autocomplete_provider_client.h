diff --git a/chrome/browser/autocomplete/chrome_autocomplete_provider_client.h b/chrome/browser/autocomplete/chrome_autocomplete_provider_client.h
--- a/chrome/browser/autocomplete/chrome_autocomplete_provider_client.h
+++ b/chrome/browser/autocomplete/chrome_autocomplete_provider_client.h
@@ -164,6 +164,7 @@ class ChromeAutocompleteProviderClient : public AutocompleteProviderClient {
   void IssueContextualSearchRequest(const GURL& destination_url,
                                     AutocompleteMatchType::Type match_type,
                                     bool is_zero_prefix_suggestion) override;
+  void StartRedrobAgentTask(const std::u16string& prompt) override;
 
   // For testing.
   void set_storage_partition(content::StoragePartition* storage_partition) {
