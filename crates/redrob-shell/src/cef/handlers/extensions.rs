//! Chrome's extensions in the window's toolbar (docs/CHROME-FEATURES.md).
//!
//! A Chrome style page is a Chrome browser without a toolbar, so Chrome has
//! nowhere to draw extension icons and will not open an action's popup
//! ("Browser window has no toolbar"; `Extensions.triggerAction` takes the
//! browser down). The window draws them instead:
//! - [`refresh`] reads the installed extensions from the profile (Chrome's
//!   own `extensions.settings`, each extension's manifest) and Chrome's own
//!   pin list, which [`set_pinned`] changes, so chrome://extensions and the
//!   toolbar agree;
//! - a click runs the extension's action on the page on screen: its popup
//!   page opens over the page, under the icon (cdp.rs), with
//!   [`popup_script`] so `chrome.tabs.query({currentWindow})` finds that
//!   page; an action without a popup has its `onClicked` listeners run in
//!   its service worker ([`run_action`]).

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use cef::*;
use serde_json::{json, Value};

use crate::cef::client;

/// An installed extension with a toolbar action.
#[derive(Clone, Debug, PartialEq)]
pub struct Extension {
    pub id: String,
    pub name: String,
    /// Its toolbar icon on disk (PNG), the size nearest 32 px.
    pub icon: Option<PathBuf>,
    /// `chrome-extension://<id>/<default_popup>`.
    pub popup: Option<String>,
    pub pinned: bool,
}

fn installed() -> &'static Mutex<Arc<Vec<Extension>>> {
    static LIST: std::sync::OnceLock<Mutex<Arc<Vec<Extension>>>> = std::sync::OnceLock::new();
    LIST.get_or_init(Mutex::default)
}

/// The extensions as [`refresh`] last read them, in install order.
pub fn list() -> Arc<Vec<Extension>> {
    installed().lock().map(|l| l.clone()).unwrap_or_default()
}

/// Chrome's pin list (`extensions.pinned_extensions`).
const PINNED: &str = "extensions.pinned_extensions";

/// Read the installed extensions again. Call on CEF's UI thread.
pub fn refresh() {
    let Some(ctx) = crate::cef::request_context() else {
        return;
    };
    let Some(dir) = crate::cef::profile_dir().map(|d| d.join("Extensions")) else {
        return;
    };
    let pinned = string_list(&ctx, PINNED);
    let mut found = Vec::new();
    let settings = ctx
        .preference(Some(&CefString::from("extensions.settings")))
        .and_then(|v| v.dictionary());
    if let Some(settings) = settings {
        let mut keys = CefStringList::new();
        settings.keys(Some(&mut keys));
        for id in keys {
            let Some(d) = settings.dictionary(Some(&CefString::from(id.as_str()))) else {
                continue;
            };
            let key = |k: &str| CefString::from(k);
            // Chrome's own (component) extensions have no toolbar icon.
            let location = d.int(Some(&key("location")));
            if matches!(location, 5 | 10) {
                continue;
            }
            if disabled(&d) {
                continue;
            }
            let path = CefString::from(&d.string(Some(&key("path")))).to_string();
            if path.is_empty() {
                continue;
            }
            let root = if Path::new(&path).is_absolute() {
                PathBuf::from(path)
            } else {
                dir.join(path)
            };
            let first_install = CefString::from(&d.string(Some(&key("first_install_time"))))
                .to_string()
                .parse::<u64>()
                .unwrap_or(0);
            if let Some(mut e) = read(&id, &root) {
                e.pinned = pinned.contains(&e.id);
                found.push((first_install, e));
            }
        }
    }
    found.sort_by_key(|(t, e)| (*t, e.name.to_lowercase()));
    let found: Vec<Extension> = found.into_iter().map(|(_, e)| e).collect();
    if let Ok(mut l) = installed().lock() {
        if **l != found {
            *l = Arc::new(found);
        }
    }
}

/// Whether Chrome keeps the extension turned off (`disable_reasons` is a
/// list in Chrome 156, a bit set before).
fn disabled(d: &DictionaryValue) -> bool {
    let key = CefString::from("disable_reasons");
    if d.has_key(Some(&key)) != 1 {
        return false;
    }
    let t = d.get_type(Some(&key));
    match t.as_ref() {
        sys::cef_value_type_t::VTYPE_LIST => d.list(Some(&key)).is_some_and(|l| l.size() > 0),
        sys::cef_value_type_t::VTYPE_INT => d.int(Some(&key)) != 0,
        _ => false,
    }
}

fn string_list(ctx: &RequestContext, name: &str) -> Vec<String> {
    let Some(list) = ctx
        .preference(Some(&CefString::from(name)))
        .and_then(|v| v.list())
    else {
        return Vec::new();
    };
    (0..list.size())
        .map(|i| CefString::from(&list.string(i)).to_string())
        .collect()
}

