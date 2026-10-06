diff --git a/chrome/common/chrome_switches.h b/chrome/common/chrome_switches.h
--- a/chrome/common/chrome_switches.h
+++ b/chrome/common/chrome_switches.h
@@ -1146,6 +1146,19 @@ inline constexpr char kEnterpriseSigninDialogBehaviorForTesting[] =
 // DON'T ADD RANDOM STUFF HERE. Put it in the main section above in
 // alphabetical order, or in one of the ifdefs (also in order in each section).
 
+
+// Starts an agent task from the command line. With a browser already running, the
+// process singleton forwards this to it, which is how `redrob "..."` from a terminal
+// reaches the session the user is actually in. One way only: the singleton channel
+// answers with an ACK and carries no payload back, so nothing is printed. Use the
+// loopback RPC (--redrob-rpc) when the answer has to come back to the terminal.
+inline constexpr char kRedrobTask[] = "redrob-task";
+
+// Binds the loopback RPC endpoint that serves the CLI, the MCP server and the REPL.
+// Off unless this switch or the matching setting is present: a local socket that can
+// drive the browser is, to any other process on the machine, the browser.
+inline constexpr char kRedrobRpc[] = "redrob-rpc";
+
 }  // namespace switches
 
 #endif  // CHROME_COMMON_CHROME_SWITCHES_H_
