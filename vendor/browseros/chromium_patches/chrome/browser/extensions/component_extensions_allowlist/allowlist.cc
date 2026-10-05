diff --git a/chrome/browser/extensions/component_extensions_allowlist/allowlist.cc b/chrome/browser/extensions/component_extensions_allowlist/allowlist.cc
--- a/chrome/browser/extensions/component_extensions_allowlist/allowlist.cc
+++ b/chrome/browser/extensions/component_extensions_allowlist/allowlist.cc
@@ -18,6 +18,7 @@
 #include "chrome/grit/browser_resources.h"
 #include "chrome/grit/component_extension_resources.h"
 #include "chrome/grit/contextual_tasks_extension_resources.h"
+#include "chrome/grit/redrob_extension_resources.h"
 #include "extensions/buildflags/buildflags.h"
 #include "extensions/common/constants.h"
 #include "printing/buildflags/buildflags.h"
@@ -40,6 +41,7 @@ bool IsComponentExtensionAllowlisted(const std::string& extension_id) {
       extension_misc::kGlicExtensionId,
       extension_misc::kInAppPaymentsSupportAppId,
       extension_misc::kPdfExtensionId,
+      extension_misc::kRedrobExtensionId,
 #if BUILDFLAG(IS_CHROMEOS)
       extension_misc::kAssessmentAssistantExtensionId,
       extension_misc::kAccessibilityCommonExtensionId,
@@ -99,6 +101,7 @@ bool IsComponentExtensionAllowlisted(int manifest_resource_id) {
     case IDR_NETWORK_SPEECH_SYNTHESIS_MANIFEST:
     case IDR_NETWORK_SPEECH_SYNTHESIS_MANIFEST_MV3:
     case IDR_READING_MODE_GDOCS_HELPER_MANIFEST:
+    case IDR_REDROB_EXTENSION_MANIFEST_JSON:
     case IDR_WEBSTORE_MANIFEST:
 
 #if BUILDFLAG(IS_CHROMEOS)
