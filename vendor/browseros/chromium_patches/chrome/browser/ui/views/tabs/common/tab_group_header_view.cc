diff --git a/chrome/browser/ui/views/tabs/common/tab_group_header_view.cc b/chrome/browser/ui/views/tabs/common/tab_group_header_view.cc
--- a/chrome/browser/ui/views/tabs/common/tab_group_header_view.cc
+++ b/chrome/browser/ui/views/tabs/common/tab_group_header_view.cc
@@ -154,6 +154,22 @@ TabGroupHeaderView::TabGroupHeaderView(
       delegate_(delegate),
       orientation_(orientation),
       editor_bubble_tracker_(state_controller) {
+  // Redrob: two children the reference's row has and upstream's does not. Added here rather than in the
+  // initializer list because their POSITION matters -- the mark leads the label and the count trails it -- and
+  // the list fixes the order of every other child.
+  if (orientation == TabStripOrientation::kVertical) {
+    leading_mark_ = AddChildViewAt(std::make_unique<views::ImageView>(), 0);
+    tab_count_label_ = AddChildViewAt(std::make_unique<views::Label>(),
+                                      GetIndexOf(collapse_icon_).value());
+    tab_count_label_->SetHorizontalAlignment(gfx::ALIGN_RIGHT);
+    tab_count_label_->SetProperty(
+        views::kMarginsKey,
+        gfx::Insets::TLBR(0, 0, 0, kVerticalCountTrailingMargin));
+    leading_mark_->SetProperty(
+        views::kMarginsKey,
+        gfx::Insets::TLBR(0, 0, 0, kVerticalMarkLabelGap));
+  }
+
   SetProperty(views::kElementIdentifierKey, kTabGroupHeaderElementId);
   attention_indicator_->SetProperty(views::kElementIdentifierKey,
                                     kTabGroupHeaderAttentionIndicatorElementId);
@@ -171,7 +187,11 @@ TabGroupHeaderView::TabGroupHeaderView(
           &TabGroupHeaderView::OnBubbleClosed, base::Unretained(this)));
 
   SetCrossAxisAlignment(views::LayoutAlignment::kCenter);
-  SetInteriorMargin(gfx::Insets::VH(0, GetHorizontalInset()));
+  SetInteriorMargin(
+      orientation == TabStripOrientation::kVertical
+          ? gfx::Insets::TLBR(0, kVerticalLeadingInset, 0,
+                              GetHorizontalInset())
+          : gfx::Insets::VH(0, GetHorizontalInset()));
   SetDefault(views::kFlexBehaviorKey,
              views::FlexSpecification(
                  views::MinimumFlexSizeRule::kScaleToMinimumSnapToZero,
@@ -558,6 +578,16 @@ void TabGroupHeaderView::OnDataChanged(
       UpdateEditorBubbleButtonVisibility();
     }
 
+    // Update the leading mark and the count.
+    if (leading_mark_) {
+      leading_mark_->SetImage(ui::ImageModel::FromVectorIcon(
+          views::kTabIcon, foreground_color, kVerticalLeadingMarkSize));
+    }
+    if (tab_count_label_) {
+      tab_count_label_->SetEnabledColor(foreground_color);
+      UpdateTabCountLabel();
+    }
+
     // Update collapse icon.
     if (collapse_icon_) {
       collapse_icon_->SetVisible(!delegate_->IsGroupFocused());
@@ -569,12 +599,30 @@ void TabGroupHeaderView::OnDataChanged(
           : features::IsRoundedIconsEnabled()
               ? vector_icons::kKeyboardArrowUpIcon
               : kKeyboardArrowUpChromeRefreshOldIcon,
-          foreground_color, kIconSize));
+          foreground_color, kCollapseIconSize));
     }
 
     // Update background.
-    SetBackground(views::CreateRoundedRectBackground(background_color,
-                                                     GetCornerRadius()));
+    //
+    // Redrob: no fill in the vertical strip. The group's colour is painted as a filled rounded rect behind the
+    // whole row, which in a horizontal tab strip is how a group reads as a group -- but in a sidebar the row
+    // sits in a column of unfilled rows next to a selected tab that IS a filled rounded rect, so the header
+    // ends up competing with the selection for the same visual meaning. The reference draws this row with no
+    // fill at all, as a section label rather than a selected thing, and side by side that is the single most
+    // visible difference in the column.
+    //
+    // The group's colour does not disappear -- it stays on the group's own tabs and in the editor bubble.
+    if (orientation_ == TabStripOrientation::kVertical) {
+      // The sidebar's own surface colour, NOT nullptr. Dropping the background entirely paints the row BLACK:
+      // measured 4572 of 4572 pixels at #000000, because nothing behind this view fills that area -- the
+      // sidebar's tint reaches it through this view, not under it. Painting kSurface is what "no fill" has to
+      // mean here, and since the column's wash is a flat #e9fbff the result is a row with no fill of its own.
+      SetBackground(views::CreateSolidBackground(
+          redrob::sidebar_tokens::kSurface));
+    } else {
+      SetBackground(views::CreateRoundedRectBackground(
+          background_color, GetCornerRadius()));
+    }
     UpdateAttentionState(
         data_sharing::features::IsDataSharingFunctionalityEnabled() &&
         tab_group_data.needs_attention);
@@ -676,6 +724,16 @@ void TabGroupHeaderView::UpdateAccessibleName() {
 
 SkColor TabGroupHeaderView::GetForegroundColor() const {
   if (GetColorProvider()) {
+    // Redrob: in the vertical strip the label sits on the sidebar, so its colour comes from the sidebar's own
+    // role rather than from max contrast against the group fill. Deriving it from a background that is no
+    // longer painted is how you get near-white text on a pale wash -- the same mistake as redefining --muted
+    // in the WebUI tokens, and this is the C++ side of it.
+    //
+    // kMutedForeground rather than kRowForeground: this row names a section, and the reference's own measured
+    // #737373 is the muted role, not the row role.
+    if (orientation_ == TabStripOrientation::kVertical) {
+      return GetColorProvider()->GetColor(redrob::sidebar_tokens::kMutedForeground);
+    }
     SkColor background_color = GetColorProvider()->GetColor(
         GetTabGroupTabStripColorId(tab_group_visual_data_.color(),
                                    GetWidget()->ShouldPaintAsActive()));
