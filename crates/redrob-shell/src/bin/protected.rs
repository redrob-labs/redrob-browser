//! `redrob-browser-protected <url> [lang]`: one page in the operating
//! system's own web view (WebView2 on Windows, WKWebView on macOS), for video
//! that needs a DRM module the engine does not have (docs/DRM.md).
//!
//! The main window runs eframe's event loop, and tao wants its own on the
//! main thread, so this is a separate program the window starts. Agents do
//! not reach this window: it has no CDP endpoint.

#[cfg(any(target_os = "windows", target_os = "macos"))]
#[allow(dead_code)]
#[path = "../i18n.rs"]
mod i18n;

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn main() {
    use tao::{
        dpi::LogicalSize,
        event::{Event, WindowEvent},
        event_loop::{ControlFlow, EventLoopBuilder},
        window::WindowBuilder,
    };
    use wry::WebViewBuilder;

    let mut args = std::env::args().skip(1);
    let Some(url) = args.next().and_then(|u| web_url(&u)) else {
        eprintln!("usage: redrob-browser-protected <http(s) url> [en|ko]");
        std::process::exit(2);
    };
    i18n::set(i18n::detect(args.next().as_deref()));
    let app = i18n::t("Redrob Browser");
    let base_title = format!("{} - {app}", i18n::t("Protected tab"));

    let event_loop = EventLoopBuilder::<String>::with_user_event().build();
    let window = match WindowBuilder::new()
        .with_title(base_title.as_str())
        .with_inner_size(LogicalSize::new(1280.0, 860.0))
        .build(&event_loop)
    {
        Ok(w) => w,
        Err(e) => {
            eprintln!("redrob-browser-protected: could not open a window: {e}");
            std::process::exit(1);
        }
    };
    let titles = event_loop.create_proxy();
    let webview = WebViewBuilder::new()
        .with_url(url)
        .with_autoplay(true)
        .with_clipboard(true)
        .with_document_title_changed_handler(move |title| {
            let _ = titles.send_event(title);
        })
        .build(&window);
    let _webview = match webview {
        Ok(w) => w,
        Err(e) => {
            eprintln!("redrob-browser-protected: the system web view is not available: {e}");
            std::process::exit(1);
        }
    };

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(title) => {
                let title = title.trim();
                if title.is_empty() {
                    window.set_title(&base_title);
                } else {
                    window.set_title(&format!("{title} - {app}"));
                }
            }
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => *control_flow = ControlFlow::Exit,
            _ => {}
        }
    });
}

/// Only web pages: never a file, a script URL or another scheme.
#[cfg(any(target_os = "windows", target_os = "macos"))]
fn web_url(s: &str) -> Option<String> {
    let u = url::Url::parse(s).ok()?;
    matches!(u.scheme(), "http" | "https").then(|| u.to_string())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn main() {
    eprintln!("redrob-browser-protected: protected tabs are available on Windows and macOS only");
    std::process::exit(1);
}
