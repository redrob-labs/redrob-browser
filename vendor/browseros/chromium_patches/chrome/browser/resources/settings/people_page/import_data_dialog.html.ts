diff --git a/chrome/browser/resources/settings/people_page/import_data_dialog.html.ts b/chrome/browser/resources/settings/people_page/import_data_dialog.html.ts
index 89321068222f0..3d62c47f44641 100644
--- a/chrome/browser/resources/settings/people_page/import_data_dialog.html.ts
+++ b/chrome/browser/resources/settings/people_page/import_data_dialog.html.ts
@@ -70,6 +70,16 @@ export function getHtml(this: SettingsImportDataDialogElement) {
                 pref-key="import_dialog_autofill_form_data"
                 label="$i18n{importAutofillFormData}" no-set-pref>
             </settings-checkbox>
+            <settings-checkbox id="importDialogExtensions"
+                ?hidden="${!this.selected_.extensions}"
+                pref-key="import_dialog_extensions"
+                label="$i18n{importDialogExtensions}" no-set-pref>
+            </settings-checkbox>
+            <settings-checkbox id="importDialogCookies"
+                ?hidden="${!this.selected_.cookies}"
+                pref-key="import_dialog_cookies"
+                label="$i18n{importDialogCookies}" no-set-pref>
+            </settings-checkbox>
           </div>
         </div>
       </div>
