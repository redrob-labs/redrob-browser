diff --git a/chrome/browser/ui/pdf/infobar/pdf_infobar_delegate.h b/chrome/browser/ui/pdf/infobar/pdf_infobar_delegate.h
index 74ad771f860a0..5d5c39ccae287 100644
--- a/chrome/browser/ui/pdf/infobar/pdf_infobar_delegate.h
+++ b/chrome/browser/ui/pdf/infobar/pdf_infobar_delegate.h
@@ -28,7 +28,7 @@ class PdfInfoBarDelegate : public ConfirmInfoBarDelegate {
 
   // InfoBarDelegate:
   infobars::InfoBarDelegate::InfoBarIdentifier GetIdentifier() const override;
-  const gfx::VectorIcon& GetVectorIcon() const override;
+  int GetIconId() const override;
 
   // ConfirmInfoBarDelegate:
   std::u16string GetMessageText() const override;
