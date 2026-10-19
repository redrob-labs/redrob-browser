diff --git a/chrome/browser/ui/views/profiles/first_run_flow_controller.h b/chrome/browser/ui/views/profiles/first_run_flow_controller.h
index e128130a918a0..d84a16d34a8ad 100644
--- a/chrome/browser/ui/views/profiles/first_run_flow_controller.h
+++ b/chrome/browser/ui/views/profiles/first_run_flow_controller.h
@@ -117,6 +117,9 @@ class FirstRunFlowController : public ProfileManagementFlowControllerImpl {
 
   void HandleIntroSigninChoice(IntroChoice choice);
 
+  // Invoked after the onboarding WebUI observes native extension readiness.
+  void HandleBrowserOSOnboardingComplete();
+
   void StartBrowsing();
 
   // Run the `finish_flow_callback_` if it's not empty.
