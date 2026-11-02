//! Chrome's extensions in the window's toolbar (docs/CHROME-FEATURES.md).
//!
//! A Chrome style page is a Chrome browser without a toolbar, so Chrome has
//! nowhere to draw extension icons and will not open an action's popup
//! ("Browser window has no toolbar"). `Extensions.triggerAction` crashes
//! it: Chromium takes the browser's `ExtensionsContainer`, which only
//! Chrome's toolbar registers, without checking for null (CEF hosts a page
//! with a parent window in a popup-type Chrome browser with no toolbar, and
//! allows one Chrome browser per CEF window). The window draws them
//! instead:
//! - [`refresh`] reads the installed extensions from the profile (Chrome's
//!   own `extensions.settings`, each extension's manifest) and Chrome's own
//!   pin list, which [`set_pinned`] changes, so chrome://extensions and the
//!   toolbar agree;
//! - a click runs the extension's action on the page on screen: its popup
//!   page opens over the page, under the icon (cdp.rs), with
//!   [`popup_script`] so `chrome.tabs.query({currentWindow})` finds that
//!   page; an action without a popup has its `onClicked` listeners run in
//!   its service worker ([`run_action`]);
//! - each icon carries the extension's badge for the tab on screen
//!   ([`badge`]), read from its running contexts ([`poll_badges`]).

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
    static POLLING: std::sync::Once = std::sync::Once::new();
    POLLING.call_once(badge_loop);
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
/// would also grant the extension `activeTab` on the page; every Chromium
/// path to that grant goes through the toolbar's `ExtensionsContainer`,
/// which these pages do not have (module comment), so an extension that
/// relies on `activeTab` alone for the click is told the page is out of its
/// reach.
pub fn run_action(browser: &Browser, id: &str) {
    if crate::cef::host::hosts(browser) {
        trigger(browser, id);
        return;
    }
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
                "{WINDOW_TYPES} ({BADGE_JS})(true); (async () => {{ const a = chrome.action || chrome.browserAction; \
             const [t] = await chrome.tabs.query({{ windowId: {window} }}); \
             if (t && a) a.onClicked.dispatch(t); return !!t; }})()"
            );
            in_worker(b, id, script);
        },
    );
}

