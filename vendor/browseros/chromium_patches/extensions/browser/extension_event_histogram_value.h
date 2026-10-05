diff --git a/extensions/browser/extension_event_histogram_value.h b/extensions/browser/extension_event_histogram_value.h
--- a/extensions/browser/extension_event_histogram_value.h
+++ b/extensions/browser/extension_event_histogram_value.h
@@ -605,6 +605,9 @@ enum HistogramValue {
   ENTERPRISE_WEBRTC_ON_CAPTURE_STOPPED = 580,
   // Last entry: Add new entries above, then run:
   // tools/metrics/histograms/update_extension_histograms.py
+  REDROBPRIVATE_ON_IMPORT_STATE_CHANGED = 2000,
+  REDROBPRIVATE_ON_TASK_CHANGED = 2001,
+  REDROBPRIVATE_ON_ENGINE_INSTALL_STATE_CHANGED = 2002,
   ENUM_BOUNDARY
 };
 // LINT.ThenChange(/tools/metrics/histograms/metadata/extensions/enums.xml:ExtensionEvents)
