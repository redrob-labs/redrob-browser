diff --git a/components/os_crypt/async/browser/freedesktop_secret_key_provider.cc b/components/os_crypt/async/browser/freedesktop_secret_key_provider.cc
index bc569bb3d128e..512bc90c78fc9 100644
--- a/components/os_crypt/async/browser/freedesktop_secret_key_provider.cc
+++ b/components/os_crypt/async/browser/freedesktop_secret_key_provider.cc
@@ -406,6 +406,24 @@ void FreedesktopSecretKeyProvider::OnSearchItems(
   }
 
   const auto& result_paths = std::get<0>(results.value());
+  if (result_paths.empty() && !searching_legacy_) {
+    // Redrob: nothing under our name yet. Earlier builds stored the secret
+    // under Chromium's, and everything saved is encrypted with it, so look
+    // there before minting a new one.
+    searching_legacy_ = true;
+    std::map<std::string, std::string> legacy_attrs{
+        {kApplicationAttributeKey, kLegacyAppName}};
+    dbus_utils::CallMethod<"a{ss}", "ao">(
+        default_collection_proxy_, kSecretCollectionInterface,
+        kMethodSearchItems,
+        base::BindOnce(&FreedesktopSecretKeyProvider::OnSearchItems,
+                       weak_ptr_factory_.GetWeakPtr()),
+        legacy_attrs);
+    return;
+  }
+  if (!result_paths.empty() && searching_legacy_) {
+    migrating_legacy_ = true;
+  }
   if (result_paths.empty()) {
     // No items found, create a new secret.
     CreateItem(base::MakeRefCounted<base::RefCountedString>(
@@ -468,6 +486,12 @@ void FreedesktopSecretKeyProvider::OnGetSecrets(
     return;
   }
 
+  if (migrating_legacy_) {
+    // Redrob: same secret, our item name. OnCreateItem derives the key.
+    migrating_legacy_ = false;
+    CreateItem(base::MakeRefCounted<base::RefCountedBytes>(value));
+    return;
+  }
   DeriveKeyFromSecret(base::span(value));
 }
 
@@ -629,7 +653,7 @@ void FreedesktopSecretKeyProvider::OnKWalletCreateFolder(
     FinalizeFailure(InitStatus::kKWalletFolderCreationFailed);
     return;
   }
-  GenerateAndWriteKWalletPassword();
+  TryLegacyKWalletPassword();
 }
 
 void FreedesktopSecretKeyProvider::OnKWalletHasEntry(
@@ -647,7 +671,7 @@ void FreedesktopSecretKeyProvider::OnKWalletHasEntry(
                        weak_ptr_factory_.GetWeakPtr()),
         kwallet_handle_, kKWalletFolder, kKeyName, product_name_);
   } else {
-    GenerateAndWriteKWalletPassword();
+    TryLegacyKWalletPassword();
   }
 }
 
@@ -672,6 +696,47 @@ void FreedesktopSecretKeyProvider::OnKWalletReadPassword(
   DeriveKeyFromSecret(base::as_byte_span(secret));
 }
 
+void FreedesktopSecretKeyProvider::TryLegacyKWalletPassword() {
+  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
+  dbus_utils::CallMethod<"isss", "b">(
+      kwallet_proxy_, kKWalletInterface, kKWalletMethodHasEntry,
+      base::BindOnce(&FreedesktopSecretKeyProvider::OnKWalletHasLegacyEntry,
+                     weak_ptr_factory_.GetWeakPtr()),
+      kwallet_handle_, kLegacyKWalletFolder, kLegacyKeyName, product_name_);
+}
+
+void FreedesktopSecretKeyProvider::OnKWalletHasLegacyEntry(
+    dbus_utils::CallMethodResultSig<"b"> has_entry) {
+  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
+  if (!has_entry.has_value() || !std::get<0>(has_entry.value())) {
+    GenerateAndWriteKWalletPassword();
+    return;
+  }
+  dbus_utils::CallMethod<"isss", "s">(
+      kwallet_proxy_, kKWalletInterface, kKWalletMethodReadPassword,
+      base::BindOnce(
+          &FreedesktopSecretKeyProvider::OnKWalletReadLegacyPassword,
+          weak_ptr_factory_.GetWeakPtr()),
+      kwallet_handle_, kLegacyKWalletFolder, kLegacyKeyName, product_name_);
+}
+
+void FreedesktopSecretKeyProvider::OnKWalletReadLegacyPassword(
+    dbus_utils::CallMethodResultSig<"s"> secret_reply) {
+  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
+  if (!secret_reply.has_value() || std::get<0>(secret_reply.value()).empty()) {
+    GenerateAndWriteKWalletPassword();
+    return;
+  }
+  auto secret = base::MakeRefCounted<base::RefCountedString>(
+      std::move(std::get<0>(secret_reply.value())));
+  dbus_utils::CallMethod<"issss", "i">(
+      kwallet_proxy_, kKWalletInterface, kKWalletMethodWritePassword,
+      base::BindOnce(&FreedesktopSecretKeyProvider::OnKWalletWritePassword,
+                     weak_ptr_factory_.GetWeakPtr(), secret),
+      kwallet_handle_, kKWalletFolder, kKeyName, secret->as_string(),
+      product_name_);
+}
+
 void FreedesktopSecretKeyProvider::GenerateAndWriteKWalletPassword() {
   DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
   auto secret = base::MakeRefCounted<base::RefCountedString>(
