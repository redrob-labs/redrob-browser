diff --git a/chrome/browser/chrome_browser_main.cc b/chrome/browser/chrome_browser_main.cc
--- a/chrome/browser/chrome_browser_main.cc
+++ b/chrome/browser/chrome_browser_main.cc
@@ -34,6 +34,8 @@
 #include "chrome/browser/browser_features.h"
 #include "chrome/browser/browser_process.h"
 #include "chrome/browser/browser_process_impl.h"
+#include "chrome/browser/browseros/metrics/browseros_metrics_extra_parts.h"
+#include "chrome/browser/browseros/server/browseros_server_manager.h"
 #include "chrome/browser/chrome_browser_main_extra_parts.h"
 #include "chrome/browser/component_updater/registration.h"
 #include "chrome/browser/enterprise/browser_management/management_service_factory.h"
@@ -74,6 +76,8 @@
 #include "chrome/browser/translate/translate_service.h"
 #include "chrome/browser/ui/actions/chrome_actions.h"
 #include "chrome/browser/ui/color/chrome_color_mixers.h"
+#include "chrome/browser/redrob/redrob_fonts.h"
+#include "chrome/browser/ui/color/redrob_color_mixer.h"
 #include "chrome/browser/ui/javascript_dialogs/chrome_javascript_app_modal_dialog_view_factory.h"
 #include "chrome/browser/ui/profiles/profile_error_dialog.h"
 #include "chrome/browser/ui/startup/bad_flags_prompt.h"
@@ -843,6 +847,7 @@ std::unique_ptr<content::BrowserMainParts> ChromeBrowserMainParts::Create(
   main_parts->AddParts(std::make_unique<ChromeBrowserMainExtraPartsMemory>());
 
   chrome::AddMetricsExtraParts(main_parts.get());
+  browseros_metrics::AddBrowserOSMetricsExtraParts(main_parts.get());
 
   main_parts->AddParts(
       std::make_unique<
@@ -1064,6 +1069,15 @@ void ChromeBrowserMainParts::ToolkitInitialized() {
       base::BindRepeating(color::AddComponentsColorMixers));
   ui::ColorProviderManager::Get().AppendColorProviderInitializer(
       base::BindRepeating(AddChromeColorMixers));
+  // Last, so Redrob's palette is the final word on the ids it names and silent on every id it does not.
+  ui::ColorProviderManager::Get().AppendColorProviderInitializer(
+      base::BindRepeating(redrob::AddRedrobColorMixer));
+
+  // The product's typeface, in ToolkitInitialized because that is after the platform's font system exists
+  // (on Linux the GTK/native theme above brings fontconfig up) and before any view -- and therefore any
+  // FontList -- is built. Without it the WebUI surfaces drew in Pretendard and every views surface beside
+  // them drew in the platform default, which is two faces in one window.
+  redrob::RegisterUiFont();
 
   InitializeActionIdStringMapping();
 }
@@ -1359,6 +1373,43 @@ int ChromeBrowserMainParts::PreCreateThreadsImpl() {
   }
 #endif
 
+#if BUILDFLAG(IS_MAC)
+  // Install iCloud Passwords native messaging host manifest.
+  //
+  // Why this runs on every startup (not just first run):
+  // - First-run only would miss existing users upgrading to this version
+  // - The "First Run" sentinel already exists for them, so IsChromeFirstRun()
+  //   returns false and first-run code is skipped entirely
+  // - Running every startup also self-heals if the manifest is deleted
+  // - The PathExists check makes this cheap (~0.1ms) when file already exists
+  {
+    base::FilePath native_messaging_dir;
+    if (base::PathService::Get(chrome::DIR_USER_NATIVE_MESSAGING,
+                               &native_messaging_dir)) {
+      // Ensure directory exists for users who installed before first-run
+      // directory creation was added.
+      if (!base::PathExists(native_messaging_dir))
+        base::CreateDirectory(native_messaging_dir);
+
+      const base::FilePath manifest_path =
+          native_messaging_dir.Append("com.apple.passwordmanager.json");
+      if (!base::PathExists(manifest_path)) {
+        constexpr std::string_view kICloudPasswordsManifest = R"({
+    "name": "com.apple.passwordmanager",
+    "description": "PasswordManagerBrowserExtensionHelper",
+    "path": "/System/Cryptexes/App/System/Library/CoreServices/PasswordManagerBrowserExtensionHelper.app/Contents/MacOS/PasswordManagerBrowserExtensionHelper",
+    "type": "stdio",
+    "allowed_origins": [
+        "chrome-extension://pejdijmoenmkgeppbflobdenhhabjlaj/",
+        "chrome-extension://mfbcdcnpokpoajjciilocoachedjkima/"
+    ]
+})";
+        base::WriteFile(manifest_path, kICloudPasswordsManifest);
+      }
+    }
+  }
+#endif  // BUILDFLAG(IS_MAC)
+
 #if BUILDFLAG(IS_MAC)
 #if defined(ARCH_CPU_X86_64)
   // The use of Rosetta to run the x64 version of Chromium on Arm is neither
@@ -1963,6 +2014,12 @@ int ChromeBrowserMainParts::PreMainMessageLoopRunImpl() {
     g_browser_process->CreateDevToolsAutoOpener();
   }
 
+  // BrowserOS: Start AFTER CreateDevToolsProtocolHandler so that BrowserOS's
+  // CDP handler replaces Chromium's (StartRemoteDebuggingServer is a global
+  // singleton — the last caller wins).
+  LOG(INFO) << "browseros: Starting BrowserOS server process";
+  browseros::BrowserOSServerManager::GetInstance()->Start();
+
   // Needs to be done before PostProfileInit, since the SODA Installer setup is
   // called inside PostProfileInit and depends on it.
   if (!base::CommandLine::ForCurrentProcess()->HasSwitch(
@@ -2267,6 +2324,10 @@ void ChromeBrowserMainParts::PostMainMessageLoopRun() {
     chrome_extra_part->PostMainMessageLoopRun();
   }
 
+  // BrowserOS: Stop the BrowserOS server during shutdown
+  LOG(INFO) << "browseros: Stopping BrowserOS server process";
+  browseros::BrowserOSServerManager::GetInstance()->Shutdown();
+
   TranslateService::Shutdown();
 
 #if BUILDFLAG(ENABLE_PROCESS_SINGLETON)
