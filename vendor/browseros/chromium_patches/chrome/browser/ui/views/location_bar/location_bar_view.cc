diff --git a/chrome/browser/ui/views/location_bar/location_bar_view.cc b/chrome/browser/ui/views/location_bar/location_bar_view.cc
--- a/chrome/browser/ui/views/location_bar/location_bar_view.cc
+++ b/chrome/browser/ui/views/location_bar/location_bar_view.cc
@@ -68,6 +68,7 @@
 #include "chrome/browser/ui/views/location_bar/location_icon_view.h"
 #include "chrome/browser/ui/views/location_bar/omnibox_popup_file_selector.h"
 #include "chrome/browser/ui/views/location_bar/selected_keyword_view.h"
+#include "chrome/browser/ui/views/location_bar/redrob_agent_chip.h"
 #include "chrome/browser/ui/views/omnibox/omnibox_context_menu.h"
 #include "chrome/browser/ui/views/omnibox/omnibox_popup_aim_presenter.h"
 #include "chrome/browser/ui/views/omnibox/omnibox_popup_closer.h"
@@ -239,6 +240,11 @@ LocationBarView::LocationBarView(BrowserWindowInterface* browser,
                  !v->GetOmniboxController()->IsPopupOpen();
         }));
     views::FocusRing::Get(this)->SetOutsetFocusRingDisabled(true);
+    // Redrob: and then never satisfied. With a flat address row the ring would be the ONLY thing drawing
+    // a box there, at 2px in the accent colour -- louder than anything else on the new tab. A text field
+    // announces its own focus with a caret, which is what the reference relies on.
+    views::FocusRing::Get(this)->SetHasFocusPredicate(
+        base::BindRepeating([](const View* view) { return false; }));
     views::InstallPillHighlightPathGenerator(this);
 
 #if BUILDFLAG(OS_LEVEL_GEOLOCATION_PERMISSION_SUPPORTED)
@@ -455,6 +461,8 @@ void LocationBarView::Init() {
 
   selected_keyword_view_ = AddChildView(std::make_unique<SelectedKeywordView>(
       this, profile_, omnibox_controller_.get(), font_list));
+  // Redrob: the agent-mode chip (CAP-3), shown by Layout while the line starts with "> ".
+  RedrobAgentChip::Install(this);
 
   SkColor icon_color = color_provider->GetColor(kColorOmniboxResultsIcon);
 
@@ -853,7 +861,20 @@ void LocationBarView::Layout(PassKey) {
     }
   }
 
-  if (ShouldShowKeywordBubble()) {
+  // Redrob: the agent-mode chip (CAP-3).
+  RedrobAgentChip* redrob_agent_chip = RedrobAgentChip::FindIn(this);
+  const bool show_redrob_agent_chip =
+      redrob_agent_chip && omnibox_view_ && !ShouldShowKeywordBubble() &&
+      RedrobAgentChip::IsAgentMode(omnibox_view_->GetText());
+  if (redrob_agent_chip) {
+    redrob_agent_chip->SetVisible(show_redrob_agent_chip);
+  }
+  if (show_redrob_agent_chip) {
+    location_icon_view_->SetVisible(false);
+    leading_decorations.AddDecoration(
+        vertical_padding, location_height, false, kLeadingDecorationMaxFraction,
+        /*intra_item_padding=*/0, icon_left, redrob_agent_chip);
+  } else if (ShouldShowKeywordBubble()) {
     location_icon_view_->SetVisible(false);
     leading_decorations.AddDecoration(
         vertical_padding, location_height, false, kLeadingDecorationMaxFraction,
@@ -1420,11 +1441,36 @@ void LocationBarView::RefreshBackground() {
   if (is_popup_mode_) {
     SetBackground(views::CreateSolidBackground(background_color_));
   } else {
-    SetBackground(CreateRoundRectBackground(
-        background_color_, border_color, size(),
-        /*blend_mode=*/SkBlendMode::kSrcOver,
-        /*antialias=*/true, /*should_border_scale=*/true));
-  }
+    // Redrob: the address row is FLAT. No fill, no border, no focused fill -- the row is the top edge of
+    // the content area, and a filled pill there puts a second card above the page. Chromium's logic above
+    // picks between three fills and two border colours; "paint nothing" is not a fourth case to thread
+    // through it, so the choice is made here instead. `background_color_` still has to be a real colour:
+    // the omnibox is a views::Textfield and needs an opaque background behind it to get subpixel AA, and
+    // several child views ask this class what colour they are sitting on.
+    background_color_ = color_provider->GetColor(kColorToolbar);
+    SetBackground(nullptr);
+  }
+
+  // Redrob: the same reason the Textfield below needs `background_color_`, applied to this class's own
+  // LABELS -- which the flat row above left with nothing opaque beneath them.
+  //
+  // This view paints to a layer that does not fill its bounds opaquely (see the constructor), and Views
+  // requires subpixel-antialiased text to sit on an opaque background or an opaque layer: sampling the
+  // r,g,b channels of a transparent pixel gives the wrong answer, which shows up as colour fringing on
+  // the glyphs. While this class drew a rounded-rect fill, every child label inherited that opacity for
+  // free. Making the row flat removed it, and the labels were missed -- upstream backgrounds only its IME
+  // autocompletion labels, because it never has to consider a location bar with no fill at all.
+  //
+  // Found by a DCHECK in Label::PaintText aborting a dev build on a chrome:// navigation: the additional
+  // text renders the "title - url" form, and a paint landing while the title half is still empty is what
+  // made it intermittent. In a release build the check is compiled out and the fringing ships instead.
+  const auto label_background = [&](views::Label* label) {
+    if (label) {
+      label->SetBackground(views::CreateSolidBackground(background_color_));
+    }
+  };
+  label_background(omnibox_additional_text_view_);
+  label_background(ai_mode_hint_label_);
 
   // Keep the views::Textfield in sync. It needs an opaque background to
   // correctly enable subpixel AA.
