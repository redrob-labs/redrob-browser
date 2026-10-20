diff --git a/chrome/browser/safe_browsing/incident_reporting/binary_integrity_analyzer_win.cc b/chrome/browser/safe_browsing/incident_reporting/binary_integrity_analyzer_win.cc
index ae9775564c91a..08ec73f96ef31 100644
--- a/chrome/browser/safe_browsing/incident_reporting/binary_integrity_analyzer_win.cc
+++ b/chrome/browser/safe_browsing/incident_reporting/binary_integrity_analyzer_win.cc
@@ -24,7 +24,7 @@ namespace safe_browsing {
 
 std::vector<base::FilePath> GetCriticalBinariesPath() {
   static constexpr auto kUnversionedFiles = std::to_array({
-      FILE_PATH_LITERAL("chrome.exe"),
+      FILE_PATH_LITERAL("redrob-browser.exe"),
   });
   static constexpr auto kVersionedFiles = std::to_array({
       FILE_PATH_LITERAL("chrome.dll"),
