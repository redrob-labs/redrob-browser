//! Copy, cut and paste for pages, through the window's clipboard.
//!
//! On Linux, Chromium off screen with the window's message pump never
//! answers X selection requests: text it copies cannot be pasted anywhere,
//! and its own paste waits forever for an answer (the page hangs). So the
//! page's selection is read here and put on the clipboard by the window
//! (`Event::Clipboard`), and a paste types the clipboard's text into the
//! page. Other platforms keep Chromium's own commands.

use cef::*;
use serde_json::json;

use crate::cdp::Event;
use crate::cef::client;
use crate::cef::Sink;

/// Whether pages use this module instead of Chromium's clipboard.
pub const OWN: bool = cfg!(target_os = "linux");

/// The page's selected text (in a text field, its selected part); with
/// `cut`, also deleted from the field.
const SELECTION_JS: &str = r#"((cut) => {
  const e = document.activeElement;
  let t;
  if (e && (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') && typeof e.selectionStart === 'number') {
    t = e.value.slice(e.selectionStart, e.selectionEnd);
    if (cut && t && !e.readOnly) {
      e.setRangeText('', e.selectionStart, e.selectionEnd, 'end');
      e.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteByCut' }));
    }
  } else {
    t = String(getSelection());
    if (cut && t) document.execCommand('delete');
  }
  return t;
})"#;

/// Put the page's selection on the clipboard; `cut` removes it from the page.
pub fn copy(sink: &Sink, browser: &Browser, cut: bool) {
    let sink = sink.clone();
    let id = browser.identifier();
    client::devtools(
        browser,
        "Runtime.evaluate",
        json!({ "expression": format!("{SELECTION_JS}({cut})"), "returnByValue": true }),
        move |_, r| {
            if let Some(t) = r["result"]["value"].as_str().filter(|t| !t.is_empty()) {
                sink.send(id, Event::Clipboard(t.to_string()));
            }
        },
    );
}

/// Type `text` into the page where its caret is.
pub fn insert(browser: &Browser, text: &str) {
    if !text.is_empty() {
        client::devtools_send(browser, "Input.insertText", json!({ "text": text }));
    }
}

/// Type the clipboard's text into the page. The clipboard is read off the
/// window thread: when Chromium owns the selection, it answers on that
/// thread, so reading there would wait on itself.
pub fn paste(browser: &Browser) {
    let browser = browser.clone();
    std::thread::spawn(move || {
        let text = arboard::Clipboard::new()
            .ok()
            .and_then(|mut c| c.get_text().ok());
        if let Some(text) = text {
            super::on_ui(move || insert(&browser, &text));
        }
    });
}
