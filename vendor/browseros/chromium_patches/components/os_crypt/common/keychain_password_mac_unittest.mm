diff --git a/components/os_crypt/common/keychain_password_mac_unittest.mm b/components/os_crypt/common/keychain_password_mac_unittest.mm
--- a/components/os_crypt/common/keychain_password_mac_unittest.mm
+++ b/components/os_crypt/common/keychain_password_mac_unittest.mm
@@ -5,6 +5,8 @@
 #include "components/os_crypt/common/keychain_password_mac.h"
 
 #include "build/build_config.h"
+#include "build/branding_buildflags.h"
+#include "components/os_crypt/common/browseros_product_buildflags.h"
 #include "crypto/apple/fake_keychain_v2.h"
 #include "crypto/apple/scoped_fake_keychain_v2.h"
 #include "testing/gtest/include/gtest/gtest.h"
@@ -96,4 +98,17 @@ TEST(KeychainPasswordTest, PasswordsDiffer) {
   EXPECT_NE(password1, password2);
 }
 
+TEST(KeychainPasswordTest, DefaultKeychainNamesMatchBuildProduct) {
+#if BUILDFLAG(GOOGLE_CHROME_BRANDING)
+  EXPECT_EQ("Chrome Safe Storage", KeychainPassword::GetServiceName());
+  EXPECT_EQ("Chrome", KeychainPassword::GetAccountName());
+#elif BUILDFLAG(BROWSEROS_PRODUCT_BROWSERCLAW)
+  EXPECT_EQ("BrowserClaw Safe Storage", KeychainPassword::GetServiceName());
+  EXPECT_EQ("BrowserClaw", KeychainPassword::GetAccountName());
+#else
+  EXPECT_EQ("Redrob Safe Storage", KeychainPassword::GetServiceName());
+  EXPECT_EQ("Redrob", KeychainPassword::GetAccountName());
+#endif
+}
+
 }  // namespace
