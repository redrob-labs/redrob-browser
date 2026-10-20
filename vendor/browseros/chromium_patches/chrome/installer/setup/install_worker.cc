diff --git a/chrome/installer/setup/install_worker.cc b/chrome/installer/setup/install_worker.cc
index 5ddec8caa708c..22056861f9411 100644
--- a/chrome/installer/setup/install_worker.cc
+++ b/chrome/installer/setup/install_worker.cc
@@ -352,6 +352,15 @@ void AddChromeWorkItems(const InstallParams& install_params,
                               temp_path)
       ->set_best_effort(true);
 
+  // Redrob: the browser was chrome.exe before 0.5. Remove what an older
+  // install left behind (ignore failure if it's in use).
+  for (const wchar_t* legacy :
+       {L"chrome.exe", L"new_chrome.exe", L"old_chrome.exe",
+        L"chrome.VisualElementsManifest.xml"}) {
+    install_list->AddDeleteTreeWorkItem(target_path.Append(legacy), temp_path)
+        ->set_best_effort(true);
+  }
+
   // Delete an old VisualElementsManifest unconditionally.
   const base::FilePath manifest_path =
       target_path.Append(installer::kVisualElementsManifest);
