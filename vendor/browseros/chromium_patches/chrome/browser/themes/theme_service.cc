diff --git a/chrome/browser/themes/theme_service.cc b/chrome/browser/themes/theme_service.cc
index 0589bacba844a..14bc76e5475f0 100644
--- a/chrome/browser/themes/theme_service.cc
+++ b/chrome/browser/themes/theme_service.cc
@@ -30,6 +30,7 @@
 #include "base/task/thread_pool.h"
 #include "base/trace_event/trace_event.h"
 #include "build/build_config.h"
+#include "chrome/browser/browseros/core/browseros_prefs.h"
 #include "chrome/browser/extensions/extension_service.h"
 #include "chrome/browser/extensions/theme_installed_infobar_delegate.h"
 #include "chrome/browser/new_tab_page/chrome_colors/chrome_colors_util.h"
@@ -265,6 +266,7 @@ ThemeService::~ThemeService() = default;
 void ThemeService::Init() {
   theme_helper_->DCheckCalledOnValidSequence();
 
+  browseros::SyncDefaultTheme(profile_->GetPrefs());
   InitFromPrefs();
 
   // ThemeObserver should be constructed before calling
