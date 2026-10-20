diff --git a/chrome/common/channel_info_posix.cc b/chrome/common/channel_info_posix.cc
index f6bcb3cc8e8d6..140de3e51e807 100644
--- a/chrome/common/channel_info_posix.cc
+++ b/chrome/common/channel_info_posix.cc
@@ -148,7 +148,8 @@ std::string GetDesktopName(base::Environment* env) {
   if (name.has_value() && !name.value().empty()) {
     return name.value();
   }
-  return "chromium-browser.desktop";
+  // Redrob: the name our .deb installs, see installer.py.
+  return "redrob-browser.desktop";
 #endif
 }
 #endif  // BUILDFLAG(IS_LINUX)
