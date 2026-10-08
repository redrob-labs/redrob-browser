diff --git a/chrome/install_static/chromium_install_modes.h b/chrome/install_static/chromium_install_modes.h
--- a/chrome/install_static/chromium_install_modes.h
+++ b/chrome/install_static/chromium_install_modes.h
@@ -10,6 +10,7 @@
 #include <array>
 
 #include "chrome/app/chrome_dll_resource.h"
+#include "chrome/browser/browseros/buildflags.h"
 #include "chrome/common/chrome_icon_resources_win.h"
 #include "chrome/install_static/install_constants.h"
 
@@ -19,9 +20,83 @@ namespace install_static {
 // and user data directory paths. May be empty if no such dir is to be used.
 inline constexpr wchar_t kCompanyPathName[] = L"";
 
+// Product-specific registrations keep BrowserOS and BrowserOS neo installs
+// isolated. COM interface IDs below still follow the shared Chromium ABI.
+struct ProductInstallIdentity {
+  const wchar_t* base_app_name;
+  const wchar_t* base_app_id;
+  const wchar_t* browser_prog_id_prefix;
+  const wchar_t* browser_prog_id_description;
+  const char* direct_launch_url_scheme;
+  const wchar_t* pdf_prog_id_prefix;
+  const wchar_t* pdf_prog_id_description;
+  const wchar_t* active_setup_guid;
+  CLSID toast_activator_clsid;
+  CLSID elevator_clsid;
+  CLSID tracing_service_clsid;
+  const wchar_t* sandbox_sid_prefix;
+};
+
 // The brand-specific product name to be included as a component of the install
-// and user data directory paths.
-inline constexpr wchar_t kProductPathName[] = L"Chromium";
+// and user data directory paths. Per-product so BrowserOS and BrowserClaw get
+// disjoint user-data roots (and singletons) under %LOCALAPPDATA%.
+#if BUILDFLAG(BROWSEROS_PRODUCT_BROWSERCLAW)
+inline constexpr wchar_t kProductPathName[] = L"BrowserClaw";
+inline constexpr ProductInstallIdentity kProductInstallIdentity = {
+    .base_app_name = L"BrowserOS neo",
+    .base_app_id = L"BrowserClaw",
+    .browser_prog_id_prefix = L"BClawHTML",
+    .browser_prog_id_description = L"BrowserOS neo HTML Document",
+    .direct_launch_url_scheme = "browserclaw",
+    .pdf_prog_id_prefix = L"BClawPDF",
+    .pdf_prog_id_description = L"BrowserOS neo PDF Document",
+    .active_setup_guid = L"{E9E65674-914E-4A29-83A9-A98D407446EC}",
+    .toast_activator_clsid = {0xD0A19C03,
+                              0xEE25,
+                              0x463B,
+                              {0xB3, 0x8F, 0x08, 0x51, 0x6D, 0x2B, 0x1A, 0x79}},
+    .elevator_clsid = {0x0AC4EA74,
+                       0xA61A,
+                       0x4807,
+                       {0xAF, 0xE5, 0x03, 0x70, 0x1D, 0x2B, 0x97, 0xDD}},
+    .tracing_service_clsid = {0x9F3CA910,
+                              0x142B,
+                              0x4C2C,
+                              {0xA6, 0x1E, 0xB2, 0x33, 0x5E, 0x2E, 0x67, 0xFD}},
+    .sandbox_sid_prefix =
+        L"S-1-15-2-3251537155-1984446955-2931258699-841473695-"
+        L"1938553385-"
+        L"924012147-",
+};
+#else
+inline constexpr wchar_t kProductPathName[] = L"Redrob";
+inline constexpr ProductInstallIdentity kProductInstallIdentity = {
+    .base_app_name = L"Redrob",
+    .base_app_id = L"Redrob",
+    .browser_prog_id_prefix = L"RedrobHTML",
+    .browser_prog_id_description = L"Redrob HTML Document",
+    .direct_launch_url_scheme = "redrob",
+    .pdf_prog_id_prefix = L"RedrobPDF",
+    .pdf_prog_id_description = L"Redrob PDF Document",
+    .active_setup_guid = L"{6B7F1FD9-15D5-40D2-9C26-7BF04115328C}",
+    .toast_activator_clsid = {0x770DF02E,
+                              0x602C,
+                              0x4466,
+                              {0x96, 0x57, 0xF8, 0x6C, 0x1F, 0x2B, 0xB0, 0x69}},
+    .elevator_clsid = {0x70524803,
+                       0x3E5E,
+                       0x4BC6,
+                       {0xBB, 0x16, 0xD4, 0x01, 0x42, 0xD2, 0x1A, 0x55}},
+    .tracing_service_clsid = {0x6D80524F,
+                              0x73EA,
+                              0x4A2F,
+                              {0x99, 0x17, 0xBB, 0xCD, 0x91, 0x32, 0xBF, 0xD3}},
+    .sandbox_sid_prefix =
+        L"S-1-15-2-3251537155-1984446955-2931258699-841473695-"
+        L"1938553385-"
+        L"924012148-",
+};
+#endif
 
 // The brand-specific safe browsing client name.
 inline constexpr char kSafeBrowsingName[] = "chromium";
@@ -52,42 +127,29 @@ inline constexpr auto kInstallModes = std::to_array<InstallConstants>({
         .install_suffix =
             L"",  // Empty install_suffix for the primary install mode.
         .logo_suffix = L"",  // No logo suffix for the primary install mode.
-        .app_guid =
-            L"",  // Empty app_guid since no integration with Google Update.
-        .base_app_name = L"Chromium",              // A distinct base_app_name.
-        .base_app_id = L"Chromium",                // A distinct base_app_id.
-        .browser_prog_id_prefix = L"ChromiumHTM",  // Browser ProgID prefix.
+        .app_guid = L"",
+        .base_app_name = kProductInstallIdentity.base_app_name,
+        .base_app_id = kProductInstallIdentity.base_app_id,
+        .browser_prog_id_prefix =
+            kProductInstallIdentity.browser_prog_id_prefix,
         .browser_prog_id_description =
-            L"Chromium HTML Document",  // Browser ProgID description.
-        .direct_launch_url_scheme = "chromium",
-        .pdf_prog_id_prefix = L"ChromiumPDF",  // PDF ProgID prefix.
+            kProductInstallIdentity.browser_prog_id_description,
+        .direct_launch_url_scheme =
+            kProductInstallIdentity.direct_launch_url_scheme,
+        .pdf_prog_id_prefix = kProductInstallIdentity.pdf_prog_id_prefix,
         .pdf_prog_id_description =
-            L"Chromium PDF Document",  // PDF ProgID description.
-        .active_setup_guid =
-            L"{7D2B3E1D-D096-4594-9D8F-A6667F12E0AC}",  // Active Setup
-                                                        // GUID.
-        .toast_activator_clsid = {0x635EFA6F,
-                                  0x08D6,
-                                  0x4EC9,
-                                  {0xBD, 0x14, 0x8A, 0x0F, 0xDE, 0x97, 0x51,
-                                   0x59}},  // Toast Activator CLSID.
-        .elevator_clsid = {0xD133B120,
-                           0x6DB4,
-                           0x4D6B,
-                           {0x8B, 0xFE, 0x83, 0xBF, 0x8C, 0xA1, 0xB1,
-                            0xB0}},  // Elevator CLSID.
-        .elevator_iid = {0xbb19a0e5,
-                         0xc6,
+            kProductInstallIdentity.pdf_prog_id_description,
+        .active_setup_guid = kProductInstallIdentity.active_setup_guid,
+        .toast_activator_clsid = kProductInstallIdentity.toast_activator_clsid,
+        .elevator_clsid = kProductInstallIdentity.elevator_clsid,
+        .elevator_iid = {0xBB19A0E5,
+                         0x00C6,
                          0x4966,
                          {0x94, 0xb2, 0x5a, 0xfe, 0xc6, 0xfe, 0xd9,
                           0x3a}},  // IElevator IID and TypeLib
         // {BB19A0E5-00C6-4966-94B2-5AFEC6FED93A}.
         .old_elevator_iids = {},
-        .tracing_service_clsid = {0x83f69367,
-                                  0x442d,
-                                  0x447f,
-                                  {0x8b, 0xcc, 0x0e, 0x3f, 0x97, 0xbe, 0x9c,
-                                   0xf2}},  // SystemTraceSession CLSID.
+        .tracing_service_clsid = kProductInstallIdentity.tracing_service_clsid,
         .tracing_service_iid = {0xe0b03e2d,
                                 0x7682,
                                 0x4d83,
@@ -108,10 +170,7 @@ inline constexpr auto kInstallModes = std::to_array<InstallConstants>({
             icon_resources::kHtmlDocIndex,  // HTML doc icon resource index.
         .pdf_doc_icon_resource_index =
             icon_resources::kPDFDocIndex,  // PDF doc icon resource index.
-        .sandbox_sid_prefix =
-            L"S-1-15-2-3251537155-1984446955-2931258699-841473695-"
-            L"1938553385-"
-            L"924012148-",  // App container sid prefix for sandbox.
+        .sandbox_sid_prefix = kProductInstallIdentity.sandbox_sid_prefix,
     },
 });
 