/// An extension from its folder: its manifest's name, action icon and popup.
/// None without a toolbar action (a theme, an app).
fn read(id: &str, root: &Path) -> Option<Extension> {
    let manifest: Value =
        serde_json::from_slice(&std::fs::read(root.join("manifest.json")).ok()?).ok()?;
    if manifest.get("theme").is_some() || manifest.get("app").is_some() {
        return None;
    }
    let action = ["action", "browser_action", "page_action"]
        .iter()
        .find_map(|k| manifest.get(*k))
        .cloned()
        .unwrap_or(json!({}));
    let name = localize(root, &manifest, manifest["name"].as_str().unwrap_or(id));
    let icon = pick_icon(&action["default_icon"])
        .or_else(|| pick_icon(&manifest["icons"]))
        .map(|p| root.join(p.trim_start_matches('/')))
        .filter(|p| p.is_file());
    let popup = action["default_popup"]
        .as_str()
        .filter(|p| !p.is_empty())
        .map(|p| format!("chrome-extension://{id}/{}", p.trim_start_matches('/')));
    Some(Extension {
        id: id.to_string(),
        name,
        icon,
        popup,
        pinned: false,
    })
}

/// The icon nearest 32 px of a manifest's `default_icon` or `icons` (a
/// path, or sizes to paths).
fn pick_icon(v: &Value) -> Option<String> {
    if let Some(s) = v.as_str() {
        return Some(s.to_string());
    }
    let sizes = v.as_object()?;
    sizes
        .iter()
        .filter_map(|(k, p)| Some((k.parse::<i32>().ok()?, p.as_str()?)))
        .min_by_key(|(size, _)| (size - 32).abs() * 2 + i32::from(*size < 32))
        .map(|(_, p)| p.to_string())
}

/// `__MSG_name__` from the extension's messages in the window's language,
/// else its default locale.
fn localize(root: &Path, manifest: &Value, text: &str) -> String {
    let Some(key) = text
        .strip_prefix("__MSG_")
        .and_then(|k| k.strip_suffix("__"))
    else {
        return text.to_string();
    };
    let lang = crate::i18n::code(crate::i18n::current());
    let default = manifest["default_locale"].as_str().unwrap_or("en");
    for locale in [lang, default, "en"] {
        let file = root.join("_locales").join(locale).join("messages.json");
        let Some(messages) = std::fs::read(&file)
            .ok()
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        else {
            continue;
        };
        let found = messages.as_object().and_then(|m| {
            m.iter()
                .find(|(k, _)| k.eq_ignore_ascii_case(key))
                .and_then(|(_, v)| v["message"].as_str())
        });
        if let Some(m) = found {
            return m.to_string();
        }
    }
    text.to_string()
}

/// Pin `id` to the toolbar or take it off, in Chrome's own pin list. Call
/// on CEF's UI thread.
pub fn set_pinned(id: &str, pinned: bool) {
    let Some(ctx) = crate::cef::request_context() else {
        return;
    };
    let mut list = string_list(&ctx, PINNED);
    list.retain(|i| i != id);
    if pinned {
        list.push(id.to_string());
    }
    let refs: Vec<&str> = list.iter().map(String::as_str).collect();
    crate::cef::set_pref_to(PINNED, crate::cef::Pref::List(&refs));
    refresh();
}

/// Run extension `id`'s toolbar action on `browser`'s page, for an action
/// without a popup: its `onClicked` listeners get the page's tab. Chrome
/// would also grant the extension `activeTab` on the page; nothing in CEF
/// can, so an extension that needs it for the click is told the page is out
/// of its reach.
pub fn run_action(browser: &Browser, id: &str) {
    let id = id.to_string();
    let b = browser.clone();
    client::devtools(
        browser,
        "Browser.getWindowForTarget",
        json!({}),
        move |_, r| {
            let Some(window) = r["windowId"].as_i64() else {
                return;
            };
            let script = format!(
                "{WINDOW_TYPES} (async () => {{ const a = chrome.action || chrome.browserAction; \
             const [t] = await chrome.tabs.query({{ windowId: {window} }}); \
             if (t && a) a.onClicked.dispatch(t); return !!t; }})()"
            );
            in_worker(b, id, script);
        },
    );
}

/// Before extension `id`'s popup opens: its background, which answers the
/// popup's questions about "the active tab", finds the page's tab
/// ([`WINDOW_TYPES`]).
pub fn prepare_popup(browser: &Browser, id: &str) {
    in_worker(browser.clone(), id.to_string(), WINDOW_TYPES.to_string());
}

