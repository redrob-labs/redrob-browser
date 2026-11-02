//! The CEF client of every tab: its display, load, life-span, focus and
//! keyboard handlers, which turn what Chromium does into `cdp::Event`s, and the
//! DevTools protocol session the window keeps on each tab.

use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::atomic::{AtomicI32, AtomicU64, Ordering};

use cef::{
    rc::Rc as _, sys, wrap_client, wrap_dev_tools_message_observer, wrap_display_handler,
    wrap_focus_handler, wrap_life_span_handler, wrap_load_handler, Browser, BrowserSettings,
    CefString, Client, CommandHandler, ContextMenuHandler, DevToolsMessageObserver,
    DictionaryValue, DisplayHandler, DownloadHandler, FindHandler, FocusHandler, FocusSource,
    Frame, ImplBrowser, ImplBrowserHost, ImplClient, ImplDevToolsMessageObserver,
    ImplDisplayHandler, ImplFocusHandler, ImplFrame, ImplLifeSpanHandler, ImplLoadHandler,
    JsdialogHandler, KeyboardHandler, LifeSpanHandler, LoadHandler, PermissionHandler,
    PopupFeatures, Registration, RequestHandler, WindowInfo, WindowOpenDisposition, WrapClient,
    WrapDevToolsMessageObserver, WrapDisplayHandler, WrapFocusHandler, WrapLifeSpanHandler,
    WrapLoadHandler,
};
use serde_json::{json, Value};

use super::native::{self, Place};
use super::{handlers, keys, Sink};
use crate::cdp::Event;
use crate::model::TabId;

/// Tab ids for pages a page opened itself (popups, `target=_blank`), far
/// above the ones the window hands out.
static NEXT_POPUP: AtomicU64 = AtomicU64::new(1 << 40);

/// A tab id of the same kind for a page the window opens over a tab (an
/// extension's popup).
pub fn next_popup_tab() -> TabId {
    NEXT_POPUP.fetch_add(1, Ordering::SeqCst)
}

/// What every handler of one tab shares.
#[derive(Clone)]
pub struct TabCtx {
    pub tab: TabId,
    pub sink: Sink,
}

/// A browser CEF has just created, for the window's engine to adopt.
pub struct Created {
    pub tab: TabId,
    pub browser: Browser,
    pub ctx: TabCtx,
}

impl Created {
    /// Listen to the tab's DevTools session; keep the registration.
    pub fn observe(&self) -> Option<Registration> {
        self.browser.host().and_then(|host| {
            host.add_dev_tools_message_observer(Some(&mut Observer::new(self.ctx.clone())))
        })
    }
}

thread_local! {
    static CREATED: RefCell<Vec<Created>> = const { RefCell::new(Vec::new()) };
    static CLOSED: RefCell<Vec<TabId>> = const { RefCell::new(Vec::new()) };
    static PENDING: RefCell<HashMap<i32, Reply>> = RefCell::new(HashMap::new());
    /// DevTools replies waiting for the window loop (`run_replies`).
    static READY: RefCell<Vec<(Reply, bool, Value)>> = const { RefCell::new(Vec::new()) };
    /// Popups CEF announced and has not created yet, by popup id.
    static POPUPS: RefCell<HashMap<i32, TabId>> = RefCell::new(HashMap::new());
    /// Where each tab's page sits (the engine keeps it current), so a
    /// page a tab opens is born in the same window.
    static PLACES: RefCell<HashMap<TabId, Place>> = RefCell::new(HashMap::new());
    /// Pages that asked for a size of their own (`set_auto_resize_enabled`),
    /// in points.
    static RESIZED: RefCell<Vec<(TabId, i32, i32)>> = const { RefCell::new(Vec::new()) };
    /// Pages the DevTools debugger paused (`Debugger.paused`).
    static PAUSED: RefCell<Vec<TabId>> = const { RefCell::new(Vec::new()) };
}

/// The browser id of the extension popup open now (cdp.rs), 0 for none.
static POPUP_BROWSER: AtomicI32 = AtomicI32::new(0);
/// Escape was pressed in the extension popup.
static POPUP_ESCAPED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn set_popup_browser(id: i32) {
    POPUP_BROWSER.store(id, Ordering::SeqCst);
}

/// Escape in `browser`'s page: true when it is the extension popup, which
/// Escape closes, as in Chrome.
pub fn popup_escape(browser: i32) -> bool {
    let popup = POPUP_BROWSER.load(Ordering::SeqCst);
    let hit = popup != 0 && popup == browser;
    if hit {
        POPUP_ESCAPED.store(true, Ordering::SeqCst);
    }
    hit
}

