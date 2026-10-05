diff --git a/chrome/browser/ui/tabs/tab_strip_prefs.cc b/chrome/browser/ui/tabs/tab_strip_prefs.cc
--- a/chrome/browser/ui/tabs/tab_strip_prefs.cc
+++ b/chrome/browser/ui/tabs/tab_strip_prefs.cc
@@ -24,7 +24,8 @@ void RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry) {
   registry->RegisterBooleanPref(prefs::kOrganizerPanelPinnedToTabstrip, true);
   registry->RegisterBooleanPref(prefs::kEverythingMenuPinnedToTabstrip, true);
   registry->RegisterBooleanPref(prefs::kTabScrollButtonsPinnedToTabstrip, true);
-  registry->RegisterBooleanPref(prefs::kVerticalTabsEnabled, false);
+  // Redrob: the sidebar is the shell, not an option, so a new profile starts with it.
+  registry->RegisterBooleanPref(prefs::kVerticalTabsEnabled, true);
   registry->RegisterBooleanPref(
       prefs::kVerticalTabsExpandOnHoverEnabled,
       tabs::kVerticalTabsExpandOnHoverDefaultEnabled.Get());
