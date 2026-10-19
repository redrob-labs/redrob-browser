diff --git a/chrome/browser/browseros/server/server_process_launcher.cc b/chrome/browser/browseros/server/server_process_launcher.cc
new file mode 100644
index 0000000000000000000000000000000000000000..b834c7d4c52e08ca9e26b2e6a057b26f9c9a89f8
--- /dev/null
+++ b/chrome/browser/browseros/server/server_process_launcher.cc
@@ -0,0 +1,20 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#include "chrome/browser/browseros/server/server_process_launcher.h"
+
+#include "base/process/launch.h"
+#include "chrome/browser/redrob/app_bridge_token.h"
+
+namespace browseros {
+
+base::Process LaunchServerProcess(const base::CommandLine& command_line) {
+  base::LaunchOptions options;
+  // Redrob: only this child gets the app-bridge secret, in its environment (not argv, which `ps`
+  // shows). Browser.redrobLogin checks it.
+  options.environment[redrob::kAppBridgeTokenEnv] = redrob::AppBridgeToken();
+  return base::LaunchProcess(command_line, options);
+}
+
+}  // namespace browseros
