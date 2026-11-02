//! Chrome's own commands (Chrome style pages, docs/FEATURES.md).
//!
//! A Chrome style page runs inside a Chrome browser of its own that has no
//! tab strip or toolbar: the window draws those. So Chrome's commands that
//! act on tabs and windows (from its keyboard shortcuts, its pages and its
//! dialogs) go to the window instead ([`handler`]), and the window runs the
//! commands that only Chrome has (print preview, save page, task manager,
//! translate, reading mode, cast) on a page with [`run`].

use cef::*;

use crate::cdp::Event;
use crate::cef::keys::Shortcut;
use crate::cef::Sink;

/// Chrome's command ids (`include/cef_command_ids.h`).
pub mod id {
    pub const BACK: i32 = 33000;
    pub const FORWARD: i32 = 33001;
    pub const RELOAD: i32 = 33002;
    pub const HOME: i32 = 33003;
    pub const RELOAD_BYPASSING_CACHE: i32 = 33007;
    pub const RELOAD_CLEARING_CACHE: i32 = 33009;
    pub const NEW_WINDOW: i32 = 34000;
    pub const NEW_INCOGNITO_WINDOW: i32 = 34001;
    pub const CLOSE_WINDOW: i32 = 34012;
    pub const NEW_TAB: i32 = 34014;
    pub const CLOSE_TAB: i32 = 34015;
    pub const SELECT_NEXT_TAB: i32 = 34016;
    pub const SELECT_PREVIOUS_TAB: i32 = 34017;
    pub const SELECT_TAB_0: i32 = 34018;
    pub const SELECT_LAST_TAB: i32 = 34026;
    pub const DUPLICATE_TAB: i32 = 34027;
    pub const RESTORE_TAB: i32 = 34028;
    pub const FULLSCREEN: i32 = 34030;
    pub const EXIT: i32 = 34031;
    pub const MOVE_TAB_NEXT: i32 = 34032;
    pub const MOVE_TAB_PREVIOUS: i32 = 34033;
    pub const BOOKMARK_THIS_TAB: i32 = 35000;
    pub const BOOKMARK_ALL_TABS: i32 = 35001;
    pub const VIEW_SOURCE: i32 = 35002;
    pub const PRINT: i32 = 35003;
    pub const SAVE_PAGE: i32 = 35004;
    pub const SHOW_TRANSLATE: i32 = 35009;
    pub const ROUTE_MEDIA: i32 = 35011;
    pub const QRCODE_GENERATOR: i32 = 35021;
    pub const FIND: i32 = 37000;
    pub const FIND_NEXT: i32 = 37001;
    pub const FIND_PREVIOUS: i32 = 37002;
    pub const ZOOM_PLUS: i32 = 38001;
    pub const ZOOM_NORMAL: i32 = 38002;
    pub const ZOOM_MINUS: i32 = 38003;
    pub const FOCUS_TOOLBAR: i32 = 39000;
    pub const FOCUS_LOCATION: i32 = 39001;
    pub const FOCUS_SEARCH: i32 = 39002;
    pub const FOCUS_MENU_BAR: i32 = 39003;
    pub const FOCUS_NEXT_PANE: i32 = 39004;
    pub const FOCUS_PREVIOUS_PANE: i32 = 39005;
    pub const FOCUS_BOOKMARKS: i32 = 39006;
    pub const OPEN_FILE: i32 = 40000;
    pub const DEV_TOOLS: i32 = 40004;
    pub const DEV_TOOLS_CONSOLE: i32 = 40005;
    pub const TASK_MANAGER: i32 = 40006;
    pub const SHOW_BOOKMARK_BAR: i32 = 40009;
    pub const SHOW_HISTORY: i32 = 40010;
    pub const SHOW_BOOKMARK_MANAGER: i32 = 40011;
    pub const SHOW_DOWNLOADS: i32 = 40012;
    pub const CLEAR_BROWSING_DATA: i32 = 40013;
    pub const OPTIONS: i32 = 40015;
    pub const ABOUT: i32 = 40018;
    pub const HELP_PAGE_VIA_KEYBOARD: i32 = 40019;
    pub const SHOW_APP_MENU: i32 = 40021;
    pub const MANAGE_EXTENSIONS: i32 = 40022;
    pub const DEV_TOOLS_INSPECT: i32 = 40023;
    pub const DISTILL_PAGE: i32 = 40243;
    pub const SHOW_READING_MODE_SIDE_PANEL: i32 = 40273;
    pub const TASK_MANAGER_SHORTCUT: i32 = 40286;
}

