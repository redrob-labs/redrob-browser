diff --git a/components/omnibox/browser/actions/omnibox_action.h b/components/omnibox/browser/actions/omnibox_action.h
--- a/components/omnibox/browser/actions/omnibox_action.h
+++ b/components/omnibox/browser/actions/omnibox_action.h
@@ -133,6 +133,10 @@ class OmniboxAction : public base::RefCountedThreadSafe<OmniboxAction> {
         const GURL& destination_url,
         AutocompleteMatchType::Type match_type,
         bool is_zero_prefix_suggestion) = 0;
+
+    // Hands what the user typed in the address bar to the agent, with the active tab as
+    // context. Does nothing by default: a client with no profile has no task to start.
+    virtual void StartRedrobAgentTask(const std::u16string& prompt) {}
   };
 
   // ExecutionContext provides the necessary structure for Action
