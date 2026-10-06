diff --git a/tools/gritsettings/resource_ids.spec b/tools/gritsettings/resource_ids.spec
--- a/tools/gritsettings/resource_ids.spec
+++ b/tools/gritsettings/resource_ids.spec
@@ -192,6 +192,10 @@
   "chrome/browser/indigo/resources/browser_resources.grd": {
     "includes": [2640],
   },
+  "<(SHARED_INTERMEDIATE_DIR)/chrome/browser/browseros/onboarding/resources.grd": {
+    "META": {"sizes": {"includes": [20]}},
+    "includes": [2680],
+  },
   # END chrome/browser section.
 
   # START chrome/ WebUI resources section
@@ -1812,6 +1816,21 @@
     "includes": [12000],
   },
 
+  # Redrob's own strings, deliberately LAST and deliberately far above everything upstream allocates.
+  #
+  # Two constraints decide this position. The id is baked into the .pak, so a range next to upstream's
+  # own means every Chromium tag that adds a grd is a chance of collision -- 13000 sits above the
+  # highest allocation in this file (12000, with 800 reserved) with room for the fork to grow. And
+  # tools/grit/grit/tool/update_resource_ids/assigner.py requires ids to be non-decreasing in file
+  # order unless a jump lands exactly on an id already seen: an entry of 13000 in the alphabetical
+  # chrome/browser/ section makes the NEXT entry a backwards jump to an unvisited id, and
+  # //tools/gritsettings:default_resource_ids fails the build with "Cannot jump to unvisited". So the
+  # alphabetical placement the header asks for is not available to a high range; this is.
+  "chrome/browser/redrob/resources/redrob_strings.grd": {
+    "META": {"sizes": {"messages": [500]}},
+    "messages": [13000],
+  },
+
   # END "everything else" section.
   # Everything but chrome/, components/, content/, and ios/
 
