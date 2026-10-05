diff --git a/components/user_data_importer/common/importer_type.h b/components/user_data_importer/common/importer_type.h
--- a/components/user_data_importer/common/importer_type.h
+++ b/components/user_data_importer/common/importer_type.h
@@ -25,9 +25,14 @@ enum ImporterType {
 #endif
   // Value 4 was the (now deleted) Google Toolbar importer.
   TYPE_BOOKMARKS_FILE = 5,  // Identifies a 'bookmarks.html' file.
+  // Chrome, Edge, Brave, Vivaldi, Opera, Chromium -- anything that stores a profile in
+  // Chromium's own on-disk formats. Upstream has no importer for these at all; this fork's is
+  // at chrome/utility/importer/chromium_importer.h.
+  TYPE_CHROMIUM_BASED = 7,
 #if BUILDFLAG(IS_WIN)
   TYPE_EDGE = 6,
 #endif
+  TYPE_CHROME = 7,
 };
 
 }  // namespace user_data_importer