/// Chrome runs extension `id`'s action on `browser`'s page, as a click on
/// its own toolbar icon does: the extension gets `activeTab` on the page
/// and its `onClicked` listeners the page's tab. The page is a Chrome
/// browser with Chrome's (hidden) toolbar, which holds the actions
/// (cef/host.rs). `Extensions.triggerAction` names the page by its "tab"
/// DevTools target, found here by the Chrome window it is in.
fn trigger(browser: &Browser, id: &str) {
    let id = id.to_string();
    let b = browser.clone();
    let url = browser
        .main_frame()
        .map(|f| super::text(&f.url()))
        .unwrap_or_default();
    client::devtools(
        browser,
        "Browser.getWindowForTarget",
        json!({}),
        move |_, r| {
            let Some(window) = r["windowId"].as_i64() else {
                eprintln!("redrob-browser: extension action: the page has no window");
                return;
            };
            let b2 = b.clone();
            client::devtools(
                &b,
                "Target.getTargets",
                json!({ "filter": [{ "type": "tab" }] }),
                move |_, r| {
                    let mut tabs: Vec<(bool, String)> = r["targetInfos"]
                        .as_array()
                        .map(|all| {
                            all.iter()
                                .filter_map(|t| {
                                    let same = t["url"].as_str() == Some(url.as_str());
                                    Some((!same, t["targetId"].as_str()?.to_string()))
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    // Tabs showing the page's address first: usually the one.
                    tabs.sort();
                    let tabs = tabs.into_iter().map(|(_, t)| t).collect();
                    tab_in_window(b2, tabs, window, move |b, tab| match tab {
                        Some(tab) => trigger_on(b, id, tab),
                        None => eprintln!("redrob-browser: extension action: no tab target"),
                    });
                },
            );
        },
    );
}

/// The first of the "tab" targets `tabs` in Chrome window `window`.
fn tab_in_window(
    browser: Browser,
    mut tabs: Vec<String>,
    window: i64,
    then: impl FnOnce(Browser, Option<String>) + 'static,
) {
    if tabs.is_empty() {
        then(browser, None);
        return;
    }
    let tab = tabs.remove(0);
    let b = browser.clone();
    client::devtools(
        &browser,
        "Browser.getWindowForTarget",
        json!({ "targetId": tab }),
        move |_, r| {
            if r["windowId"].as_i64() == Some(window) {
                then(b, Some(tab));
            } else {
                tab_in_window(b, tabs, window, then);
            }
        },
    );
}

fn trigger_on(browser: Browser, id: String, tab: String) {
    let params = json!({ "id": id, "targetId": tab });
    let b = browser.clone();
    client::devtools(
        &browser,
        "Extensions.triggerAction",
        params.clone(),
        move |ok, r| {
            if ok {
                return;
            }
            // The domain answers on the browser's own session only: ask
            // there.
            let b2 = b.clone();
            client::devtools(
                &b,
                "Target.attachToBrowserTarget",
                json!({}),
                move |_, s| {
                    let Some(session) = s["sessionId"].as_str().map(str::to_string) else {
                        eprintln!("redrob-browser: extension action: {r}");
                        return;
                    };
                    let (b3, s2) = (b2.clone(), session.clone());
                    client::devtools_in(
                        &b2,
                        &session,
                        "Extensions.triggerAction",
                        params,
                        move |ok, r| {
                            if !ok {
                                eprintln!("redrob-browser: extension action: {r}");
                            }
                            client::devtools_send(
                                &b3,
                                "Target.detachFromTarget",
                                json!({ "sessionId": s2 }),
                            );
                        },
                    );
                },
            );
        },
    );
}

/// Before extension `id`'s popup opens: its background, which answers the
/// popup's questions about "the active tab", finds the page's tab
/// ([`WINDOW_TYPES`]).
pub fn prepare_popup(browser: &Browser, id: &str) {
    in_worker(
        browser.clone(),
        id.to_string(),
        format!("{WINDOW_TYPES} ({BADGE_JS})(true);"),
    );
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
    in_worker_then(browser, id, script, |r| {
        if r.is_none() {
            eprintln!("redrob-browser: extension action failed");
        }
    });
}

/// [`in_worker`]; `then` gets the script's value, None when it could not
/// run.
fn in_worker_then(
    browser: Browser,
    id: String,
    script: String,
    then: impl FnOnce(Option<Value>) + 'static,
) {
    let scope = format!("chrome-extension://{id}/");
    let b = browser.clone();
    find_worker(&browser, scope.clone(), move |target| match target {
        Some(t) => attach_and_eval(b, t, script, then),
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
                            Some(t) => attach_and_eval(b3, t, script, then),
                            None => {
                                eprintln!("redrob-browser: extension {id}: no background");
                                then(None);
                            }
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

/// Evaluate `script` in DevTools target `target` (attached for the call
/// only); `then` gets its value, None when it failed.
fn attach_and_eval(
    browser: Browser,
    target: String,
    script: String,
    then: impl FnOnce(Option<Value>) + 'static,
) {
    let b = browser.clone();
    client::devtools(
        &browser,
        "Target.attachToTarget",
        json!({ "targetId": target, "flatten": true }),
        move |_, r| {
            let Some(session) = r["sessionId"].as_str().map(str::to_string) else {
                then(None);
                return;
            };
            let b2 = b.clone();
            let s2 = session.clone();
            client::devtools_in(
                &b,
                &session,
                "Runtime.evaluate",
                json!({ "expression": script, "awaitPromise": true, "returnByValue": true }),
                move |ok, r| {
                    client::devtools_send(
                        &b2,
                        "Target.detachFromTarget",
                        json!({ "sessionId": s2 }),
                    );
                    if !ok || r.get("exceptionDetails").is_some() {
                        eprintln!("redrob-browser: extension script: {r}");
                        then(None);
                    } else {
                        then(Some(r["result"]["value"].clone()));
                    }
                },
            );
        },
    );
}

/// What the toolbar draws over an extension's icon for a tab: Chrome's
/// badge (`chrome.action.setBadgeText`, `setBadgeBackgroundColor`,
/// `setBadgeTextColor`). A color with alpha 0 is unset: Chrome's default
/// background, text in the color that contrasts most with it.
#[derive(Clone, Debug, PartialEq)]
pub struct Badge {
    pub text: String,
    pub background: [u8; 4],
    pub color: [u8; 4],
}

/// One value an extension set, and when (ms since the epoch).
type Stamped<T> = Option<(T, f64)>;

/// An extension's badge values for one Chrome window (each page of ours is
/// a window of its own with one tab) or its default ("d").
#[derive(Clone, Debug, Default, PartialEq)]
struct Values {
    /// None inside: cleared for the tab, the default shows.
    text: Stamped<Option<String>>,
    background: Stamped<[u8; 4]>,
    color: Stamped<[u8; 4]>,
}

#[derive(Default)]
struct Badges {
    /// Extension id -> "d" or "w<windowId>" -> values.
    values: std::collections::HashMap<String, std::collections::HashMap<String, Values>>,
    /// Our tab -> its Chrome window id.
    windows: std::collections::HashMap<crate::model::TabId, i64>,
    /// Our tab -> when its page last committed a new document: Chrome
    /// clears a tab's own badge values then.
    loaded: std::collections::HashMap<crate::model::TabId, f64>,
    /// A read of the extensions' badges is under way, since then.
    busy: Option<std::time::Instant>,
    /// Extensions whose worker reported its badges since the window
    /// started: the rest are woken once to (Chrome keeps the badge an
    /// extension set while its worker sleeps).
    known: std::collections::HashSet<String>,
}

fn badges() -> &'static Mutex<Badges> {
    static B: std::sync::OnceLock<Mutex<Badges>> = std::sync::OnceLock::new();
    B.get_or_init(Mutex::default)
}

fn now_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

/// Our tab `tab` is Chrome window `window`.
pub fn set_window(tab: crate::model::TabId, window: i64) {
    if let Ok(mut b) = badges().lock() {
        b.windows.insert(tab, window);
    }
}

/// Tab `tab` committed a new document.
pub fn page_loaded(tab: crate::model::TabId) {
    if let Ok(mut b) = badges().lock() {
        b.loaded.insert(tab, now_ms());
    }
}

/// Tab `tab` closed.
pub fn forget_tab(tab: crate::model::TabId) {
    if let Ok(mut b) = badges().lock() {
        b.windows.remove(&tab);
        b.loaded.remove(&tab);
    }
}

/// Extension `id`'s badge on tab `tab`, None when it shows none.
pub fn badge(id: &str, tab: crate::model::TabId) -> Option<Badge> {
    let b = badges().lock().ok()?;
    let all = b.values.get(id)?;
    let default = all.get("d").cloned().unwrap_or_default();
    let own = b
        .windows
        .get(&tab)
        .and_then(|w| all.get(&format!("w{w}")))
        .cloned()
        .unwrap_or_default();
    effective(&default, &own, b.loaded.get(&tab).copied().unwrap_or(0.0))
}

/// The badge from the default values and the tab's own, which count only
/// when set since its page loaded (`since`).
fn effective(default: &Values, own: &Values, since: f64) -> Option<Badge> {
    let fresh = |at: f64| at >= since;
    let text = match &own.text {
        Some((Some(t), at)) if fresh(*at) => t.clone(),
        _ => default
            .text
            .as_ref()
            .and_then(|(t, _)| t.clone())
            .unwrap_or_default(),
    };
    if text.is_empty() {
        return None;
    }
    let pick = |own: &Stamped<[u8; 4]>, default: &Stamped<[u8; 4]>| match own {
        Some((c, at)) if fresh(*at) => *c,
        _ => default.map(|(c, _)| c).unwrap_or([0; 4]),
    };
    Some(Badge {
        text,
        background: pick(&own.background, &default.background),
        color: pick(&own.color, &default.color),
    })
}

/// Fold what an extension context reported (`report`, BADGE_JS's JSON)
/// into extension `id`'s values; true when anything changed.
fn merge(id: &str, report: &Value) -> bool {
    let Some(items) = report.as_object() else {
        return false;
    };
    let Ok(mut b) = badges().lock() else {
        return false;
    };
    let all = b.values.entry(id.to_string()).or_default();
    let mut changed = false;
    for (key, fields) in items {
        let v = all.entry(key.clone()).or_default();
        let before = v.clone();
        let stamp = |f: &str| {
            let pair = fields.get(f)?.as_array()?;
            Some((pair.first()?.clone(), pair.get(1)?.as_f64()?))
        };
        let newer = |old: Option<f64>, at: f64| old.is_none_or(|o| at >= o);
        if let Some((t, at)) = stamp("text") {
            if newer(v.text.as_ref().map(|x| x.1), at) {
                v.text = Some((t.as_str().map(str::to_string), at));
            }
        }
        for (f, slot) in [("bg", &mut v.background), ("fg", &mut v.color)] {
            if let Some((c, at)) = stamp(f) {
                if let Some(c) = rgba(&c) {
                    if newer(slot.map(|x| x.1), at) {
                        *slot = Some((c, at));
                    }
                }
            }
        }
        changed |= *v != before;
    }
    changed
}

/// `[r, g, b, a]` as Chrome's getBadge*Color answers.
fn rgba(v: &Value) -> Option<[u8; 4]> {
    let a = v.as_array()?;
    if a.len() != 4 {
        return None;
    }
    let mut out = [0u8; 4];
    for (o, x) in out.iter_mut().zip(a) {
        *o = x.as_u64()?.min(255) as u8;
    }
    Some(out)
}

/// Read every running context of the installed extensions (workers, popups,
/// their own pages) for badge changes, without waking any. Call on CEF's UI
/// thread, about once a second; the window draws what [`badge`] answers.
pub fn poll_badges() {
    // Only pinned icons are drawn.
    let ids: Vec<String> = list()
        .iter()
        .filter(|e| e.pinned)
        .map(|e| e.id.clone())
        .collect();
    if ids.is_empty() {
        return;
    }
    {
        let Ok(mut b) = badges().lock() else { return };
        if b.busy
            .is_some_and(|t| t.elapsed() < std::time::Duration::from_secs(5))
        {
            return;
        }
        b.busy = Some(std::time::Instant::now());
    }
    let Some(browser) = crate::cef::any_browser() else {
        done_polling(false);
        return;
    };
    let b = browser.clone();
    client::devtools(&browser, "Target.getTargets", json!({}), move |_, r| {
        let found: Vec<(String, String, bool)> = r["targetInfos"]
            .as_array()
            .map(|all| {
                all.iter()
                    .filter_map(|t| {
                        let url = t["url"].as_str()?;
                        let id = ids.iter().find(|id| {
                            url.strip_prefix("chrome-extension://")
                                .and_then(|u| u.strip_prefix(id.as_str()))
                                .is_some_and(|u| u.starts_with('/'))
                        })?;
                        let worker = match t["type"].as_str()? {
                            "service_worker" | "background_page" => true,
                            "page" => false,
                            _ => return None,
                        };
                        Some((id.clone(), t["targetId"].as_str()?.to_string(), worker))
                    })
                    .collect()
            })
            .unwrap_or_default();
        // Workers report what Chrome kept for them when first read.
        let asleep: Vec<String> = {
            let Ok(mut st) = badges().lock() else {
                return;
            };
            for (id, _, worker) in &found {
                if *worker {
                    st.known.insert(id.clone());
                }
            }
            let asleep: Vec<String> = ids
                .iter()
                .filter(|id| !st.known.contains(*id))
                .cloned()
                .collect();
            st.known.extend(asleep.iter().cloned());
            asleep
        };
        if found.is_empty() && asleep.is_empty() {
            done_polling(false);
            return;
        }
        let left = std::rc::Rc::new(std::cell::Cell::new(found.len() + asleep.len()));
        let changed = std::rc::Rc::new(std::cell::Cell::new(false));
        let reported = move |id: String| {
            let (left, changed) = (left.clone(), changed.clone());
            move |v: Option<Value>| {
                let report = v
                    .and_then(|v| v.as_str().map(str::to_string))
                    .and_then(|s| serde_json::from_str::<Value>(&s).ok());
                if let Some(report) = report {
                    if merge(&id, &report) {
                        changed.set(true);
                    }
                }
                left.set(left.get() - 1);
                if left.get() == 0 {
                    done_polling(changed.get());
                }
            }
        };
        for (id, target, worker) in found {
            let script = format!("({BADGE_JS})({worker})");
            attach_and_eval(b.clone(), target, script, reported(id));
        }
        for id in asleep {
            let script = format!("({BADGE_JS})(true)");
            in_worker_then(b.clone(), id.clone(), script, reported(id));
        }
    });
}

/// [`poll_badges`] once a second, for as long as the window runs.
fn badge_loop() {
    std::thread::spawn(|| loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
        super::on_ui(poll_badges);
    });
}

fn done_polling(changed: bool) {
    if let Ok(mut b) = badges().lock() {
        b.busy = None;
    }
    if changed {
        if let Some(sink) = crate::cef::global_sink() {
            sink.send_global(crate::cdp::Event::Badges);
        }
    }
}

/// Runs in an extension context (its worker with `init` true, its popup
/// and pages): wraps `chrome.action.setBadge*` so each value set is kept
/// with its time, keyed by the tab's window, and returns all of them as
/// JSON. Reading them back is plain JavaScript, so a poll never counts as
/// the extension being busy; only the first run in a worker asks Chrome
/// for the values set before it (`init`).
pub const BADGE_JS: &str = r#"(init) => {
  const c = globalThis.chrome;
  const a = c && (c.action || c.browserAction);
  if (!a || typeof a.setBadgeText !== 'function') return null;
  const call = (o, f, ...args) => new Promise((done) => {
    try { o[f](...args, (v) => { void (c.runtime && c.runtime.lastError); done(v); }); }
    catch (e) { done(undefined); }
  });
  const getters = { text: 'getBadgeText', bg: 'getBadgeBackgroundColor', fg: 'getBadgeTextColor' };
  // Chrome answers this for the blocked-request count it draws itself
  // (declarativeNetRequest's displayActionCountAsBadgeText), not the count.
  const COUNT = '<<declarativeNetRequestActionCount>>';
  const read = (field, tabId) => typeof a[getters[field]] === 'function'
    ? call(a, getters[field], tabId == null ? {} : { tabId }).then((v) => (v === COUNT ? undefined : v))
    : Promise.resolve(undefined);
  let s = globalThis.__redrobBadges;
  const put = (key, field, value, at) => {
    const it = s.items[key] || (s.items[key] = {});
    if (!it[field] || it[field][1] <= at) it[field] = [value, at];
  };
  if (!s) {
    s = globalThis.__redrobBadges = { items: {}, ready: null };
    const keyOf = (tabId) => tabId == null ? Promise.resolve('d')
      : c.tabs && c.tabs.get
        ? call(c.tabs, 'get', tabId).then((t) => (t ? 'w' + t.windowId : null))
        : Promise.resolve(null);
    const setters = { setBadgeText: 'text', setBadgeBackgroundColor: 'bg', setBadgeTextColor: 'fg' };
    for (const [name, field] of Object.entries(setters)) {
      const f = a[name];
      if (typeof f !== 'function') continue;
      const record = (d) => {
        const at = Date.now();
        const tabId = d && typeof d.tabId === 'number' ? d.tabId : null;
        keyOf(tabId).then((key) => {
          if (!key) return;
          if (field === 'text') {
            const t = d ? d.text : undefined;
            put(key, 'text', t == null ? (tabId == null ? '' : null) : String(t), at);
          } else {
            read(field, tabId).then((v) => { if (Array.isArray(v)) put(key, field, v, at); });
          }
        });
      };
      a[name] = function (d, cb) {
        if (typeof cb === 'function') return f.call(this, d, (...r) => { record(d); cb(...r); });
        const p = f.call(this, d);
        if (p && typeof p.then === 'function') return p.then((r) => { record(d); return r; });
        record(d);
        return p;
      };
    }
  }
  if (init && !s.ready) {
    const at = Date.now();
    s.ready = (async () => {
      const def = {};
      for (const f of ['text', 'bg', 'fg']) {
        def[f] = await read(f, null);
        if (def[f] !== undefined) put('d', f, def[f], at);
      }
      const tabs = c.tabs && c.tabs.query ? await call(c.tabs, 'query', {}) : [];
      for (const t of tabs || []) {
        for (const f of ['text', 'bg', 'fg']) {
          const v = await read(f, t.id);
          if (v !== undefined && JSON.stringify(v) !== JSON.stringify(def[f])) put('w' + t.windowId, f, v, at);
        }
      }
    })();
  }
  return Promise.resolve(s.ready).then(() => JSON.stringify(s.items));
}"#;

/// Runs first in an extension's popup page: Chrome answers "the current
/// window" there with the window the popup belongs to, the page's
/// (`window`, `Browser.getWindowForTarget` of the page). In the window the
/// popup is a page of its own, so its own window would be the answer.
/// The window runs it with the page stopped before its first script
/// (cdp.rs).
pub fn popup_script(window: i64) -> String {
    format!(
        r#"{WINDOW_TYPES}
({BADGE_JS})(false);
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
