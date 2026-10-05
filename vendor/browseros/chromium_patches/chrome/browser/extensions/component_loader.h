diff --git a/chrome/browser/extensions/component_loader.h b/chrome/browser/extensions/component_loader.h
--- a/chrome/browser/extensions/component_loader.h
+++ b/chrome/browser/extensions/component_loader.h
@@ -239,6 +239,11 @@ class ComponentLoader : public KeyedService {
 
   void AddContextualTasksExtension();
 
+  // Loads the vendored Redrob extension from the resource bundle. It has to be a COMPONENT
+  // extension: redrobPrivate and settingsPrivate are gated on `location: component`, so an
+  // extension loaded any other way renders every surface unable to reach the browser.
+  void AddRedrobExtension();
+
   void AddWithNameAndDescription(int manifest_resource_id,
                                  const base::FilePath& root_directory,
                                  const std::string& name_string,
