diff --git a/build/win/reorder-imports.py b/build/win/reorder-imports.py
index 11602df2777ec..c05518886687d 100755
--- a/build/win/reorder-imports.py
+++ b/build/win/reorder-imports.py
@@ -27,8 +27,8 @@ def reorder_imports(input_dir, output_dir, architecture):
     # correct executable in the first place, so that this script
     # only needs to verify that and not write a whole new exe.
 
-    input_image = os.path.join(input_dir, 'chrome.exe')
-    output_image = os.path.join(output_dir, 'chrome.exe')
+    input_image = os.path.join(input_dir, 'redrob-browser.exe')
+    output_image = os.path.join(output_dir, 'redrob-browser.exe')
 
     # pefile mmap()s the whole executable, and then parses parts of
     # it into python data structures for ease of processing.
@@ -90,7 +90,7 @@ def reorder_imports(input_dir, output_dir, architecture):
 
     pe.write(filename=output_image)
 
-    for fname in glob.iglob(os.path.join(input_dir, 'chrome.exe.*')):
+    for fname in glob.iglob(os.path.join(input_dir, 'redrob-browser.exe.*')):
         shutil.copy(fname, os.path.join(output_dir, os.path.basename(fname)))
     return 0
 
