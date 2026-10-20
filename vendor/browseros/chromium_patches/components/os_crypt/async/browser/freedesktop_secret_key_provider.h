diff --git a/components/os_crypt/async/browser/freedesktop_secret_key_provider.h b/components/os_crypt/async/browser/freedesktop_secret_key_provider.h
index e2eb3958ef6fa..f197759a91553 100644
--- a/components/os_crypt/async/browser/freedesktop_secret_key_provider.h
+++ b/components/os_crypt/async/browser/freedesktop_secret_key_provider.h
@@ -158,10 +158,15 @@ class FreedesktopSecretKeyProvider : public KeyProvider {
   static constexpr char kKeyName[] = "Chrome Safe Storage";
   static constexpr char kAppName[] = "chrome";
 #else
-  static constexpr char kKWalletFolder[] = "Chromium Keys";
-  static constexpr char kKeyName[] = "Chromium Safe Storage";
-  static constexpr char kAppName[] = "chromium";
+  // Redrob: our own keyring item. The Chromium names below are where earlier
+  // builds stored the secret; see TryLegacy* in the .cc.
+  static constexpr char kKWalletFolder[] = "Redrob Keys";
+  static constexpr char kKeyName[] = "Redrob Safe Storage";
+  static constexpr char kAppName[] = "redrob-browser";
 #endif
+  static constexpr char kLegacyKWalletFolder[] = "Chromium Keys";
+  static constexpr char kLegacyKeyName[] = "Chromium Safe Storage";
+  static constexpr char kLegacyAppName[] = "chromium";
 
   void InitializeFreedesktopSecretService();
   void OnServiceStarted(std::optional<bool> service_started);
@@ -198,6 +203,11 @@ class FreedesktopSecretKeyProvider : public KeyProvider {
   void OnKWalletHasEntry(dbus_utils::CallMethodResultSig<"b"> has_entry);
   void OnKWalletReadPassword(dbus_utils::CallMethodResultSig<"s"> secret_reply);
   void GenerateAndWriteKWalletPassword();
+  // Redrob: copy the secret from the legacy Chromium-named entry, if any.
+  void TryLegacyKWalletPassword();
+  void OnKWalletHasLegacyEntry(dbus_utils::CallMethodResultSig<"b"> has_entry);
+  void OnKWalletReadLegacyPassword(
+      dbus_utils::CallMethodResultSig<"s"> secret_reply);
   void OnKWalletWritePassword(
       scoped_refptr<base::RefCountedMemory> generated_secret,
       dbus_utils::CallMethodResultSig<"i"> return_code);
@@ -215,6 +225,9 @@ class FreedesktopSecretKeyProvider : public KeyProvider {
   raw_ptr<dbus::ObjectProxy> default_collection_proxy_ = nullptr;
   raw_ptr<dbus::ObjectProxy> session_proxy_ = nullptr;
   bool session_opened_ = false;
+  // Redrob: the search fell back to the legacy item, and what it finds is copied.
+  bool searching_legacy_ = false;
+  bool migrating_legacy_ = false;
 
   // For KWallet password storage
   raw_ptr<dbus::ObjectProxy> kwallet_proxy_ = nullptr;
