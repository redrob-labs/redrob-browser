diff --git a/chrome/installer/linux/debian/build_repo_package.py b/chrome/installer/linux/debian/build_repo_package.py
--- a/chrome/installer/linux/debian/build_repo_package.py
+++ b/chrome/installer/linux/debian/build_repo_package.py
@@ -57,7 +57,9 @@ def main() -> None:
         config.info_vars["PACKAGE"] = "google-chrome-repo"
     else:
         config.info_vars["INSTALLDIR"] = "/opt/chromium.org/chromium-repo"
-        config.info_vars["PACKAGE"] = "chromium-browser-repo"
+        # Redrob: the apt-source package owns the sources.list entry, so its name is what a real machine
+        # points its updates at. Renamed for that reason, not for tidiness.
+        config.info_vars["PACKAGE"] = "redrob-browser-repo"
 
     config.channel = "repo"
 
