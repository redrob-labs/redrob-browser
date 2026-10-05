diff --git a/chrome/browser/ui/views/profiles/avatar_toolbar_button_state_manager.cc b/chrome/browser/ui/views/profiles/avatar_toolbar_button_state_manager.cc
--- a/chrome/browser/ui/views/profiles/avatar_toolbar_button_state_manager.cc
+++ b/chrome/browser/ui/views/profiles/avatar_toolbar_button_state_manager.cc
@@ -33,6 +33,9 @@
 #include "chrome/browser/profiles/profile_attributes_entry.h"
 #include "chrome/browser/profiles/profile_attributes_storage.h"
 #include "chrome/browser/profiles/profile_avatar_icon_util.h"
+#include "components/vector_icons/vector_icons.h"
+#include "ui/gfx/paint_vector_icon.h"
+#include "chrome/browser/ui/views/tabs/vertical/redrob_sidebar_tokens.h"
 #include "chrome/browser/profiles/profile_keyed_service_factory.h"
 #include "chrome/browser/profiles/profile_manager.h"
 #include "chrome/browser/profiles/profiles_state.h"
@@ -194,11 +197,34 @@ std::pair<gfx::Image, AvatarIconType> GetProfileAvatarImage(
   // At this point, no GAIA picture or account image overrides the avatar,
   // so the icon type is determined by
   // ProfileAttributesEntry::GetAvatarIconWithType().
-  return entry->GetAvatarIconWithType(
-      preferred_size, /*use_high_res_file=*/true,
-      GetPlaceholderAvatarIconParamsDependingOnTheme(
-          ThemeServiceFactory::GetForProfile(&profile),
-          /*background_color_id=*/kColorToolbar, color_provider));
+  // Redrob: a neutral silhouette instead of the profile-coloured placeholder.
+  //
+  // The placeholder's colours come from GetProfileThemeColors -- default_avatar_fill_color and
+  // default_avatar_stroke_color -- and GetCurrentProfileThemeColors derives those from
+  // ui::kColorFrameActive, which this product repurposed as the SIDEBAR'S TINT. So the avatar was coloured to
+  // describe our pale-cyan wash rather than a profile identity, and it came out a saturated #00bfe9 ring: the
+  // only saturated pixel anywhere in a column where every other glyph is neutral grey. Passing different
+  // PlaceholderAvatarIconParams does NOT fix it -- that struct carries padding, background and visibility, and
+  // no colour at all, which is why the first attempt at this changed nothing measurable.
+  //
+  // Only the PLACEHOLDER branch is replaced. A signed-in user with a GAIA picture returned above, as
+  // kNonPlaceholder, so a real account photo is untouched; this is the no-picture case, which is precisely
+  // where a generic silhouette is the honest thing to draw. And the icon takes the colour it is PASSED, which
+  // is kColorToolbarButtonIcon -- the same role as every other glyph in the column.
+  //
+  // Scoped to the avatar button rather than to profile_colors_util, which the app menu also uses. This
+  // product builds exactly one avatar, in the sidebar's foot, because it has no toolbar avatar and no app menu.
+  // Rasterised here rather than returned as an ImageModel because this function's contract is a gfx::Image.
+  //
+  // The SIDEBAR's muted role, not kColorToolbarButtonIcon. The toolbar role is the defensible choice for a
+  // toolbar button and was the first thing tried, but it measured #576071 against the Settings gear's #7c8390
+  // directly beneath it -- two neutral greys forty units apart, side by side, which reads as one of them being
+  // a mistake. This avatar is not in a toolbar; it is the top half of a two-row foot, and it has to match the
+  // row under it.
+  return {gfx::Image(gfx::CreateVectorIcon(
+              vector_icons::kAccountCircleIcon, preferred_size,
+              color_provider.GetColor(redrob::sidebar_tokens::kMutedForeground))),
+          AvatarIconType::kPlaceholder};
 }
 
 ui::ImageModel GetAvatarImageWithDottedRing(
