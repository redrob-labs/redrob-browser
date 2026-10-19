diff --git a/chrome/browser/ui/webui/new_tab_footer/new_tab_footer_ui.cc b/chrome/browser/ui/webui/new_tab_footer/new_tab_footer_ui.cc
index 1a02866825517..2396b8ccd2e31 100644
--- a/chrome/browser/ui/webui/new_tab_footer/new_tab_footer_ui.cc
+++ b/chrome/browser/ui/webui/new_tab_footer/new_tab_footer_ui.cc
@@ -83,7 +83,7 @@ NewTabFooterUI::~NewTabFooterUI() = default;
 
 // static
 void NewTabFooterUI::RegisterProfilePrefs(PrefRegistrySimple* registry) {
-  registry->RegisterBooleanPref(prefs::kNtpFooterVisible, true);
+  registry->RegisterBooleanPref(prefs::kNtpFooterVisible, false);
 }
 
 void NewTabFooterUI::BindInterface(
