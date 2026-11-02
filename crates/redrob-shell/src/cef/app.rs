//! The CEF application: command-line switches for every process and the
//! browser process handler that drives the external message pump.

use std::time::Duration;

use cef::{
    rc::Rc as _, wrap_app, wrap_browser_process_handler, App, BrowserProcessHandler, CefString,
    CommandLine, ImplApp, ImplBrowserProcessHandler, ImplCommandLine, WrapApp,
    WrapBrowserProcessHandler,
};

pub fn new() -> App {
    RedrobApp::new()
}

wrap_app! {
    struct RedrobApp;

    impl App {
        fn on_before_command_line_processing(
            &self,
            process_type: Option<&CefString>,
            command_line: Option<&mut CommandLine>,
        ) {
            let Some(command_line) = command_line else {
                return;
            };
            // Only the browser process: children inherit what they need.
            if process_type.is_some_and(|t| !t.to_string().is_empty()) {
                return;
            }
            let switch = |name: &str| command_line.append_switch(Some(&CefString::from(name)));
            let value = |name: &str, v: &str| {
                command_line
                    .append_switch_with_value(Some(&CefString::from(name)), Some(&CefString::from(v)))
            };
            if super::PIPE.load(std::sync::atomic::Ordering::SeqCst) {
                // DevTools on the pipe only (cef/mod.rs), no port: fds 3
                // and 4, or on Windows the handles named here.
                switch("remote-debugging-pipe");
                if let Some(handles) = super::PIPE_HANDLES.get() {
                    value("remote-debugging-io-pipes", handles);
                }
            }
            switch("noerrdialogs");
            switch("hide-crash-restore-bubble");
            if cfg!(target_os = "macos") {
                // Cookies are encrypted with the profile's own key, not a
                // Keychain prompt for "Chromium Safe Storage".
                switch("use-mock-keychain");
            }
            if cfg!(target_os = "linux") {
                // The profile's own key, not the desktop's secret service.
                value("password-store", "basic");
                // Pages are child windows of the X11 browser window
                // (XWayland under Wayland).
                value("ozone-platform", "x11");
            }
            // Middle-click autoscroll, as Chrome on Windows has it; Chromium
            // turns it on there only.
            value("enable-blink-features", "MiddleClickAutoscroll");
        }

        fn browser_process_handler(&self) -> Option<BrowserProcessHandler> {
            Some(PumpHandler::new())
        }
    }
}

wrap_browser_process_handler! {
    struct PumpHandler;

    impl BrowserProcessHandler {
        fn on_schedule_message_pump_work(&self, delay_ms: i64) {
            super::schedule(Duration::from_millis(delay_ms.max(0) as u64));
        }

        fn on_context_initialized(&self) {
            // Protected video plays on the first visit (cef/handlers/widevine.rs).
            super::handlers::widevine::install();
            // Pages ask for the window's language (cef/mod.rs).
            super::write_languages();
        }
    }
}
