diff --git a/chrome/common/importer/profile_import_process_param_traits_macros.h b/chrome/common/importer/profile_import_process_param_traits_macros.h
--- a/chrome/common/importer/profile_import_process_param_traits_macros.h
+++ b/chrome/common/importer/profile_import_process_param_traits_macros.h
@@ -20,15 +20,11 @@
 #undef IPC_MESSAGE_EXPORT
 #define IPC_MESSAGE_EXPORT
 
-#if BUILDFLAG(IS_WIN)
+// One range on every platform now: TYPE_CHROMIUM_BASED is 8 and is the maximum everywhere,
+// which also removes the Windows/non-Windows split this used to need.
 IPC_ENUM_TRAITS_MIN_MAX_VALUE(user_data_importer::ImporterType,
                               user_data_importer::TYPE_UNKNOWN,
-                              user_data_importer::TYPE_EDGE)
-#else
-IPC_ENUM_TRAITS_MIN_MAX_VALUE(user_data_importer::ImporterType,
-                              user_data_importer::TYPE_UNKNOWN,
-                              user_data_importer::TYPE_BOOKMARKS_FILE)
-#endif
+                              user_data_importer::TYPE_CHROMIUM_BASED)
 
 IPC_ENUM_TRAITS_MIN_MAX_VALUE(user_data_importer::ImportItem,
                               user_data_importer::NONE,
@@ -41,6 +37,7 @@ IPC_STRUCT_TRAITS_BEGIN(user_data_importer::SourceProfile)
   IPC_STRUCT_TRAITS_MEMBER(app_path)
   IPC_STRUCT_TRAITS_MEMBER(services_supported)
   IPC_STRUCT_TRAITS_MEMBER(locale)
+  IPC_STRUCT_TRAITS_MEMBER(profile)
 IPC_STRUCT_TRAITS_END()
 
 IPC_STRUCT_TRAITS_BEGIN(user_data_importer::ImporterURLRow)