/// Whether Escape was pressed in the extension popup since the last call.
pub fn take_popup_escaped() -> bool {
    POPUP_ESCAPED.swap(false, Ordering::SeqCst)
}

/// Pages paused in the debugger since the last call (an extension popup
/// before its first script, cdp.rs).
pub fn take_paused() -> Vec<TabId> {
    PAUSED.with_borrow_mut(std::mem::take)
}

/// Sizes pages asked for since the last call (cef/handlers/extensions.rs).
pub fn take_resized() -> Vec<(TabId, i32, i32)> {
    RESIZED.with_borrow_mut(std::mem::take)
}

/// Where `tab`'s page was made or last placed.
pub fn place_of(tab: TabId) -> Option<Place> {
    PLACES.with_borrow(|p| p.get(&tab).copied())
}

/// Where `tab`'s page sits now; `None` once it closed.
pub fn set_place(tab: TabId, place: Option<Place>) {
    PLACES.with_borrow_mut(|p| match place {
        Some(place) => p.insert(tab, place),
        None => p.remove(&tab),
    });
}

type Reply = Box<dyn FnOnce(bool, Value)>;

/// Browsers created since the last call.
pub fn take_created() -> Vec<Created> {
    CREATED.with_borrow_mut(std::mem::take)
}

/// Tabs whose browser closed since the last call.
pub fn take_closed() -> Vec<TabId> {
    CLOSED.with_borrow_mut(std::mem::take)
}

pub fn browser_settings() -> BrowserSettings {
    BrowserSettings {
        background_color: 0xFFFF_FFFF,
        ..Default::default()
    }
}

pub fn new(ctx: TabCtx) -> Client {
    let f = handlers::features();
    TabClient::new(
        keys::handler(ctx.sink.clone()),
        Display::new(ctx.clone()),
        Load::new(ctx.clone()),
        LifeSpan::new(ctx.clone()),
        Focus::new(ctx.clone()),
        handlers::download::new(ctx.sink.clone(), f.downloads.clone(), false),
        handlers::permission::new(ctx.sink.clone(), f.sites.clone()),
        handlers::jsdialog::new(ctx.sink.clone()),
        handlers::context_menu::new(ctx.sink.clone()),
        handlers::find::new(ctx.sink.clone()),
        handlers::languages::new(ctx.sink.clone()),
        handlers::chrome::handler(ctx.sink.clone()),
    )
}

wrap_client! {
    struct TabClient {
        keyboard: KeyboardHandler,
        display: DisplayHandler,
        load: LoadHandler,
        life_span: LifeSpanHandler,
        focus: FocusHandler,
        download: DownloadHandler,
        permission: PermissionHandler,
        jsdialog: JsdialogHandler,
        context_menu: ContextMenuHandler,
        find: FindHandler,
        request: RequestHandler,
        command: CommandHandler,
    }

    impl Client {
        fn keyboard_handler(&self) -> Option<KeyboardHandler> {
            Some(self.keyboard.clone())
        }
        fn display_handler(&self) -> Option<DisplayHandler> {
            Some(self.display.clone())
        }
        fn load_handler(&self) -> Option<LoadHandler> {
            Some(self.load.clone())
        }
        fn life_span_handler(&self) -> Option<LifeSpanHandler> {
            Some(self.life_span.clone())
        }
        fn focus_handler(&self) -> Option<FocusHandler> {
            Some(self.focus.clone())
        }
        // The features (cef/handlers/).
        fn download_handler(&self) -> Option<DownloadHandler> {
            Some(self.download.clone())
        }
        fn permission_handler(&self) -> Option<PermissionHandler> {
            Some(self.permission.clone())
        }
        fn jsdialog_handler(&self) -> Option<JsdialogHandler> {
            Some(self.jsdialog.clone())
        }
        fn context_menu_handler(&self) -> Option<ContextMenuHandler> {
            Some(self.context_menu.clone())
        }
        fn find_handler(&self) -> Option<FindHandler> {
            Some(self.find.clone())
        }
        fn request_handler(&self) -> Option<RequestHandler> {
            Some(self.request.clone())
        }
        fn command_handler(&self) -> Option<CommandHandler> {
            Some(self.command.clone())
        }
    }
}

