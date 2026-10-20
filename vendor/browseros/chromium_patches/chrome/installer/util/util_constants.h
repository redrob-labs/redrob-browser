diff --git a/chrome/installer/util/util_constants.h b/chrome/installer/util/util_constants.h
index e9c61e09475af..f99e03652af30 100644
--- a/chrome/installer/util/util_constants.h
+++ b/chrome/installer/util/util_constants.h
@@ -338,6 +338,9 @@ inline constexpr char kSelfDestruct[] = "self-destruct";
 // Show the embedded EULA dialog.
 inline constexpr char kShowEula[] = "show-eula";
 
+// Suppress the interactive install UI and first-install browser launch.
+inline constexpr char kSilent[] = "silent";
+
 // Saves the specified device management token to the registry.
 inline constexpr char kStoreDMToken[] = "store-dmtoken";
 
@@ -379,9 +382,10 @@ inline constexpr char kGoogleUpdateIsMachineEnvVar[] = "GoogleUpdateIsMachine";
 // Active Setup.
 inline constexpr wchar_t kActiveSetupExe[] = L"chrmstp.exe";
 inline constexpr wchar_t kChromeDll[] = L"chrome.dll";
-inline constexpr wchar_t kChromeExe[] = L"chrome.exe";
-inline constexpr wchar_t kChromeNewExe[] = L"new_chrome.exe";
-inline constexpr wchar_t kChromeOldExe[] = L"old_chrome.exe";
+// Redrob: the browser executable is redrob-browser.exe; new_/old_ are its update twins.
+inline constexpr wchar_t kChromeExe[] = L"redrob-browser.exe";
+inline constexpr wchar_t kChromeNewExe[] = L"new_redrob-browser.exe";
+inline constexpr wchar_t kChromeOldExe[] = L"old_redrob-browser.exe";
 inline constexpr wchar_t kChromeProxyExe[] = L"chrome_proxy.exe";
 inline constexpr wchar_t kChromeProxyNewExe[] = L"new_chrome_proxy.exe";
 inline constexpr wchar_t kChromeProxyOldExe[] = L"old_chrome_proxy.exe";
