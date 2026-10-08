diff --git a/chrome/browser/ui/startup/first_run_service.cc b/chrome/browser/ui/startup/first_run_service.cc
--- a/chrome/browser/ui/startup/first_run_service.cc
+++ b/chrome/browser/ui/startup/first_run_service.cc
@@ -105,26 +105,17 @@ void FirstRunService::TryMarkFirstRunAlreadyFinished(
   //
   // Policy evaluation (to whether the rest of the flow should be skipped) will
   // be evaluated in `FirstRunFlowController`.
-  if (switches::IsPreFirstRunDesktopRefreshEnabled()) {
-    return;
-  }
-
-  // If the FRE is already open, it is obviously not finished and we also don't
-  // want to preemptively mark it completed. Skip all the below, the profile
-  // picker can handle being called while already shown.
-  if (ProfilePicker::IsFirstRunOpen()) {
-    return;
-  }
-
-  if (const std::optional<ProfilePicker::FirstRunFinishReason> skip_reason =
-          ProfilePicker::ComputeFirstRunSkipReason(*profile_);
-      skip_reason.has_value()) {
-    FinishFirstRun(*skip_reason);
-    return;
-  }
-
-  // Fallthrough: let the FRE be shown when the user opens a browser UI for the
-  // first time.
+  // Redrob never skips its own first run.
+  //
+  // Everything upstream did here is about Google sign-in: the profile already has an account, a
+  // device policy governs signing in, force-signin is on. Upstream's FRE IS a sign-in flow, so
+  // skipping it in those cases is right. Ours is not -- it explains the agent, sets a permission
+  // posture and offers to import another browser -- and none of that stops being necessary because
+  // sign-in is unavailable or already done. Left to upstream's rules our flow is invisible in exactly
+  // the builds that have no sign-in configured, which is how this was found: it never appeared.
+  //
+  // The skip branches are removed rather than left after an early return, so this carries no
+  // unreachable-code warning to re-read on every version bump.
 }
 
 // `resume_task_callback_` should be run to allow the caller to resume what