/// The client of a browser Chrome opened by itself (Chrome style), outside
/// any window of ours: an extension's welcome page, a chrome:// page's "open
/// in new tab", a download's "show". Its page opens as a tab of the window
/// in front instead, and Chrome's window closes.
pub fn stray_client() -> Client {
    StrayClient::new(Stray::new(std::sync::Arc::default()))
}

wrap_client! {
    struct StrayClient {
        display: DisplayHandler,
    }

    impl Client {
        fn display_handler(&self) -> Option<DisplayHandler> {
            Some(self.display.clone())
        }
    }
}

wrap_display_handler! {
    struct Stray {
        adopted: std::sync::Arc<std::sync::atomic::AtomicBool>,
    }

    impl DisplayHandler {
        fn on_address_change(&self, browser: Option<&mut Browser>, frame: Option<&mut Frame>, url: Option<&CefString>) {
            let (Some(b), Some(f)) = (browser, frame) else { return };
            let url = text(url);
            if f.is_main() != 1 || url.is_empty() || url == "about:blank" {
                return;
            }
            if self.adopted.swap(true, Ordering::SeqCst) {
                return;
            }
            // An empty new tab Chrome opened (its session restore, an
            // install) is not worth a tab.
            let blank = url.starts_with("chrome://newtab") || url.starts_with("chrome://new-tab-page");
            if let (false, Some(sink)) = (blank, super::global_sink()) {
                sink.send_global(Event::ShowTab(url));
            }
            if let Some(host) = b.host() {
                host.close_browser(1);
            }
        }
    }
}

/// The client of a DevTools window: CEF draws it itself, in its own window.
pub fn devtools_client() -> Client {
    DevToolsClient::new()
}

wrap_client! {
    struct DevToolsClient;

    impl Client {}
}

fn text(s: Option<&CefString>) -> String {
    s.map(|s| s.to_string()).unwrap_or_default()
}

wrap_display_handler! {
    struct Display {
        ctx: TabCtx,
    }

    impl DisplayHandler {
        fn on_title_change(&self, _browser: Option<&mut Browser>, title: Option<&CefString>) {
            self.ctx.sink.send_tab(self.ctx.tab, Event::Title(text(title)));
        }

        fn on_address_change(&self, browser: Option<&mut Browser>, frame: Option<&mut Frame>, url: Option<&CefString>) {
            if let (Some(b), Some(f)) = (browser, frame) {
                if f.is_main() == 1 {
                    handlers::on_address_change(&self.ctx.sink, b, &text(url));
                }
            }
        }

        fn on_auto_resize(&self, _browser: Option<&mut Browser>, new_size: Option<&cef::Size>) -> ::std::os::raw::c_int {
            // Only an extension's popup asks (cdp.rs): it is as big as what
            // it draws, as in Chrome.
            if let Some(s) = new_size {
                let tab = self.ctx.tab;
                RESIZED.with_borrow_mut(|r| r.push((tab, s.width, s.height)));
                self.ctx.sink.wake_window();
            }
            1
        }

        fn on_status_message(&self, _browser: Option<&mut Browser>, value: Option<&CefString>) {
            // The link under the pointer, for the window's status bubble.
            let v = text(value);
            self.ctx.sink.send_tab(self.ctx.tab, Event::Status((!v.is_empty()).then_some(v)));
        }
    }
}

wrap_load_handler! {
    struct Load {
        ctx: TabCtx,
    }

    impl LoadHandler {
        fn on_loading_state_change(
            &self,
            _browser: Option<&mut Browser>,
            is_loading: ::std::os::raw::c_int,
            _can_go_back: ::std::os::raw::c_int,
            _can_go_forward: ::std::os::raw::c_int,
        ) {
            self.ctx.sink.send_tab(self.ctx.tab, Event::Loading(is_loading == 1));
        }
    }
}