/// Run Chrome's command `command` on `browser`'s page, as its menu entry
/// would. Call on CEF's UI thread.
pub fn run(browser: &Browser, command: i32) {
    if let Some(host) = browser.host() {
        host.execute_chrome_command(
            command,
            sys::cef_window_open_disposition_t::CEF_WOD_CURRENT_TAB.into(),
        );
    }
}

/// What the window does for one of Chrome's commands instead of Chrome.
#[derive(Debug, PartialEq, Eq)]
pub enum Instead {
    /// The window's shortcut of the same name.
    Shortcut(Shortcut),
    /// A page in a new tab of the window.
    Open(&'static str),
    /// The page's source in a new tab.
    ViewSource,
    /// Nothing: the window has its own (its tab strip, its menu) or none.
    Nothing,
}

/// What the window does instead of Chrome for `command`; `None` lets Chrome
/// run it (print preview, save page, task manager, translate, ...).
pub fn instead(command: i32) -> Option<Instead> {
    use id::*;
    use Instead::*;
    Some(match command {
        NEW_TAB => Shortcut(crate::cef::keys::Shortcut::NewTab),
        CLOSE_TAB => Shortcut(crate::cef::keys::Shortcut::CloseTab),
        RESTORE_TAB => Shortcut(crate::cef::keys::Shortcut::ReopenTab),
        NEW_WINDOW => Shortcut(crate::cef::keys::Shortcut::NewWindow),
        NEW_INCOGNITO_WINDOW => Shortcut(crate::cef::keys::Shortcut::NewIncognito),
        FOCUS_LOCATION | FOCUS_SEARCH | FOCUS_TOOLBAR => {
            Shortcut(crate::cef::keys::Shortcut::Address)
        }
        BOOKMARK_THIS_TAB => Shortcut(crate::cef::keys::Shortcut::Bookmark),
        SELECT_NEXT_TAB => Shortcut(crate::cef::keys::Shortcut::NextTab),
        SELECT_PREVIOUS_TAB => Shortcut(crate::cef::keys::Shortcut::PrevTab),
        MOVE_TAB_NEXT => Shortcut(crate::cef::keys::Shortcut::MoveTabRight),
        MOVE_TAB_PREVIOUS => Shortcut(crate::cef::keys::Shortcut::MoveTabLeft),
        SHOW_HISTORY => Shortcut(crate::cef::keys::Shortcut::History),
        DEV_TOOLS | DEV_TOOLS_CONSOLE | DEV_TOOLS_INSPECT => {
            Shortcut(crate::cef::keys::Shortcut::DevTools)
        }
        FIND => Shortcut(crate::cef::keys::Shortcut::Find),
        FIND_NEXT => Shortcut(crate::cef::keys::Shortcut::FindNext),
        FIND_PREVIOUS => Shortcut(crate::cef::keys::Shortcut::FindPrev),
        ZOOM_PLUS => Shortcut(crate::cef::keys::Shortcut::ZoomIn),
        ZOOM_MINUS => Shortcut(crate::cef::keys::Shortcut::ZoomOut),
        ZOOM_NORMAL => Shortcut(crate::cef::keys::Shortcut::ZoomReset),
        BACK => Shortcut(crate::cef::keys::Shortcut::Back),
        FORWARD => Shortcut(crate::cef::keys::Shortcut::Forward),
        RELOAD | RELOAD_BYPASSING_CACHE | RELOAD_CLEARING_CACHE => {
            Shortcut(crate::cef::keys::Shortcut::Reload)
        }
        SHOW_DOWNLOADS => Open("chrome://downloads/"),
        OPTIONS => Open("chrome://settings/"),
        CLEAR_BROWSING_DATA => Open("chrome://settings/clearBrowserData"),
        MANAGE_EXTENSIONS => Open("chrome://extensions/"),
        SHOW_BOOKMARK_MANAGER => Open("chrome://bookmarks/"),
        ABOUT | HELP_PAGE_VIA_KEYBOARD => Open("chrome://settings/help"),
        VIEW_SOURCE => ViewSource,
        CLOSE_WINDOW | EXIT | FULLSCREEN | SHOW_APP_MENU | FOCUS_MENU_BAR | FOCUS_NEXT_PANE
        | FOCUS_PREVIOUS_PANE | FOCUS_BOOKMARKS | SHOW_BOOKMARK_BAR | DUPLICATE_TAB
        | BOOKMARK_ALL_TABS | HOME => Nothing,
        c if (SELECT_TAB_0..=SELECT_LAST_TAB).contains(&c) => Nothing,
        _ => return None,
    })
}

wrap_command_handler! {
    struct Commands {
        sink: Sink,
    }

    impl CommandHandler {
        fn on_chrome_command(
            &self,
            browser: Option<&mut Browser>,
            command_id: ::std::os::raw::c_int,
            _disposition: WindowOpenDisposition,
        ) -> ::std::os::raw::c_int {
            let Some(browser) = browser else { return 0 };
            let Some(what) = instead(command_id) else {
                return 0;
            };
            let id = browser.identifier();
            match what {
                Instead::Shortcut(s) => self.sink.send(id, Event::Shortcut(s)),
                Instead::Open(url) => self.sink.send(id, Event::OpenTab(url.to_string())),
                Instead::ViewSource => {
                    if let Some(f) = browser.main_frame() {
                        let url = super::text(&f.url());
                        self.sink.send(id, Event::OpenTab(format!("view-source:{url}")));
                    }
                }
                Instead::Nothing => {}
            }
            1
        }

        fn is_chrome_app_menu_item_visible(
            &self,
            _browser: Option<&mut Browser>,
            _command_id: ::std::os::raw::c_int,
        ) -> ::std::os::raw::c_int {
            1
        }

        fn is_chrome_app_menu_item_enabled(
            &self,
            _browser: Option<&mut Browser>,
            _command_id: ::std::os::raw::c_int,
        ) -> ::std::os::raw::c_int {
            1
        }

        fn is_chrome_page_action_icon_visible(
            &self,
            _icon_type: ChromePageActionIconType,
        ) -> ::std::os::raw::c_int {
            1
        }

        fn is_chrome_toolbar_button_visible(
            &self,
            _button_type: ChromeToolbarButtonType,
        ) -> ::std::os::raw::c_int {
            1
        }
    }
}

/// The tab's command handler.
pub fn handler(sink: Sink) -> CommandHandler {
    Commands::new(sink)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tab_and_window_commands_go_to_the_window() {
        assert_eq!(
            instead(id::NEW_TAB),
            Some(Instead::Shortcut(Shortcut::NewTab))
        );
        assert_eq!(
            instead(id::RESTORE_TAB),
            Some(Instead::Shortcut(Shortcut::ReopenTab))
        );
        assert_eq!(instead(id::SELECT_TAB_0 + 3), Some(Instead::Nothing));
        assert_eq!(
            instead(id::OPTIONS),
            Some(Instead::Open("chrome://settings/"))
        );
        assert_eq!(instead(id::VIEW_SOURCE), Some(Instead::ViewSource));
    }

    #[test]
    fn chrome_only_commands_stay_with_chrome() {
        for c in [
            id::PRINT,
            id::SAVE_PAGE,
            id::TASK_MANAGER,
            id::SHOW_TRANSLATE,
            id::ROUTE_MEDIA,
            id::OPEN_FILE,
            id::SHOW_READING_MODE_SIDE_PANEL,
        ] {
            assert_eq!(instead(c), None, "{c}");
        }
    }
}
