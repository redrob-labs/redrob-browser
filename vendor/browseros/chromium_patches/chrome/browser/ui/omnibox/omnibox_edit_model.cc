diff --git a/chrome/browser/ui/omnibox/omnibox_edit_model.cc b/chrome/browser/ui/omnibox/omnibox_edit_model.cc
--- a/chrome/browser/ui/omnibox/omnibox_edit_model.cc
+++ b/chrome/browser/ui/omnibox/omnibox_edit_model.cc
@@ -82,6 +82,7 @@
 #include "components/omnibox/browser/omnibox_popup_selection.h"
 #include "components/omnibox/browser/omnibox_prefs.h"
 #include "components/omnibox/browser/omnibox_text_util.h"
+#include "components/omnibox/browser/redrob_agent_provider.h"
 #include "components/omnibox/browser/omnibox_triggered_feature_service.h"
 #include "components/omnibox/browser/page_classification_functions.h"
 #include "components/omnibox/browser/search_provider.h"
@@ -1443,6 +1444,24 @@ void OmniboxEditModel::OnUpOrDownPressed(bool down, bool page) {
 }
 
 void OmniboxEditModel::OnTabPressed(bool shift) {
+  // Redrob: Tab on the agent row enters agent mode. See
+  // rewrite/chrome/browser/ui/omnibox/omnibox_edit_model.cc.yaml.
+  if (!shift && view_ && !is_keyword_selected() &&
+      !RedrobAgentProvider::IsAgentModeText(user_text_)) {
+    const OmniboxPopupSelection selection = GetPopupSelection();
+    const AutocompleteResult& result = autocomplete_controller()->result();
+    if (selection.state == OmniboxPopupSelection::NORMAL &&
+        selection.line < result.size()) {
+      const AutocompleteMatch& match = result.match_at(selection.line);
+      if (match.provider &&
+          match.provider->type() == AutocompleteProvider::TYPE_REDROB_AGENT) {
+        view_->SetUserText(RedrobAgentProvider::ToAgentModeText(user_text_),
+                           /*update_popup=*/true);
+        return;
+      }
+    }
+  }
+
   const OmniboxPopupSelection::Direction direction =
       shift ? OmniboxPopupSelection::Direction::kBackward
             : OmniboxPopupSelection::Direction::kForward;