wrap_life_span_handler! {
    struct LifeSpan {
        ctx: TabCtx,
    }

    impl LifeSpanHandler {
        fn on_before_popup(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut Frame>,
            popup_id: ::std::os::raw::c_int,
            target_url: Option<&CefString>,
            _target_frame_name: Option<&CefString>,
            target_disposition: WindowOpenDisposition,
            _user_gesture: ::std::os::raw::c_int,
            _popup_features: Option<&PopupFeatures>,
            window_info: Option<&mut WindowInfo>,
            client: Option<&mut Option<Client>>,
            settings: Option<&mut BrowserSettings>,
            _extra_info: Option<&mut Option<DictionaryValue>>,
            _no_javascript_access: Option<&mut ::std::os::raw::c_int>,
        ) -> ::std::os::raw::c_int {
            use sys::cef_window_open_disposition_t as D;
            let (Some(window_info), Some(client)) = (window_info, client) else {
                return 1;
            };
            // Every page a page opens is a tab of the window, drawn here.
            let tab = NEXT_POPUP.fetch_add(1, Ordering::SeqCst);
            let ctx = TabCtx {
                tab,
                sink: self.ctx.sink.clone(),
            };
            // A page in the opener's window, hidden until the window shows
            // its tab.
            let Some(place) = PLACES.with_borrow(|p| p.get(&self.ctx.tab).copied()) else {
                return 1;
            };
            PLACES.with_borrow_mut(|p| p.insert(tab, place));
            *window_info = native::child_info(place, false);
            *client = Some(new(ctx));
            if let Some(s) = settings {
                *s = browser_settings();
            }
            let background = *target_disposition.as_ref() == D::CEF_WOD_NEW_BACKGROUND_TAB;
            POPUPS.with_borrow_mut(|p| p.insert(popup_id, tab));
            // Opened goes out now so the events of the new tab find it.
            self.ctx.sink.send_tab(
                tab,
                Event::Opened {
                    url: text(target_url),
                    opener: Some(self.ctx.tab),
                    background,
                },
            );
            0
        }

        fn on_before_popup_aborted(&self, _browser: Option<&mut Browser>, popup_id: ::std::os::raw::c_int) {
            if let Some(tab) = POPUPS.with_borrow_mut(|p| p.remove(&popup_id)) {
                self.ctx.sink.send_tab(tab, Event::Closed);
            }
        }

        fn on_after_created(&self, browser: Option<&mut Browser>) {
            let Some(browser) = browser else { return };
            let id = browser.identifier();
            self.ctx.sink.bind(id, self.ctx.tab);
            super::keep_browser(id, Some(browser));
            let tab = self.ctx.tab;
            POPUPS.with_borrow_mut(|p| p.retain(|_, t| *t != tab));
            CREATED.with_borrow_mut(|c| {
                c.push(Created {
                    tab: self.ctx.tab,
                    browser: browser.clone(),
                    ctx: self.ctx.clone(),
                })
            });
        }

        fn do_close(&self, browser: Option<&mut Browser>) -> ::std::os::raw::c_int {
            // `window.close()`, or the window closing the tab: let it close
            // and tell the window, which removes the tab if it still shows it.
            let _ = browser;
            self.ctx.sink.send_tab(self.ctx.tab, Event::Closed);
            0
        }

        fn on_before_close(&self, browser: Option<&mut Browser>) {
            if let Some(b) = browser {
                self.ctx.sink.unbind(b.identifier());
                super::forget_browser(b.identifier());
                super::keep_browser(b.identifier(), None);
            }
            set_place(self.ctx.tab, None);
            CLOSED.with_borrow_mut(|c| c.push(self.ctx.tab));
        }
    }
}

wrap_focus_handler! {
    struct Focus {
        ctx: TabCtx,
    }

    impl FocusHandler {
        fn on_set_focus(&self, _browser: Option<&mut Browser>, _source: FocusSource) -> ::std::os::raw::c_int {
            0
        }

        fn on_got_focus(&self, _browser: Option<&mut Browser>) {
            // A click in the page, or the window gave it the keyboard.
            self.ctx.sink.send_tab(self.ctx.tab, Event::Focused);
        }

        fn on_take_focus(&self, _browser: Option<&mut Browser>, _next: ::std::os::raw::c_int) {
            // Tab past the page's last field: the toolbar, as in Chrome.
            self.ctx.sink.send_tab(self.ctx.tab, Event::TakeFocus);
        }
    }
}

/// Unique DevTools message ids across every tab.
static NEXT_MESSAGE: AtomicI32 = AtomicI32::new(1);

/// Call a DevTools protocol method on `browser`'s page; `reply` gets
/// (success, result) on the window thread.
pub fn devtools(
    browser: &Browser,
    method: &str,
    params: Value,
    reply: impl FnOnce(bool, Value) + 'static,
) {
    let Some(host) = browser.host() else {
        reply(false, Value::Null);
        return;
    };
    let id = NEXT_MESSAGE.fetch_add(1, Ordering::SeqCst);
    let message = json!({ "id": id, "method": method, "params": params }).to_string();
    PENDING.with_borrow_mut(|p| p.insert(id, Box::new(reply)));
    if host.send_dev_tools_message(Some(message.as_bytes())) != 1 {
        if let Some(r) = PENDING.with_borrow_mut(|p| p.remove(&id)) {
            r(false, Value::Null);
        }
    }
}

