//! Reading mode: the page's article alone, in plain type
//! (docs/CHROME-FEATURES.md). Chrome's own reading mode lives in a side
//! panel and its DOM distiller behind `chrome-distiller://`; CEF has
//! neither (the panel has no place in a toolbar-less page, the scheme is
//! not registered), so the window does it in the page: it keeps the
//! element with the most paragraph text, drops what is not reading
//! (scripts, navigation, forms, asides), and shows it in a narrow column.
//! The same command again reloads the page as it was.

use cef::*;

const READER_JS: &str = r#"(() => {
  const root = document.documentElement;
  if (root.dataset.redrobReader) { location.reload(); return; }
  const text = (e) => [...e.querySelectorAll('p')].reduce((n, p) => n + p.textContent.trim().length, 0);
  let best = [...document.querySelectorAll('article, main, [role=main]')]
    .sort((a, b) => text(b) - text(a))[0];
  if (!best || text(best) < 400) {
    let most = 0;
    for (const e of document.querySelectorAll('div, section, td')) {
      const n = [...e.children].filter((c) => c.tagName === 'P').reduce((s, p) => s + p.textContent.trim().length, 0);
      if (n > most) { most = n; best = e; }
    }
  }
  const body = (best || document.body).cloneNode(true);
  body.querySelectorAll('script, style, link, noscript, iframe, nav, aside, footer, form, button, input, select, textarea, svg, canvas, [role=navigation], [role=complementary], [aria-hidden=true], [hidden]')
    .forEach((e) => e.remove());
  for (const e of body.querySelectorAll('*')) {
    for (const a of [...e.attributes]) {
      if (!['href', 'src', 'alt', 'colspan', 'rowspan'].includes(a.name)) e.removeAttribute(a.name);
    }
  }
  const title = document.title;
  root.dataset.redrobReader = '1';
  for (const a of [...root.attributes]) if (a.name !== 'data-redrob-reader' && a.name !== 'lang') root.removeAttribute(a.name);
  const style = document.createElement('style');
  style.textContent = 'body{max-width:40em;margin:2.5em auto;padding:0 1.2em;font:19px/1.65 Georgia,"Noto Serif","Noto Serif CJK KR",serif;color:#1f1f1f;background:#faf9f6}'
    + 'h1{font:700 30px/1.25 system-ui,sans-serif;margin:0 0 1em}h2,h3{font-family:system-ui,sans-serif;line-height:1.3}'
    + 'img,video{max-width:100%;height:auto}pre{white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.2em .4em}a{color:#1a5fd0}'
    + '@media (prefers-color-scheme:dark){body{background:#1d1d1f;color:#e4e4e4}a{color:#8ab4f8}td,th{border-color:#555}}';
  document.head.replaceChildren(style);
  const h = document.createElement('h1');
  h.textContent = title;
  document.body.replaceWith(document.createElement('body'));
  document.body.append(h, ...body.childNodes);
  scrollTo(0, 0);
})();"#;

/// Show `browser`'s page in reading mode, or the page again when it shows
/// in reading mode.
pub fn toggle(browser: &Browser) {
    if let Some(f) = browser.main_frame() {
        f.execute_java_script(
            Some(&CefString::from(READER_JS)),
            Some(&CefString::from("redrob://reading-mode")),
            1,
        );
    }
}
