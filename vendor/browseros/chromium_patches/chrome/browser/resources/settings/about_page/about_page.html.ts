diff --git a/chrome/browser/resources/settings/about_page/about_page.html.ts b/chrome/browser/resources/settings/about_page/about_page.html.ts
--- a/chrome/browser/resources/settings/about_page/about_page.html.ts
+++ b/chrome/browser/resources/settings/about_page/about_page.html.ts
@@ -13,7 +13,7 @@ export function getHtml(this: SettingsAboutPageElement) {
   return html`<!--_html_template_start_-->
 <settings-section page-title="$i18n{aboutPageTitle}">
   <div class="cr-row two-line first">
-    <img id="productLogo" @click="${this.onProductLogoClick_}"
+    <img id="productLogo"
         srcset="chrome://theme/current-channel-logo@1x 1x,
                 chrome://theme/current-channel-logo@2x 2x"
         alt="$i18n{aboutProductLogoAlt}"
@@ -40,11 +40,6 @@ export function getHtml(this: SettingsAboutPageElement) {
         <div role="alert" aria-live="polite"
             .innerHTML="${this.getUpdateStatusMessage_()}">
         </div>
-        <a ?hidden="${!this.shouldShowLearnMoreLink_()}" target="_blank"
-            href="https://support.google.com/chrome?p=update_error"
-            aria-label="$i18nPolymer{aboutLearnMoreUpdatingErrors}">
-          $i18n{learnMore}
-        </a>
       </div>
       <span id="deprecationWarning"
           ?hidden="${!this.obsoleteSystemInfo_.obsolete}">
@@ -75,12 +70,6 @@ export function getHtml(this: SettingsAboutPageElement) {
         @click="${this.onPromoteUpdaterClick_}">
       <div class="flex">
         ${this.promoteUpdaterStatus_.text}
-        <a href="https://support.google.com/chrome/answer/95414"
-            target="_blank" id="updaterLearnMore"
-            @click="${this.onLearnMoreClick_}"
-            aria-label="$i18nPolymer{aboutLearnMoreUpdating}">
-          $i18n{learnMore}
-        </a>
       </div>
       <cr-icon-button class="subpage-arrow"
           ?hidden="${!this.promoteUpdaterStatus_.actionable}"
@@ -108,7 +97,6 @@ export function getHtml(this: SettingsAboutPageElement) {
 <settings-section>
   <div class="info-sections">
     <div class="info-section">
-      <div class="secondary">$i18n{aboutProductTitle}</div>
       <div class="secondary">$i18n{aboutProductCopyright}</div>
     </div>
 