/// Each page of the window is a Chrome window of type "popup" (CEF makes
/// every Chrome style browser in a parent window one), so an extension
/// asking for tabs of "normal" windows would find none. This counts the
/// window's pages as the normal windows they are. Runs in an extension's
/// background and popup.
pub const WINDOW_TYPES: &str = r#"(() => {
  const c = globalThis.chrome;
  if (!c || !c.tabs || c.tabs.__redrob) return;
  const t = c.tabs, w = c.windows;
  const normal = (types) => Array.isArray(types) && types.includes('normal') && !types.includes('popup')
    ? types.concat(['popup']) : types;
  const query = t.query.bind(t);
  t.query = (q, cb) => {
    q = Object.assign({}, q);
    if (q.windowType === 'normal') delete q.windowType;
    return cb ? query(q, cb) : query(q);
  };
  t.__redrob = true;
  if (w) {
    for (const k of ['getAll', 'getCurrent', 'getLastFocused', 'get']) {
      const f = w[k] && w[k].bind(w);
      if (!f) continue;
      w[k] = (...a) => {
        const i = k === 'get' ? 1 : 0;
        if (a[i] && typeof a[i] === 'object') {
          a[i] = Object.assign({}, a[i], { windowTypes: normal(a[i].windowTypes) });
        }
        return f(...a);
      };
    }
  }
})();"#;

/// Evaluate `script` in extension `id`'s background (its service worker,
/// started when it sleeps), from `browser`'s DevTools session.
fn in_worker(browser: Browser, id: String, script: String) {
    let scope = format!("chrome-extension://{id}/");
    let b = browser.clone();
    find_worker(&browser, scope.clone(), move |target| match target {
        Some(t) => attach_and_run(b, t, script),
        None => {
            // Asleep: wake it, then look again.
            let b2 = b.clone();
            client::devtools_send(&b, "ServiceWorker.enable", json!({}));
            client::devtools(
                &b,
                "ServiceWorker.startWorker",
                json!({ "scopeURL": scope }),
                move |_, _| {
                    let b3 = b2.clone();
                    find_worker(&b2, scope, move |t| {
                        client::devtools_send(&b3, "ServiceWorker.disable", json!({}));
                        match t {
                            Some(t) => attach_and_run(b3, t, script),
                            None => eprintln!(
                                "redrob-browser: extension {id}: no background to run its action"
                            ),
                        }
                    });
                },
            );
        }
    });
}

fn find_worker(browser: &Browser, scope: String, then: impl FnOnce(Option<String>) + 'static) {
    client::devtools(browser, "Target.getTargets", json!({}), move |_, r| {
        let target = r["targetInfos"].as_array().and_then(|all| {
            all.iter()
                .find(|t| {
                    matches!(
                        t["type"].as_str(),
                        Some("service_worker" | "background_page")
                    ) && t["url"].as_str().is_some_and(|u| u.starts_with(&scope))
                })
                .and_then(|t| t["targetId"].as_str())
                .map(str::to_string)
        });
        then(target);
    });
}

fn attach_and_run(browser: Browser, target: String, script: String) {
    let b = browser.clone();
    client::devtools(
        &browser,
        "Target.attachToTarget",
        json!({ "targetId": target, "flatten": true }),
        move |_, r| {
            let Some(session) = r["sessionId"].as_str().map(str::to_string) else {
                eprintln!("redrob-browser: extension background: {r}");
                return;
            };
            let b2 = b.clone();
            let s2 = session.clone();
            client::devtools_in(
                &b,
                &session,
                "Runtime.evaluate",
                json!({ "expression": script, "awaitPromise": true }),
                move |ok, r| {
                    if !ok || r.get("exceptionDetails").is_some() {
                        eprintln!("redrob-browser: extension action: {r}");
                    }
                    client::devtools_send(
                        &b2,
                        "Target.detachFromTarget",
                        json!({ "sessionId": s2 }),
                    );
                },
            );
        },
    );
}

/// Runs first in an extension's popup page: Chrome answers "the current
/// window" there with the window the popup belongs to, the page's
/// (`window`, `Browser.getWindowForTarget` of the page). In the window the
/// popup is a page of its own, so its own window would be the answer.
/// The window runs it with the page stopped before its first script
/// (cdp.rs).
pub fn popup_script(window: i64) -> String {
    format!(
        r#"{WINDOW_TYPES}
(() => {{
  const W = {window};
  let done = false;
  const apply = () => {{
    const c = globalThis.chrome;
    if (done || !c || !c.tabs || !c.tabs.query) return;
    done = true;
    const t = c.tabs, w = c.windows;
    const query = t.query.bind(t);
    t.query = (q, cb) => {{
      q = Object.assign({{}}, q);
      if (q.currentWindow || q.lastFocusedWindow) {{
        delete q.currentWindow;
        delete q.lastFocusedWindow;
        q.windowId = W;
      }}
      return cb ? query(q, cb) : query(q);
    }};
    if (w && w.get) {{
      const get = w.get.bind(w);
      const current = (o, cb) => {{
        if (typeof o === 'function') {{ cb = o; o = {{}}; }}
        return cb ? get(W, o || {{}}, cb) : get(W, o || {{}});
      }};
      w.getCurrent = current;
      w.getLastFocused = current;
    }}
  }};
  apply();
}})();"#
    )
}
