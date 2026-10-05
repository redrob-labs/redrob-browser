diff --git a/chrome/common/chrome_features.cc b/chrome/common/chrome_features.cc
--- a/chrome/common/chrome_features.cc
+++ b/chrome/common/chrome_features.cc
@@ -538,14 +538,14 @@ BASE_FEATURE(kGlicMessageFirstFre, base::FEATURE_DISABLED_BY_DEFAULT);
 // IMPORTANT: this feature should never be expired! It is used as the main
 // kill-switch for Glic and can be used in the future to handle unsupported
 // Chrome versions.
-BASE_FEATURE(kGlic,
-#if BUILDFLAG(IS_MAC) || BUILDFLAG(IS_WIN) || BUILDFLAG(IS_CHROMEOS) || \
-    BUILDFLAG(IS_ANDROID)
-             base::FEATURE_ENABLED_BY_DEFAULT
-#else
-             base::FEATURE_DISABLED_BY_DEFAULT
-#endif
-);
+// Redrob: off on every platform. Upstream enables this by default on macOS, Windows and ChromeOS, and
+// what keeps its assistant out of a build there is a chain of conditions we do not control -- a rollout
+// flag, an account capability, country and locale filters. This browser ships its OWN agent, so relying
+// on someone else's rollout to keep a second, competing assistant out of it is not a decision we should
+// leave to chance: a change on that side would surface it inside our product. Disabling the documented
+// kill-switch is the narrowest way to do that -- it takes out the profile-picker entry point, the side
+// panel and the settings page together, with no upstream code deleted.
+BASE_FEATURE(kGlic, base::FEATURE_DISABLED_BY_DEFAULT);
 
 BASE_FEATURE(kGlicBackgroundActuation, base::FEATURE_DISABLED_BY_DEFAULT);
 
