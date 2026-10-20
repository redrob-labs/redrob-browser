diff --git a/chrome/browser/shell_integration_linux.cc b/chrome/browser/shell_integration_linux.cc
index 2c071e6ba810a..7f9d0258faac8 100644
--- a/chrome/browser/shell_integration_linux.cc
+++ b/chrome/browser/shell_integration_linux.cc
@@ -471,7 +471,8 @@ std::string GetIconName() {
 #if BUILDFLAG(GOOGLE_CHROME_BRANDING)
   return "google-chrome";
 #else  // BUILDFLAG(CHROMIUM_BRANDING)
-  return "chromium-browser";
+  // Redrob: the icon name our .deb installs, see installer.py.
+  return "redrob-browser";
 #endif
 }
 
