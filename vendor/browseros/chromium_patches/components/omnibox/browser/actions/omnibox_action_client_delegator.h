diff --git a/components/omnibox/browser/actions/omnibox_action_client_delegator.h b/components/omnibox/browser/actions/omnibox_action_client_delegator.h
--- a/components/omnibox/browser/actions/omnibox_action_client_delegator.h
+++ b/components/omnibox/browser/actions/omnibox_action_client_delegator.h
@@ -39,6 +39,9 @@ class OmniboxActionClientDelegator : public OmniboxAction::Client {
                                     bool is_zero_prefix_suggestion) override;
   bool ShouldOpenComposeboxForAskG() const override;
   void OpenComposeboxForAskG() override;
+  void StartRedrobAgentTask(const std::u16string& prompt) override {
+    delegate_->StartRedrobAgentTask(prompt);
+  }
 
  protected:
   const raw_ptr<OmniboxAction::Client> delegate_;
