diff --git a/chrome/utility/importer/importer_creator.cc b/chrome/utility/importer/importer_creator.cc
--- a/chrome/utility/importer/importer_creator.cc
+++ b/chrome/utility/importer/importer_creator.cc
@@ -7,7 +7,9 @@
 #include "base/notreached.h"
 #include "build/build_config.h"
 #include "chrome/utility/importer/bookmarks_file_importer.h"
+#include "chrome/utility/importer/chromium_importer.h"
 #include "chrome/utility/importer/firefox_importer.h"
+#include "chrome/utility/importer/browseros/chrome_importer.h"
 
 #if BUILDFLAG(IS_WIN)
 #include "chrome/common/importer/edge_importer_utils_win.h"
@@ -36,9 +38,13 @@ scoped_refptr<Importer> CreateImporterByType(
 #endif
     case user_data_importer::TYPE_BOOKMARKS_FILE:
       return new BookmarksFileImporter();
+    case user_data_importer::TYPE_CHROMIUM_BASED:
+      return new redrob::ChromiumImporter();
 #if !BUILDFLAG(IS_CHROMEOS)
     case user_data_importer::TYPE_FIREFOX:
       return new FirefoxImporter();
+    case user_data_importer::TYPE_CHROME:
+      return new ChromeImporter();
 #endif
 #if BUILDFLAG(IS_MAC)
     case user_data_importer::TYPE_SAFARI:
