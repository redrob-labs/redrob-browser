diff --git a/chrome/browser/extensions/component_loader.cc b/chrome/browser/extensions/component_loader.cc
--- a/chrome/browser/extensions/component_loader.cc
+++ b/chrome/browser/extensions/component_loader.cc
@@ -44,6 +44,7 @@
 #include "chrome/grit/component_extension_resources.h"
 #include "chrome/grit/contextual_tasks_extension_resources.h"
 #include "chrome/grit/generated_resources.h"
+#include "chrome/grit/redrob_extension_resources.h"
 #include "components/component_updater/component_updater_paths.h"
 #include "components/crx_file/id_util.h"
 #include "components/omnibox/common/omnibox_features.h"
@@ -569,6 +570,14 @@ void ComponentLoader::AddContextualTasksExtension() {
   }
 }
 
+void ComponentLoader::AddRedrobExtension() {
+  // The path is the resource_path prefix scripts/vendor_extension.py writes into every include in
+  // chrome/browser/resources/redrob_extension/resources.grd. The two have to be the same string,
+  // or the manifest loads and every file inside the extension 404s.
+  Add(IDR_REDROB_EXTENSION_MANIFEST_JSON,
+      base::FilePath(FILE_PATH_LITERAL("redrob_extension")));
+}
+
 void ComponentLoader::AddWithNameAndDescription(
     int manifest_resource_id,
     const base::FilePath& root_directory,
@@ -786,6 +795,7 @@ void ComponentLoader::AddDefaultComponentExtensionsWithBackgroundPages(
   AddAimEligibilityExtension();
   AddGlicExtension();
   AddContextualTasksExtension();
+  AddRedrobExtension();
 
 // http://crbug.com/41070702
 #if BUILDFLAG(GOOGLE_CHROME_BRANDING) && !BUILDFLAG(IS_CHROMEOS)
