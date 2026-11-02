//! Print (Ctrl+P).
//!
//! Chrome style pages (Windows, Linux): Chrome's print preview, with the
//! system's printers and "Save as PDF". macOS (Alloy style): the system
//! print dialog. Alloy style on Linux has no print dialog (CEF expects the
//! app to bring a GTK one), so there the page is saved as a PDF in the
//! downloads folder, shown in the downloads panel and opened in the
//! system's PDF viewer, which prints.

use std::sync::atomic::{AtomicU64, Ordering};

use cef::*;

use crate::cdp::Event;
use crate::cef::Sink;

pub fn print(sink: &Sink, browser: &Browser) {
    let Some(host) = browser.host() else {
        return;
    };
    if !cfg!(target_os = "linux") || crate::cef::native::chrome_style() {
        host.print();
        return;
    }
    let url = browser
        .main_frame()
        .map(|f| super::text(&f.url()))
        .unwrap_or_default();
    let dir = crate::profile::downloads_dir();
    let _ = std::fs::create_dir_all(&dir);
    let path = super::download::unique_path(&dir, &pdf_name(&url));
    let path_s = path.to_string_lossy().into_owned();
    let mut done = PdfDone::new(sink.clone(), url, path_s.clone());
    let settings = PdfPrintSettings {
        print_background: 1,
        ..Default::default()
    };
    host.print_to_pdf(
        Some(&CefString::from(path_s.as_str())),
        Some(&settings),
        Some(&mut done),
    );
}

/// The PDF's file name: the page's host, like Chrome's "Save as PDF".
pub fn pdf_name(url: &str) -> String {
    let host = url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| "page".to_string());
    format!("{host}.pdf")
}

wrap_pdf_print_callback! {
    struct PdfDone {
        sink: Sink,
        url: String,
        path: String,
    }

    impl PdfPrintCallback {
        fn on_pdf_print_finished(&self, _path: Option<&CefString>, ok: ::std::os::raw::c_int) {
            static NEXT: AtomicU64 = AtomicU64::new(1);
            let path = std::path::Path::new(&self.path);
            let bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
            let ok = ok != 0 && bytes > 0;
            self.sink.send_global(Event::Download {
                guid: format!("print-{}", NEXT.fetch_add(1, Ordering::Relaxed)),
                url: self.url.clone(),
                filename: path
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                state: if ok { "completed" } else { "canceled" }.to_string(),
                path: self.path.clone(),
                bytes,
            });
            // A failure shows as a failed download in the panel.
            if ok {
                let _ = open::that_detached(path);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pdf_is_named_after_the_site() {
        assert_eq!(
            pdf_name("https://www.example.com/a/b?c"),
            "www.example.com.pdf"
        );
        assert_eq!(pdf_name("about:blank"), "page.pdf");
        assert_eq!(pdf_name(""), "page.pdf");
    }
}