/// Run the DevTools replies that arrived; true when there were any.
pub fn run_replies() -> bool {
    let ready = READY.with_borrow_mut(std::mem::take);
    let any = !ready.is_empty();
    for (reply, ok, value) in ready {
        reply(ok, value);
    }
    any
}

/// [`devtools`] in a session `browser`'s page attached to (a worker of an
/// extension, cef/handlers/extensions.rs).
pub fn devtools_in(
    browser: &Browser,
    session: &str,
    method: &str,
    params: Value,
    reply: impl FnOnce(bool, Value) + 'static,
) {
    let Some(host) = browser.host() else {
        reply(false, Value::Null);
        return;
    };
    let id = NEXT_MESSAGE.fetch_add(1, Ordering::SeqCst);
    let message =
        json!({ "id": id, "sessionId": session, "method": method, "params": params }).to_string();
    PENDING.with_borrow_mut(|p| p.insert(id, Box::new(reply)));
    if host.send_dev_tools_message(Some(message.as_bytes())) != 1 {
        if let Some(r) = PENDING.with_borrow_mut(|p| p.remove(&id)) {
            r(false, Value::Null);
        }
    }
}

/// Fire and forget.
pub fn devtools_send(browser: &Browser, method: &str, params: Value) {
    devtools(browser, method, params, |_, _| {});
}

/// The world the window's own page scripts run in, apart from the page's.
pub const WORLD: &str = "redrob";
/// Sign-ins reach the window through this binding (cdp.rs).
pub const LOGIN_BINDING: &str = "redrobLoginSubmit";

wrap_dev_tools_message_observer! {
    struct Observer {
        ctx: TabCtx,
    }

    impl DevToolsMessageObserver {
        fn on_dev_tools_method_result(
            &self,
            _browser: Option<&mut Browser>,
            message_id: ::std::os::raw::c_int,
            success: ::std::os::raw::c_int,
            result: Option<&[u8]>,
        ) {
            let value = result
                .and_then(|r| serde_json::from_slice::<Value>(r).ok())
                .unwrap_or(Value::Null);
            // Run it from the window loop: CEF calls made inside this
            // callback (a navigation, another DevTools call) would re-enter
            // the observer list CEF is walking.
            if let Some(reply) = PENDING.with_borrow_mut(|p| p.remove(&message_id)) {
                READY.with_borrow_mut(|r| r.push((reply, success == 1, value)));
            }
        }

        fn on_dev_tools_event(
            &self,
            _browser: Option<&mut Browser>,
            method: Option<&CefString>,
            params: Option<&[u8]>,
        ) {
            let method = text(method);
            let p = params
                .and_then(|r| serde_json::from_slice::<Value>(r).ok())
                .unwrap_or(Value::Null);
            let (tab, sink) = (self.ctx.tab, &self.ctx.sink);
            match method.as_str() {
                "Page.frameNavigated" => {
                    let frame = &p["frame"];
                    if frame.get("parentId").is_none() {
                        // An error page keeps the address that failed.
                        let url = frame["unreachableUrl"]
                            .as_str()
                            .or(frame["url"].as_str())
                            .unwrap_or_default();
                        sink.send_tab(tab, Event::Navigated(url.to_string()));
                    }
                }
                "Debugger.paused" => {
                    PAUSED.with_borrow_mut(|p| p.push(tab));
                    sink.wake_window();
                }
                "Page.navigatedWithinDocument" => {
                    if let Some(url) = p["url"].as_str() {
                        sink.send_tab(tab, Event::UrlChanged(url.to_string()));
                    }
                }
                "Runtime.bindingCalled" if p["name"] == LOGIN_BINDING => {
                    // The payload carries a password: parse it here and never log it.
                    let payload =
                        zeroize::Zeroizing::new(p["payload"].as_str().unwrap_or_default().to_string());
                    if let Ok(v) = serde_json::from_str::<Value>(&payload) {
                        let password = zeroize::Zeroizing::new(
                            v["password"].as_str().unwrap_or_default().to_string(),
                        );
                        if !password.is_empty() {
                            sink.send_tab(
                                tab,
                                Event::LoginSubmitted {
                                    origin: v["origin"].as_str().unwrap_or_default().to_string(),
                                    username: v["username"].as_str().unwrap_or_default().to_string(),
                                    password,
                                },
                            );
                        }
                    }
                }
                _ => {}
            }
        }
    }
}
