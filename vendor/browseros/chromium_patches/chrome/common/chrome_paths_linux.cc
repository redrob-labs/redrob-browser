diff --git a/chrome/common/chrome_paths_linux.cc b/chrome/common/chrome_paths_linux.cc
--- a/chrome/common/chrome_paths_linux.cc
+++ b/chrome/common/chrome_paths_linux.cc
@@ -15,6 +15,7 @@
 #include "base/strings/string_util.h"
 #include "build/branding_buildflags.h"
 #include "build/build_config.h"
+#include "chrome/browser/browseros/buildflags.h"
 #include "chrome/common/channel_info.h"
 #include "chrome/common/chrome_paths_internal.h"
 
@@ -94,8 +95,13 @@ bool GetDefaultUserDataDirectory(base::FilePath* result) {
   std::string data_dir_basename = "google-chrome-for-testing";
 #elif BUILDFLAG(GOOGLE_CHROME_BRANDING)
   std::string data_dir_basename = "google-chrome";
+#elif BUILDFLAG(BROWSEROS_PRODUCT_BROWSERCLAW)
+  std::string data_dir_basename = "browser-claw";
 #else
-  std::string data_dir_basename = "chromium";
+  // Redrob, not "chromium". A fork that keeps upstream's directory name shares a profile with any
+  // real Chromium install on the machine -- and our own importer, which looks for Chromium-family
+  // profiles by exactly this name, would offer to import from us.
+  std::string data_dir_basename = "redrob";
 #endif
   *result = config_dir.Append(data_dir_basename + GetChannelSuffixForDataDir());
   return true;
