diff --git a/chrome/browser/ui/profiles/profile_error_dialog.cc b/chrome/browser/ui/profiles/profile_error_dialog.cc
index 1c94ce3fb3dba..a51a43b4f5705 100644
--- a/chrome/browser/ui/profiles/profile_error_dialog.cc
+++ b/chrome/browser/ui/profiles/profile_error_dialog.cc
@@ -67,10 +67,11 @@ void ShowProfileErrorDialog(ProfileErrorType type,
       l10n_util::GetStringUTF16(IDS_PROFILE_ERROR_DIALOG_CHECKBOX),
       base::BindOnce(&OnProfileErrorDialogDismissed, diagnostics));
 #else   // BUILDFLAG(GOOGLE_CHROME_BRANDING)
-  chrome::ShowWarningMessageBox(
-      gfx::NativeWindow(),
-      l10n_util::GetStringUTF16(IDS_PROFILE_ERROR_DIALOG_TITLE),
-      l10n_util::GetStringUTF16(message_id));
+  // FIXME: nikhil: Handle this warning better
+  // chrome::ShowWarningMessageBox(
+  //     gfx::NativeWindow(),
+  //     l10n_util::GetStringUTF16(IDS_PROFILE_ERROR_DIALOG_TITLE),
+  //     l10n_util::GetStringUTF16(message_id));
 #endif  // BUILDFLAG(GOOGLE_CHROME_BRANDING)
 
 #endif  // BUILDFLAG(IS_ANDROID)
