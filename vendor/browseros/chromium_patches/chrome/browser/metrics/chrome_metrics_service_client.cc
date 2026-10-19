diff --git a/chrome/browser/metrics/chrome_metrics_service_client.cc b/chrome/browser/metrics/chrome_metrics_service_client.cc
index 2ba2503503c7c..1f0e489e1ebb2 100644
--- a/chrome/browser/metrics/chrome_metrics_service_client.cc
+++ b/chrome/browser/metrics/chrome_metrics_service_client.cc
@@ -29,6 +29,7 @@
 #include "base/task/single_thread_task_runner.h"
 #include "base/time/time.h"
 #include "build/build_config.h"
+#include "chrome/browser/browseros/metrics/browseros_metrics.h"
 #include "chrome/browser/browser_process.h"
 #include "chrome/browser/enterprise/browser_management/management_service_factory.h"
 #include "chrome/browser/glic/glic_metrics_provider.h"
@@ -1140,6 +1141,7 @@ void ChromeMetricsServiceClient::RegisterUKMProviders() {
 }
 
 void ChromeMetricsServiceClient::NotifyApplicationNotIdle() {
+  browseros_metrics::BrowserOSMetrics::Log("alive", {}, 0.01);
   metrics_service_->OnApplicationNotIdle();
 }
 
