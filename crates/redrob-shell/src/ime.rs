//! Input methods that compose inside the text, as Chrome does.
//!
//! On X11, winit reaches an input method through XIM. fcitx5's XIM server
//! offers the on-the-spot style (preedit text sent to the program) only when
//! its `UseOnTheSpot` option is on, which it is not by default, so the
//! syllable being composed shows only in fcitx5's own popup and the page or
//! address bar never sees it. Chrome talks to fcitx5 over D-Bus (through
//! GTK's fcitx module) and draws the composition itself. This module does
//! the same: when fcitx5 runs, the window turns winit's XIM off
//! (`XMODIFIERS=@im=none`, [`init`]), sends the keys typed into a text
//! target to fcitx5's input context, and turns its answers into egui IME
//! events at the start of each pass ([`before_pass`]). egui text fields
//! compose with them as they do with winit's, and the page area passes them
//! to Chromium (cef/input.rs: `ime_set_composition` with an underline,
//! `ime_commit_text`, `ime_cancel_composition`). fcitx5 draws its candidate
//! list at the caret the pass reported ([`after_pass`]).
//!
//! Elsewhere (Wayland, Windows, macOS, IBus, or `REDROB_IME=xim`) winit's
//! own input method support is used unchanged.

#[cfg(target_os = "linux")]
mod fcitx;

/// Choose how the window talks to the input method. Call before the event
/// loop starts, while the process has no other threads.
pub fn init() {
    #[cfg(target_os = "linux")]
    fcitx::init();
}

/// Run first in a viewport's pass, before any widget reads input: keys for
/// the input method go to it, and its composition comes back as IME events.
pub fn before_pass(ctx: &egui::Context, focused: bool) {
    #[cfg(target_os = "linux")]
    fcitx::before_pass(ctx, focused);
    #[cfg(not(target_os = "linux"))]
    let _ = (ctx, focused);
}

/// Run last in a viewport's pass: whether a text target has focus, and
/// where its caret is, for the next pass and the candidate window.
pub fn after_pass(ctx: &egui::Context, focused: bool) {
    #[cfg(target_os = "linux")]
    fcitx::after_pass(ctx, focused);
    #[cfg(not(target_os = "linux"))]
    let _ = (ctx, focused);
}

/// A key egui has no name for (한/영, 한자), read from X (cef/xdnd.rs).
#[cfg(target_os = "linux")]
pub fn raw_key(sym: u32, code: u32, release: bool) {
    fcitx::raw_key(sym, code, release);
}

#[cfg(target_os = "linux")]
pub fn has_raw_keys() -> bool {
    fcitx::has_raw_keys()
}
