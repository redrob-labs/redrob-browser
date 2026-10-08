diff --git a/build/config/siso/main.star b/build/config/siso/main.star
--- a/build/config/siso/main.star
+++ b/build/config/siso/main.star
@@ -24,6 +24,7 @@ load("./rust.star", "rust")
 load("./simple.star", "simple")
 load("./typescript_all.star", "typescript_all")
 load("./windows.star", chromium_windows = "chromium")
+load("./redrob_siso_config.star", "redrob_siso_config")
 
 def __setup_python(ctx, step_config):
     for rule in step_config["rules"]:
@@ -139,6 +140,8 @@ def init(ctx):
     handlers.update(reclient.handlers)
     handlers.update(typescript_all.handlers)
 
+    redrob_siso_config.configure(ctx, step_config, filegroups, handlers)
+
     return module(
         "config",
         step_config = json.encode(step_config),
