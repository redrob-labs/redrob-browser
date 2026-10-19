diff --git a/extensions/browser/external_install_info.cc b/extensions/browser/external_install_info.cc
index 4605419ba144b..70b443ed26244 100644
--- a/extensions/browser/external_install_info.cc
+++ b/extensions/browser/external_install_info.cc
@@ -22,12 +22,14 @@ ExternalInstallInfoFile::ExternalInstallInfoFile(
     mojom::ManifestLocation crx_location,
     int creation_flags,
     bool mark_acknowledged,
-    bool install_immediately)
+    bool install_immediately,
+    ExternalInstallPriority install_priority)
     : ExternalInstallInfo(extension_id, creation_flags, mark_acknowledged),
       version(version),
       path(path),
       crx_location(crx_location),
-      install_immediately(install_immediately) {}
+      install_immediately(install_immediately),
+      install_priority(install_priority) {}
 ExternalInstallInfoFile::ExternalInstallInfoFile(
     ExternalInstallInfoFile&& other) = default;
 
