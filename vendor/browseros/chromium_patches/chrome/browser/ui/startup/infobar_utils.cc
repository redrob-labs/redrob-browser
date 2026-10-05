diff --git a/chrome/browser/ui/startup/infobar_utils.cc b/chrome/browser/ui/startup/infobar_utils.cc
--- a/chrome/browser/ui/startup/infobar_utils.cc
+++ b/chrome/browser/ui/startup/infobar_utils.cc
@@ -217,10 +217,31 @@ void AddInfoBarsIfNecessary(BrowserWindowInterface* browser,
   const bool should_display_bubble =
       !is_web_app && HasPendingUncleanExit(browser->GetProfile());
   base::UmaHistogramBoolean("Startup.CrashBubbleShown", should_display_bubble);
+  // Redrob: the histogram stays -- we still want to know a profile started after an unclean exit -- but
+  // the bubble itself is not shown, because in this fork it does not merely fail to appear: it takes the
+  // browser down before any window does.
+  //
+  // SessionCrashedBubbleView anchors to the app menu button. Our toolbar keeps that button built (menu
+  // accelerators reach for it without a null check) but permanently invisible, so
+  // AppMenuButton::GetAnchor() takes upstream's fallback branch -- the one upstream only reaches in
+  // content-fullscreen -- and CHECKs on an element that is not registered yet. Measured, not assumed: at
+  // this point in startup NONE of BrowserView's elements exist, not the fallback anchor and not
+  // kBrowserViewElementId, because a ViewSubregionAnchor registers when its view is drawn and the window
+  // has not been shown. The element context is correct and non-empty; the elements simply are not there.
+  //
+  // The consequence was severe out of all proportion to the feature: a profile keeps
+  // profile.exit_type=Crashed until it exits cleanly, so ONE unclean exit made every later launch die
+  // the same way, and the profile was permanently unusable.
+  //
+  // Suppressing rather than repairing is the right trade here. Repair means changing when startup
+  // registers view elements, whose blast radius covers every bubble anchored that way, to restore a
+  // surface this fork never integrated -- the sidebar owns tabs, and there is no session-restore story
+  // for this bubble to belong to. It is the same call already made for the sign-in promo's effects
+  // control and the feature-showcase carousel: upstream furniture that composes into our window without
+  // being part of the product. If a restore-after-crash affordance is wanted later, it should be built
+  // on our own surface, where it can be anchored to something that exists.
   if (should_display_bubble) {
-    SessionCrashedBubble::ShowIfNotOffTheRecordProfile(
-        browser,
-        /*skip_tab_checking=*/false);
+    VLOG(1) << "redrob: skipping the upstream session-crashed bubble";
   }
 
   // These info bars are not shown when the browser is being controlled by
@@ -253,20 +274,6 @@ void AddInfoBarsIfNecessary(BrowserWindowInterface* browser,
   infobars::ContentInfoBarManager* infobar_manager =
       infobars::ContentInfoBarManager::FromWebContents(web_contents);
 
-  if (!google_apis::HasAPIKeyConfigured()) {
-    if (infobars::IsInfoBarMigrated(
-            infobars::InfoBarDelegate::GOOGLE_API_KEYS_INFOBAR_DELEGATE)) {
-      if (auto* manager =
-              infobars::BrowserInfoBarManager::From(g_browser_process)) {
-        manager->Show(
-            tabs::TabInterface::GetFromContents(web_contents),
-            infobars::InfoBarDelegate::GOOGLE_API_KEYS_INFOBAR_DELEGATE);
-      }
-    } else {
-      GoogleApiKeysInfoBarDelegate::Create(infobar_manager);
-    }
-  }
-
   if (ObsoleteSystem::IsObsoleteNowOrSoon()) {
     PrefService* local_state = g_browser_process->local_state();
     if (!local_state ||
