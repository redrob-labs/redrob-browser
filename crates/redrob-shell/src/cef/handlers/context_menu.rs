//! The page's right-click menu, with Chrome's items. CEF says what was
//! clicked (a link, an image, selected text, a text field); the window draws
//! the menu (`Event::ContextMenu`) and the chosen item runs here.

use cef::sys::{cef_context_menu_edit_state_flags_t as E, cef_context_menu_type_flags_t as T};
use cef::*;

use crate::cdp::Event;
use crate::cef::Sink;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Command {
    Back,
    Forward,
    Reload,
    OpenLinkInNewTab,
    SaveLinkAs,
    CopyLinkAddress,
    OpenImageInNewTab,
    SaveImageAs,
    CopyImageAddress,
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    SelectAll,
    Print,
    ViewSource,
    Inspect,
}

impl Command {
    /// The item's text (English; ui.rs translates).
    pub fn label(self) -> &'static str {
        match self {
            Command::Back => "Back",
            Command::Forward => "Forward",
            Command::Reload => "Reload",
            Command::OpenLinkInNewTab => "Open link in new tab",
            Command::SaveLinkAs => "Save link as...",
            Command::CopyLinkAddress => "Copy link address",
            Command::OpenImageInNewTab => "Open image in new tab",
            Command::SaveImageAs => "Save image as...",
            Command::CopyImageAddress => "Copy image address",
            Command::Undo => "Undo",
            Command::Redo => "Redo",
            Command::Cut => "Cut",
            Command::Copy => "Copy",
            Command::Paste => "Paste",
            Command::SelectAll => "Select all",
            Command::Print => "Print...",
            Command::ViewSource => "View page source",
            Command::Inspect => "Inspect",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Entry {
    Item { command: Command, enabled: bool },
    Separator,
}

/// What was under the pointer, as the menu needs it.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Target {
    pub link: String,
    pub image: String,
    pub selection: String,
    pub editable: bool,
    pub can_undo: bool,
    pub can_redo: bool,
    pub can_cut: bool,
    pub can_copy: bool,
    pub can_paste: bool,
    pub can_select_all: bool,
    pub can_back: bool,
    pub can_forward: bool,
}

/// Chrome's items for `t`, in Chrome's order.
pub fn entries(t: &Target) -> Vec<Entry> {
    let item = |command, enabled| Entry::Item { command, enabled };
    let mut out = Vec::new();
    if !t.link.is_empty() {
        out.push(item(Command::OpenLinkInNewTab, true));
        out.push(Entry::Separator);
        out.push(item(Command::SaveLinkAs, true));
        out.push(item(Command::CopyLinkAddress, true));
        out.push(Entry::Separator);
    }
    if !t.image.is_empty() {
        out.push(item(Command::OpenImageInNewTab, true));
        out.push(item(Command::SaveImageAs, true));
        out.push(item(Command::CopyImageAddress, true));
        out.push(Entry::Separator);
    }
    if t.editable {
        out.push(item(Command::Undo, t.can_undo));
        out.push(item(Command::Redo, t.can_redo));
        out.push(Entry::Separator);
        out.push(item(Command::Cut, t.can_cut));
        out.push(item(Command::Copy, t.can_copy));
        out.push(item(Command::Paste, t.can_paste));
        out.push(item(Command::SelectAll, t.can_select_all));
        out.push(Entry::Separator);
    } else if !t.selection.is_empty() {
        out.push(item(Command::Copy, true));
        out.push(Entry::Separator);
    } else if t.link.is_empty() && t.image.is_empty() {
        out.push(item(Command::Back, t.can_back));
        out.push(item(Command::Forward, t.can_forward));
        out.push(item(Command::Reload, true));
        out.push(Entry::Separator);
        out.push(item(Command::Print, true));
        out.push(item(Command::ViewSource, true));
        out.push(Entry::Separator);
    }
    out.push(item(Command::Inspect, true));
    out
}

/// A menu for the window to draw, carried by `Event::ContextMenu`.
pub struct Menu {
    /// Where the click was, in page (CSS) pixels from the page's top left.
    pub at: (i32, i32),
    pub entries: Vec<Entry>,
    target: Target,
    browser: Browser,
    frame: Option<Frame>,
    callback: RunContextMenuCallback,
    sink: Sink,
}

impl Menu {
    /// Run `command`, or close the menu with None.
    pub fn choose(self, command: Option<Command>) {
        let Menu {
            at,
            entries,
            target,
            browser,
            frame,
            callback,
            sink,
        } = self;
        super::on_ui(move || {
            // Everything runs here; Chromium's own handling is not needed.
            callback.cancel();
            let enabled = |c: &Command| {
                entries.contains(&Entry::Item {
                    command: *c,
                    enabled: true,
                })
            };
            let Some(command) = command.filter(enabled) else {
                return;
            };
            run(&sink, &browser, frame.as_ref(), &target, at, command);
        });
    }
}

fn run(sink: &Sink, browser: &Browser, frame: Option<&Frame>, t: &Target, at: (i32, i32), c: Command) {
    let id = browser.identifier();
    let opened = |url: &str| Event::OpenTab(url.to_string());
    let download = |url: &str| {
        if let Some(h) = browser.host() {
            h.start_download(Some(&CefString::from(url)));
        }
    };
    let edit = |f: fn(&Frame)| {
        let target = browser.focused_frame().or_else(|| frame.cloned());
        if let Some(fr) = target {
            f(&fr);
        }
    };
    match c {
        Command::Back => browser.go_back(),
        Command::Forward => browser.go_forward(),
        Command::Reload => browser.reload(),
        Command::OpenLinkInNewTab => sink.send(id, opened(&t.link)),
        Command::SaveLinkAs => download(&t.link),
        Command::CopyLinkAddress => sink.send(id, Event::Clipboard(t.link.clone())),
        Command::OpenImageInNewTab => sink.send(id, opened(&t.image)),
        Command::SaveImageAs => download(&t.image),
        Command::CopyImageAddress => sink.send(id, Event::Clipboard(t.image.clone())),
        Command::Undo => edit(|f| f.undo()),
        Command::Redo => edit(|f| f.redo()),
        // Linux: the window's clipboard, not Chromium's (clipboard.rs).
        Command::Cut if super::clipboard::OWN => super::clipboard::copy(sink, browser, true),
        Command::Copy if super::clipboard::OWN => super::clipboard::copy(sink, browser, false),
        Command::Paste if super::clipboard::OWN => super::clipboard::paste(browser),
        Command::Cut => edit(|f| f.cut()),
        Command::Copy => edit(|f| f.copy()),
        Command::Paste => edit(|f| f.paste()),
        Command::SelectAll => edit(|f| f.select_all()),
        Command::Print => super::print::print(sink, browser),
        Command::ViewSource => {
            if let Some(f) = browser.main_frame() {
                f.view_source();
            }
        }
        Command::Inspect => inspect(browser, Some(at)),
    }
}

/// Open Chromium's DevTools for `browser` in its own window, inspecting the
/// element at `at` (page pixels) when given.
pub fn inspect(browser: &Browser, at: Option<(i32, i32)>) {
    let Some(host) = browser.host() else {
        return;
    };
    let info = WindowInfo {
        window_name: CefString::from("Redrob Browser DevTools"),
        bounds: Rect {
            x: 0,
            y: 0,
            width: 1100,
            height: 760,
        },
        // Chrome style: CEF refuses Alloy for DevTools windows.
        runtime_style: cef::sys::cef_runtime_style_t::CEF_RUNTIME_STYLE_CHROME.into(),
        ..Default::default()
    };
    let settings = BrowserSettings::default();
    let point = at.map(|(x, y)| Point { x, y });
    let mut client = crate::cef::client::devtools_client();
    host.show_dev_tools(Some(&info), Some(&mut client), Some(&settings), point.as_ref());
}

fn flag(bits: u32, f: u32) -> bool {
    bits & f != 0
}

wrap_context_menu_handler! {
    struct Menus {
        sink: Sink,
    }

    impl ContextMenuHandler {
        fn run_context_menu(
            &self,
            browser: Option<&mut Browser>,
            frame: Option<&mut Frame>,
            params: Option<&mut ContextMenuParams>,
            _model: Option<&mut MenuModel>,
            callback: Option<&mut RunContextMenuCallback>,
        ) -> ::std::os::raw::c_int {
            let (Some(browser), Some(params), Some(callback)) = (browser, params, callback) else {
                return 0;
            };
            let id = browser.identifier();
            if self.sink.tab_of(id).is_none() {
                callback.cancel();
                return 1;
            }
            let types: u32 = params.type_flags().as_ref().0;
            let edit: u32 = params.edit_state_flags().as_ref().0;
            let image = params.media_type() == ContextMenuMediaType::IMAGE
                && params.has_image_contents() != 0;
            let target = Target {
                link: if flag(types, T::CM_TYPEFLAG_LINK.0) {
                    super::text(&params.link_url())
                } else {
                    String::new()
                },
                image: if image { super::text(&params.source_url()) } else { String::new() },
                selection: if flag(types, T::CM_TYPEFLAG_SELECTION.0) {
                    super::text(&params.selection_text())
                } else {
                    String::new()
                },
                editable: params.is_editable() != 0,
                can_undo: flag(edit, E::CM_EDITFLAG_CAN_UNDO.0),
                can_redo: flag(edit, E::CM_EDITFLAG_CAN_REDO.0),
                can_cut: flag(edit, E::CM_EDITFLAG_CAN_CUT.0),
                can_copy: flag(edit, E::CM_EDITFLAG_CAN_COPY.0),
                can_paste: flag(edit, E::CM_EDITFLAG_CAN_PASTE.0),
                can_select_all: flag(edit, E::CM_EDITFLAG_CAN_SELECT_ALL.0),
                can_back: browser.can_go_back() != 0,
                can_forward: browser.can_go_forward() != 0,
            };
            let menu = Menu {
                at: (params.xcoord(), params.ycoord()),
                entries: entries(&target),
                target,
                browser: browser.clone(),
                frame: frame.map(|f| f.clone()),
                callback: callback.clone(),
                sink: self.sink.clone(),
            };
            self.sink.send(id, Event::ContextMenu(menu));
            1
        }
    }
}

pub fn new(sink: Sink) -> ContextMenuHandler {
    Menus::new(sink)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn commands(e: &[Entry]) -> Vec<Command> {
        e.iter()
            .filter_map(|e| match e {
                Entry::Item { command, .. } => Some(*command),
                Entry::Separator => None,
            })
            .collect()
    }

    #[test]
    fn page_menu_has_navigation_and_inspect() {
        let t = Target {
            can_back: true,
            ..Default::default()
        };
        let e = entries(&t);
        assert_eq!(
            commands(&e),
            [
                Command::Back,
                Command::Forward,
                Command::Reload,
                Command::Print,
                Command::ViewSource,
                Command::Inspect
            ]
        );
        assert!(e.contains(&Entry::Item {
            command: Command::Forward,
            enabled: false
        }));
    }

    #[test]
    fn link_and_image_menus() {
        let t = Target {
            link: "https://a.example/".into(),
            image: "https://a.example/i.png".into(),
            ..Default::default()
        };
        let c = commands(&entries(&t));
        assert_eq!(c[0], Command::OpenLinkInNewTab);
        assert!(c.contains(&Command::CopyLinkAddress));
        assert!(c.contains(&Command::SaveImageAs));
        assert!(!c.contains(&Command::Back));
        assert_eq!(*c.last().unwrap(), Command::Inspect);
    }

    #[test]
    fn text_field_menu_follows_edit_state() {
        let t = Target {
            editable: true,
            can_paste: true,
            ..Default::default()
        };
        let e = entries(&t);
        assert!(e.contains(&Entry::Item {
            command: Command::Paste,
            enabled: true
        }));
        assert!(e.contains(&Entry::Item {
            command: Command::Copy,
            enabled: false
        }));
        let sel = Target {
            selection: "hi".into(),
            ..Default::default()
        };
        assert_eq!(commands(&entries(&sel)), [Command::Copy, Command::Inspect]);
    }
}
