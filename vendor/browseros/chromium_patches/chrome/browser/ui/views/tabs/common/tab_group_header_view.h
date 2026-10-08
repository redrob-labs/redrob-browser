diff --git a/chrome/browser/ui/views/tabs/common/tab_group_header_view.h b/chrome/browser/ui/views/tabs/common/tab_group_header_view.h
--- a/chrome/browser/ui/views/tabs/common/tab_group_header_view.h
+++ b/chrome/browser/ui/views/tabs/common/tab_group_header_view.h
@@ -115,10 +115,17 @@ class TabGroupHeaderView : public views::FlexLayoutView,
 
   void OnDataChanged(const tabs::TabGroupData& tab_group_data);
 
+  // Redrob: the vertical row's tab count. Called from Layout as well as OnDataChanged, because the group's
+  // data observer does not fire on a tab count change.
+  void UpdateTabCountLabel();
+  void Layout(PassKey key) override;
+
   tab_groups::TabGroupId group() const;
 
   views::LabelButton* editor_bubble_button() { return editor_bubble_button_; }
   views::ImageView* collapse_icon_for_testing() { return collapse_icon_; }
+  views::ImageView* leading_mark_for_testing() { return leading_mark_; }
+  views::Label* tab_count_label_for_testing() { return tab_count_label_; }
   views::ImageView* attention_indicator_for_testing() {
     return attention_indicator_;
   }
@@ -159,6 +166,9 @@ class TabGroupHeaderView : public views::FlexLayoutView,
   const raw_ptr<views::LabelButton> editor_bubble_button_ = nullptr;
 
   const raw_ptr<views::ImageView> collapse_icon_ = nullptr;
+  // Redrob: vertical-only, null in the horizontal strip.
+  raw_ptr<views::ImageView> leading_mark_ = nullptr;
+  raw_ptr<views::Label> tab_count_label_ = nullptr;
   const raw_ref<Delegate> delegate_;
   const TabStripOrientation orientation_;
 
