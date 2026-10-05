diff --git a/chrome/browser/extensions/chrome_component_extension_resource_manager.cc b/chrome/browser/extensions/chrome_component_extension_resource_manager.cc
--- a/chrome/browser/extensions/chrome_component_extension_resource_manager.cc
+++ b/chrome/browser/extensions/chrome_component_extension_resource_manager.cc
@@ -21,6 +21,7 @@
 #include "chrome/grit/chrome_unscaled_resources.h"
 #include "chrome/grit/component_extension_resources_map.h"
 #include "chrome/grit/contextual_tasks_extension_resources_map.h"
+#include "chrome/grit/redrob_extension_resources_map.h"
 #include "chrome/grit/theme_resources.h"
 #include "components/contextual_tasks/public/features.h"
 #include "components/omnibox/common/omnibox_features.h"
@@ -118,6 +119,7 @@ ChromeComponentExtensionResourceManager::Data::Data() {
 
   AddComponentResourceEntries(kComponentExtensionResources);
   AddComponentResourceEntries(kExtraComponentExtensionResources);
+  AddComponentResourceEntries(kRedrobExtensionResources);
   if (base::FeatureList::IsEnabled(
           omnibox::kAimEligibilityComponentExtension)) {
     AddComponentResourceEntries(kAimEligibilityExtensionResources);
