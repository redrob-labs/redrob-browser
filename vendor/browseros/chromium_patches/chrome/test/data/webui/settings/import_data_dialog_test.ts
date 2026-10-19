diff --git a/chrome/test/data/webui/settings/import_data_dialog_test.ts b/chrome/test/data/webui/settings/import_data_dialog_test.ts
index b0d52e62e2945..5097884c358d5 100644
--- a/chrome/test/data/webui/settings/import_data_dialog_test.ts
+++ b/chrome/test/data/webui/settings/import_data_dialog_test.ts
@@ -50,6 +50,8 @@ suite('ImportDataDialog', function() {
   const browserProfiles: BrowserProfile[] = [
     {
       autofillFormData: true,
+      cookies: false,
+      extensions: false,
       favorites: true,
       history: true,
       index: 0,
@@ -60,6 +62,8 @@ suite('ImportDataDialog', function() {
     },
     {
       autofillFormData: true,
+      cookies: false,
+      extensions: false,
       favorites: true,
       history: false,  // Emulate unsupported import option
       index: 1,
@@ -70,6 +74,8 @@ suite('ImportDataDialog', function() {
     },
     {
       autofillFormData: false,
+      cookies: false,
+      extensions: false,
       favorites: true,
       history: false,
       index: 2,
