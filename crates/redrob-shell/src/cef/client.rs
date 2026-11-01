//! The CEF client of every tab: its render, display, load, life-span and
//! focus handlers, which turn what Chromium does into `cdp::Event`s, and the
//! DevTools protocol session the window keeps on each tab.

use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::atomic::{AtomicI32, AtomicU64, Ordering};

use cef::{
    rc::Rc as _, sys, wrap_client, wrap_dev_tools_message_observer, wrap_display_handler,
    wrap_focus_handler, wrap_life_span_handler, wrap_load_handler, Browser, BrowserSettings,
    CefString, Client, CursorInfo, CursorType, DevToolsMessageObserver, DictionaryValue,
    DisplayHandler, FocusHandler, FocusSource, Frame, ImplBrowser, ImplBrowserHost, ImplClient,
    ImplDevToolsMessageObserver, ImplDisplayHandler, ImplFocusHandler,
    ImplLifeSpanHandler, ImplLoadHandler, LifeSpanHandler, LoadHandler, LogSeverity,
    PopupFeatures, Registration, RenderHandler, WindowInfo, WindowOpenDisposition,
    WrapClient, WrapDevToolsMessageObserver, WrapDisplayHandler, WrapFocusHandler,
    WrapLifeSpanHandler, WrapLoadHandler,
};
use serde_json::{json, Value};

use super::osr::{self, Gpu, SharedView};
use super::Sink;
use crate::cdp::Event;
use crate::model::TabId;

/// Tab ids for pages a page opened itself (popups, `target=_blank`), far
/// above the ones the window hands out.
static NEXT_POPUP: AtomicU64 = AtomicU64::new(1 << 40);

/// What every handler of one tab shares.
#[derive(Clone)]
pub struct TabCtx {
    pub tab: TabId,
    pub sink: Sink,
    pub view: SharedView,
    pub gpu: Option<Gpu>,
}

/// A browser CEF has just created, for the window's engine to adopt.
pub struct Created {
    pub tab: TabId,
    pub browser: Browser,
    pub view: SharedView,
    /// Keeps the tab's DevTools session listening.
    pub devtools: Option<Registration>,
    /// Set for a page another page opened.
    pub popup: bool,
}

