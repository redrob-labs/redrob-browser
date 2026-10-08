diff --git a/chrome/installer/mac/signing/chromium_config.py b/chrome/installer/mac/signing/chromium_config.py
index 933690858aac8..7cc16fe8b6f8b 100644
--- a/chrome/installer/mac/signing/chromium_config.py
+++ b/chrome/installer/mac/signing/chromium_config.py
@@ -15,3 +15,9 @@ class ChromiumCodeSignConfig(BuildPropsCodeSignConfig):
     @property
     def provisioning_profile_basename(self):
         return None
+
+    @property
+    def run_spctl_assess(self):
+        # Redrob: assessed by the release workflow AFTER notarization instead; see
+        # rewrite/chrome/installer/mac/signing/chromium_config.py.yaml.
+        return False
