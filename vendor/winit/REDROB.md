# winit 0.30.13, patched

Upstream: winit 0.30.13 from crates.io (Apache-2.0, see LICENSE), with its
examples, tests and docs left out.

One change, in `src/platform_impl/linux/x11/event_processor.rs`
(`xinput2_unfocused`): an `XI_FocusOut` whose detail is `NotifyInferior`
(the keyboard moved to a child of the window) no longer marks the window
inactive. Upstream drops every key event while no window is active, so a
window whose keyboard sits on a child window (an input-only focus window, as
GTK uses, or an embedded Chromium page) received no keys.

Redrob Browser needs it because each tab's page is a Chromium child window
(docs/CEF.md): the chrome takes the keyboard through a focus window, since
with the browser window itself focused X reports keys to the page under the
pointer.