thread_local! {
    static CREATED: RefCell<Vec<Created>> = const { RefCell::new(Vec::new()) };
    static CLOSED: RefCell<Vec<TabId>> = const { RefCell::new(Vec::new()) };
    static PENDING: RefCell<HashMap<i32, Reply>> = RefCell::new(HashMap::new());
    /// Popups CEF announced and has not created yet, by popup id.
    static POPUPS: RefCell<HashMap<i32, TabId>> = RefCell::new(HashMap::new());
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

/// The window settings for an off-screen page.
pub fn window_info(shared_texture: bool) -> WindowInfo {
    WindowInfo {
        windowless_rendering_enabled: 1,
        shared_texture_enabled: shared_texture as _,
        // Alloy style: the only one that renders off screen.
        runtime_style: sys::cef_runtime_style_t::CEF_RUNTIME_STYLE_ALLOY.into(),
        ..Default::default()
    }
}

pub fn browser_settings() -> BrowserSettings {
    BrowserSettings {
        windowless_frame_rate: 60,
        background_color: 0xFFFF_FFFF,
        ..Default::default()
    }
}

pub fn new(ctx: TabCtx) -> Client {
    TabClient::new(
        osr::handler(ctx.view.clone(), ctx.tab, ctx.sink.clone(), ctx.gpu.clone()),
        Display::new(ctx.clone()),
        Load::new(ctx.clone()),
        LifeSpan::new(ctx.clone()),
        Focus::new(),
    )
}

wrap_client! {
    struct TabClient {
        render: RenderHandler,
        display: DisplayHandler,
        load: LoadHandler,
        life_span: LifeSpanHandler,
        focus: FocusHandler,
    }

    impl Client {
        fn render_handler(&self) -> Option<RenderHandler> {
            Some(self.render.clone())
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
    }
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

        fn on_status_message(&self, _browser: Option<&mut Browser>, value: Option<&CefString>) {
            let v = text(value);
            osr::lock(&self.ctx.view).status = (!v.is_empty()).then_some(v);
            self.ctx.sink.repaint(self.ctx.tab);
        }

        fn on_tooltip(&self, _browser: Option<&mut Browser>, value: Option<&mut CefString>) -> ::std::os::raw::c_int {
            let v = value.map(|s| s.to_string()).unwrap_or_default();
            osr::lock(&self.ctx.view).tooltip = (!v.is_empty()).then_some(v);
            self.ctx.sink.repaint(self.ctx.tab);
            1
        }

        fn on_console_message(
            &self,
            _browser: Option<&mut Browser>,
            level: LogSeverity,
            message: Option<&CefString>,
            _source: Option<&CefString>,
            _line: ::std::os::raw::c_int,
        ) -> ::std::os::raw::c_int {
            use sys::cef_log_severity_t as L;
            let level = match *level.as_ref() {
                L::LOGSEVERITY_ERROR | L::LOGSEVERITY_FATAL => "error",
                L::LOGSEVERITY_WARNING => "warning",
                L::LOGSEVERITY_INFO => "info",
                L::LOGSEVERITY_VERBOSE => "debug",
                _ => "log",
            };
            self.ctx.sink.send_tab(
                self.ctx.tab,
                Event::Console {
                    level: level.to_string(),
                    text: text(message),
                },
            );
            // Not on the window's own standard error.
            1
        }

        fn on_cursor_change(
            &self,
            _browser: Option<&mut Browser>,
            _cursor: ::std::os::raw::c_ulong,
            type_: CursorType,
            _custom_cursor_info: Option<&CursorInfo>,
        ) -> ::std::os::raw::c_int {
            osr::lock(&self.ctx.view).cursor = osr::cursor_icon(*type_.as_ref());
            self.ctx.sink.repaint(self.ctx.tab);
            1
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
            let view = SharedView::default();
            {
                // The opener's page size until its window says otherwise.
                let opener = osr::lock(&self.ctx.view);
                let mut v = osr::lock(&view);
                v.width = opener.width;
                v.height = opener.height;
                v.scale = opener.scale;
                v.origin = opener.origin;
            }
            let ctx = TabCtx {
                tab,
                sink: self.ctx.sink.clone(),
                view,
                gpu: self.ctx.gpu.clone(),
            };
            *window_info = self::window_info(window_info.shared_texture_enabled == 1);
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
            let devtools = browser.host().and_then(|host| {
                host.add_dev_tools_message_observer(Some(&mut Observer::new(self.ctx.clone())))
            });
            let popup = self.ctx.tab >= 1 << 40;
            let tab = self.ctx.tab;
            POPUPS.with_borrow_mut(|p| p.retain(|_, t| *t != tab));
            CREATED.with_borrow_mut(|c| {
                c.push(Created {
                    tab: self.ctx.tab,
                    browser: browser.clone(),
                    view: self.ctx.view.clone(),
                    devtools,
                    popup,
                })
            });
            self.ctx.sink.repaint(self.ctx.tab);
        }

        fn do_close(&self, _browser: Option<&mut Browser>) -> ::std::os::raw::c_int {
            // `window.close()`, or the window closing the tab: let it close
            // and tell the window, which removes the tab if it still shows it.
            self.ctx.sink.send_tab(self.ctx.tab, Event::Closed);
            0
        }

        fn on_before_close(&self, browser: Option<&mut Browser>) {
            if let Some(b) = browser {
                self.ctx.sink.unbind(b.identifier());
            }
            CLOSED.with_borrow_mut(|c| c.push(self.ctx.tab));
        }
    }
}

wrap_focus_handler! {
    struct Focus;

    impl FocusHandler {
        fn on_set_focus(&self, _browser: Option<&mut Browser>, _source: FocusSource) -> ::std::os::raw::c_int {
            0
        }
    }
}

/// Unique DevTools message ids across every tab.
static NEXT_MESSAGE: AtomicI32 = AtomicI32::new(1);

/// Call a DevTools protocol method on `browser`'s page; `reply` gets
/// (success, result) on the window thread.
pub fn devtools(browser: &Browser, method: &str, params: Value, reply: impl FnOnce(bool, Value) + 'static) {
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
            if let Some(reply) = PENDING.with_borrow_mut(|p| p.remove(&message_id)) {
                reply(success == 1, value);
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
