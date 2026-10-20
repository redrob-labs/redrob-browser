diff --git a/chrome/installer/linux/common/installer.py b/chrome/installer/linux/common/installer.py
index 3970d8ebf641e..df209a73891be 100644
--- a/chrome/installer/linux/common/installer.py
+++ b/chrome/installer/linux/common/installer.py
@@ -33,6 +33,10 @@ class StandardPermissions:
     SANDBOX = 0o4755
 
 
+# Redrob: where the build puts the agent server, relative to $root_out_dir and to the install dir alike.
+AGENT_SERVER_BINARY = "BrowserOSServer/default/resources/bin/browseros_server"
+
+
 class ArtifactType:
     BINARY = "binary"
     DIRECTORY = "directory"
@@ -338,6 +342,10 @@ class InstallerConfig:
     common_predeps: str = ""
     repoconfig: str = ""
     repoconfigregex: str = ""
+    # Redrob: the deb822 URI, which apt.include hardcoded separately from repoconfig. Fixing only repoconfig left
+    # the .sources file that apt actually reads still pointing at dl.google.com -- two independent hardcodings of
+    # one fact, and the one that mattered more was the one not named REPOCONFIG.
+    repo_uri: str = ""
 
     # Package Format
     package_format: PackageFormat = PackageFormat.DEB
@@ -415,6 +423,9 @@ class InstallerConfig:
                 data["repoconfig"],
                 data["repoconfigregex"],
             ) = cls._compute_deb_repoconfig(args.arch, data["package_orig"])
+            # Scheme and host and path only: deb822 carries the suite and the components as their own fields, so
+            # the base string is split here rather than duplicated as a second constant.
+            data["repo_uri"] = "https://" + InstallerConfig.REDROB_REPO_BASE.split()[0]
         else:
             # RPM specific
             (
@@ -519,7 +530,24 @@ class InstallerConfig:
         # Verify channel
         channel, data["releasenotes"] = normalize_channel(channel)
         data["channel"] = channel
-        data["versionfull"] = f"{data['version']}-{data['package_release']}"
+        # Redrob: the package version is OURS, with Chromium's carried after a plus.
+        #
+        # Upstream's version here is Chromium's, which for Chrome is correct and for a fork is a lie a user
+        # reads: `apt show` reported 153.0.8010.36 for a product whose release is 0.1.0, which is the exact
+        # confusion REDROB_VERSION exists to prevent, in the one place a package manager shows it.
+        #
+        # `<ours>+<chromium>` rather than ours alone, because dropping Chromium's would delete a
+        # security-relevant fact from the metadata -- which upstream release this binary carries is the first
+        # thing an auditor asks. It also orders correctly in both dimensions: 0.2.0+153 > 0.1.0+154 because our
+        # version dominates, and 0.1.0+153.0.8010.37 > 0.1.0+153.0.8010.36 for a security-only rebase.
+        redrob_version_file = pathlib.Path(__file__).resolve().parent / "redrob-version.txt"
+        if not redrob_version_file.exists():
+            raise RuntimeError(
+                f"{redrob_version_file} is missing; the package version would silently fall back to Chromium's "
+                f"{data['version']}, which is the thing this exists to prevent")
+        redrob_version = redrob_version_file.read_text().strip()
+        data["versionfull"] = (
+            f"{redrob_version}+{data['version']}-{data['package_release']}")
         data["package_orig"] = data["info_vars"]["PACKAGE"]
         data["usr_bin_symlink_name"] = (
             f"{data['info_vars']['PACKAGE']}-{channel}"
@@ -536,14 +564,31 @@ class InstallerConfig:
 
         return data
 
+    # Redrob: our own channel, and the regex derived from the SAME base as the config line.
+    #
+    # Upstream hardcodes dl.google.com/linux/chrome/deb, which is correct for Chrome and was being inherited
+    # wholesale: an installed redrob-browser added GOOGLE's Chrome repository to the user's apt sources. Worse
+    # than having no update channel, because it silently points a machine at a third party.
+    #
+    # The regex mattered as much as the URL. Upstream builds it from the same hardcoded base, so overriding only
+    # REPOCONFIG left postinst matching Google's URL while writing ours -- the legacy-list migration and the
+    # disable-on-distupgrade logic would then never recognise their own entry. Both now come from one string.
+    #
+    # The environment override is kept, because a staging channel is exactly what it is for.
+    REDROB_REPO_BASE = "cdn.redrob.ai/browser/apt stable main"
+
     @staticmethod
     def _compute_deb_repoconfig(arch: str, package: str) -> tuple[str, str]:
-        base_repo_config = "dl.google.com/linux/chrome/deb/ stable main"
+        base_repo_config = InstallerConfig.REDROB_REPO_BASE
         default = f"deb [arch={arch}] https://{base_repo_config}"
         repoconfig = os.environ.get("REPOCONFIG", default)
 
+        # Escaped for the shell EREs in apt.include, where the base contains a path with slashes but no regex
+        # metacharacters -- kept as a substitution rather than a literal so a change to the base cannot leave the
+        # two out of step again.
+        escaped = base_repo_config.replace(".", "\\.")
         repo_config_regex = f"deb (\\[arch=[^]]*\\b{arch}\\b[^]]*\\]"
-        repo_config_regex += f"[[:space:]]*) https?://{base_repo_config}"
+        repo_config_regex += f"[[:space:]]*) https?://{escaped}"
         return repoconfig, repo_config_regex
 
     @staticmethod
@@ -820,6 +865,25 @@ class InstallerConfig:
                 )
             )
 
+        # Redrob: the agent server the side panel talks to. The build copies it to
+        # $root_out_dir/BrowserOSServer and the browser launches it from <install_dir>/BrowserOSServer, but
+        # upstream's list never named it, so a package installed fine and then every agent surface sat on
+        # "Bundled server unavailable". Not optional: a package without it is a browser without its agent.
+        # The tree is copied as a DIRECTORY (which resets every file to 0644), then the binary again with its
+        # exec bit. strip stays False: the server is a self-contained bun executable and stripping corrupts it.
+        server_dir = "BrowserOSServer"
+        server_bin = AGENT_SERVER_BINARY
+        artifacts.append(
+            Artifact(server_dir, server_dir, ArtifactType.DIRECTORY))
+        artifacts.append(
+            Artifact(
+                server_bin,
+                server_bin,
+                ArtifactType.RESOURCE,
+                StandardPermissions.EXECUTABLE,
+            )
+        )
+
         return artifacts
 
     def get_icon_artifacts(self) -> list[Artifact]:
@@ -919,7 +983,8 @@ class InstallerConfig:
             if self.channel not in ["beta", "unstable", "canary"]:
                 self.uri_scheme = "x-scheme-handler/google-chrome;"
         else:
-            self.uri_scheme = "x-scheme-handler/chromium;"
+            # Redrob: our scheme, the same one Windows registers, never Chromium's.
+            self.uri_scheme = "x-scheme-handler/redrob-browser;"
 
         # apparmor profile
         artifacts.append(
@@ -1224,7 +1289,12 @@ class Installer:
                     if not str(path).startswith(str(install_dir)):
                         elf_outside.append(path)
 
-                    if "not stripped" in output:
+                    if "not stripped" in output and not str(path).endswith(
+                        AGENT_SERVER_BINARY
+                    ):
+                        # Redrob: the agent server is exempt, by its exact path only. It is a bun
+                        # single-file executable whose JS payload lives in the ELF's trailing bytes,
+                        # so strip(1) would cut the program out of it. Nothing else is exempt.
                         unstripped.append(path)
 
                     if self.config.target_os != "chromeos":
