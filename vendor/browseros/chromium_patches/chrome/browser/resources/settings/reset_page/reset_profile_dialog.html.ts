diff --git a/chrome/browser/resources/settings/reset_page/reset_profile_dialog.html.ts b/chrome/browser/resources/settings/reset_page/reset_profile_dialog.html.ts
index 158cc884540c5..8322d7a327d64 100644
--- a/chrome/browser/resources/settings/reset_page/reset_profile_dialog.html.ts
+++ b/chrome/browser/resources/settings/reset_page/reset_profile_dialog.html.ts
@@ -33,7 +33,7 @@ export function getHtml(this: SettingsResetProfileDialogElement) {
     </cr-button>
   </div>
   <div slot="footer">
-    <cr-checkbox id="sendSettings" checked>
+    <cr-checkbox id="sendSettings">
       $i18nRaw{resetPageFeedback}
     </cr-checkbox>
   </div>
