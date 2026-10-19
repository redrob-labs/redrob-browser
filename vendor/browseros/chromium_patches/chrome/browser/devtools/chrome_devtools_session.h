diff --git a/chrome/browser/devtools/chrome_devtools_session.h b/chrome/browser/devtools/chrome_devtools_session.h
index f703912a1b785..33d55e8ac7bed 100644
--- a/chrome/browser/devtools/chrome_devtools_session.h
+++ b/chrome/browser/devtools/chrome_devtools_session.h
@@ -16,11 +16,13 @@ class DevToolsAgentHostClientChannel;
 
 class AdsHandler;
 class AutofillHandler;
+class BookmarksHandler;
 class EmulationHandler;
 class BrowserHandler;
 class CastHandler;
 class ExtensionsHandler;
 class PageHandler;
+class HistoryHandler;
 class PWAHandler;
 class SecurityHandler;
 class StorageHandler;
@@ -44,10 +46,12 @@ class ChromeDevToolsSession : public ChromeDevToolsSessionBase {
  private:
   std::unique_ptr<AdsHandler> ads_handler_;
   std::unique_ptr<AutofillHandler> autofill_handler_;
+  std::unique_ptr<BookmarksHandler> bookmarks_handler_;
   std::unique_ptr<ExtensionsHandler> extensions_handler_;
   std::unique_ptr<BrowserHandler> browser_handler_;
   std::unique_ptr<CastHandler> cast_handler_;
   std::unique_ptr<EmulationHandler> emulation_handler_;
+  std::unique_ptr<HistoryHandler> history_handler_;
   std::unique_ptr<PageHandler> page_handler_;
   std::unique_ptr<PWAHandler> pwa_handler_;
   std::unique_ptr<SecurityHandler> security_handler_;
