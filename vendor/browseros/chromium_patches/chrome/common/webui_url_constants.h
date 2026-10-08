diff --git a/chrome/common/webui_url_constants.h b/chrome/common/webui_url_constants.h
--- a/chrome/common/webui_url_constants.h
+++ b/chrome/common/webui_url_constants.h
@@ -34,6 +34,10 @@ namespace chrome {
 // needed.
 // Please keep in alphabetical order, with OS/feature specific sections below.
 inline constexpr char kChromeUIAboutHost[] = "about";
+inline constexpr char kChromeUIBrowserOSOnboardingHost[] =
+    "redrob-onboarding";
+inline constexpr char kChromeUIBrowserOSOnboardingURL[] =
+    "chrome://redrob-onboarding/";
 inline constexpr char kChromeUIAboutURL[] = "chrome://about/";
 inline constexpr char kChromeUIAccessCodeCastHost[] = "access-code-cast";
 inline constexpr char kChromeUIAccessCodeCastURL[] =
