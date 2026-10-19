diff --git a/chrome/browser/resources/settings/people_page/import_data_dialog.ts b/chrome/browser/resources/settings/people_page/import_data_dialog.ts
index 61e876cf10ab1..94847033a577f 100644
--- a/chrome/browser/resources/settings/people_page/import_data_dialog.ts
+++ b/chrome/browser/resources/settings/people_page/import_data_dialog.ts
@@ -78,6 +78,8 @@ export class SettingsImportDataDialogElement extends
     passwords: false,
     search: false,
     autofillFormData: false,
+    extensions: false,
+    cookies: false,
   };
   protected accessor noImportDataTypeSelected_: boolean = false;
   protected accessor importStatus_: ImportDataStatus = ImportDataStatus.INITIAL;
