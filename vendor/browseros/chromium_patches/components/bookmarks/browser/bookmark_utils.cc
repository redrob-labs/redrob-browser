diff --git a/components/bookmarks/browser/bookmark_utils.cc b/components/bookmarks/browser/bookmark_utils.cc
index d8f32a1ca60e4..1c38ac4db7d37 100644
--- a/components/bookmarks/browser/bookmark_utils.cc
+++ b/components/bookmarks/browser/bookmark_utils.cc
@@ -451,7 +451,7 @@ bool DoesBookmarkContainWords(const std::u16string& title,
 
 void RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry) {
   registry->RegisterBooleanPref(
-      prefs::kShowBookmarkBar, false,
+      prefs::kShowBookmarkBar, true,
       user_prefs::PrefRegistrySyncable::SYNCABLE_PREF);
   // `BookmarkBarVisibilityState::kOnlyShowOnNtp` is equivalent to
   // `kShowBookmarkBar` set to false.
