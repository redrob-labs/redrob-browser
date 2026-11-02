//! The window's side of the features: permission prompts, page dialogs, the
//! context menu, the find bar, the zoom badge and their shortcuts.
//!
//! The window passes every `Update` through `Prompts::take` (it keeps the
//! events it does not know), sends the ops `Prompts::shortcut` returns, draws
//! `Prompts::bars` in its chrome above the page and `Prompts::overlays`
//! over the page, each frame.

use std::time::{Duration, Instant};

use egui::Key;

use super::context_menu::{Entry, Menu};
use super::jsdialog::{Dialog, Kind as DialogKind};
use super::permission::{Answer, Prompt};
use super::zoom::Step;
use crate::cdp::{Event, Op};
use crate::cef::keys::Shortcut;
use crate::i18n::{current, Lang};
use crate::model::TabId;

/// Korean for the strings shown here (해요체).
fn ko(en: &str) -> Option<&'static str> {
    Some(match en {
        "{0} wants to" => "{0}에서 요청해요",
        "Allow" => "허용",
        "Allow this time" => "이번만 허용",
        "Block" => "차단",
        "{0} says" => "{0} 메시지",
        "OK" => "확인",
        "Cancel" => "취소",
        "Leave site?" => "사이트에서 나갈까요?",
        "Reload site?" => "사이트를 새로고침할까요?",
        "Changes you made may not be saved." => "변경한 내용이 저장되지 않을 수 있어요.",
        "Leave" => "나가기",
        "Reload" => "새로고침",
        "Find in page" => "페이지에서 찾기",
        "No results" => "결과 없음",
        "Previous" => "이전",
        "Next" => "다음",
        "Close" => "닫기",
        "Zoom: {0}%" => "확대/축소: {0}%",
        "Use your camera" => "카메라 사용",
        "Use your microphone" => "마이크 사용",
        "Share your screen" => "화면 공유",
        "Know your location" => "위치 정보 확인",
        "Show notifications" => "알림 표시",
        "See text and images copied to the clipboard" => "클립보드에 복사한 텍스트와 이미지 보기",
        "Control MIDI devices" => "MIDI 기기 제어",
        "Download multiple files" => "여러 파일 다운로드",
        "Use cookies and data across sites" => "여러 사이트에서 쿠키와 데이터 사용",
        "Use the fonts on your computer" => "컴퓨터의 글꼴 사용",
        "Manage windows on all your displays" => "모든 디스플레이의 창 관리",
        "Know when you're actively using this device" => "기기를 사용 중인지 확인",
        "Use another feature of your computer" => "컴퓨터의 다른 기능 사용",
        "Back" => "뒤로",
        "Forward" => "앞으로",
        "Open link in new tab" => "새 탭에서 링크 열기",
        "Save link as..." => "다른 이름으로 링크 저장...",
        "Copy link address" => "링크 주소 복사",
        "Open image in new tab" => "새 탭에서 이미지 열기",
        "Save image as..." => "다른 이름으로 이미지 저장...",
        "Copy image address" => "이미지 주소 복사",
        "Undo" => "실행 취소",
        "Redo" => "다시 실행",
        "Cut" => "잘라내기",
        "Copy" => "복사",
        "Paste" => "붙여넣기",
        "Select all" => "모두 선택",
        "Print..." => "인쇄...",
        "View page source" => "페이지 소스 보기",
        "Inspect" => "검사",
        _ => return None,
    })
}

pub fn tr(en: &'static str) -> &'static str {
    match current() {
        Lang::En => en,
        Lang::Ko => ko(en).unwrap_or(en),
    }
}

fn trf(en: &'static str, arg: &dyn std::fmt::Display) -> String {
    tr(en).replace("{0}", &arg.to_string())
}

struct FindBar {
    tab: TabId,
    text: String,
    sent: String,
    count: i32,
    active: i32,
    focus: bool,
}

#[derive(Default)]
pub struct Prompts {
    permissions: Vec<(TabId, Prompt)>,
    dialogs: Vec<(TabId, Dialog, String)>,
    menu: Option<(TabId, Menu)>,
    find: Option<FindBar>,
    zoom: Option<(TabId, u32, Instant)>,
    /// A menu, dialog or the find bar closed: the page gets the keyboard back.
    refocus: bool,
}

impl Prompts {
    /// Keep the feature events; give back every other event.
    pub fn take(&mut self, ctx: &egui::Context, tab: TabId, event: Event) -> Option<Event> {
        match event {
            Event::Permission(p) => self.permissions.push((tab, p)),
            Event::Dialog(d) => {
                let text = match &d.kind {
                    DialogKind::Prompt { default_text } => default_text.clone(),
                    _ => String::new(),
                };
                self.dialogs.push((tab, d, text));
            }
            Event::ContextMenu(m) => {
                if let Some((_, old)) = self.menu.replace((tab, m)) {
                    old.choose(None);
                }
            }
            Event::FindResult { count, active } => {
                if let Some(f) = self.find.as_mut().filter(|f| f.tab == tab) {
                    f.count = count;
                    if active > 0 || count == 0 {
                        f.active = active;
                    }
                }
            }
            Event::Zoom(p) => self.zoom = Some((tab, p, Instant::now())),
            Event::Clipboard(text) => ctx.copy_text(text),
            Event::Navigated(url) => {
                // A new document: its find results and menu are gone.
                if self.find.as_ref().is_some_and(|f| f.tab == tab) {
                    if let Some(f) = self.find.as_mut() {
                        f.count = 0;
                        f.active = 0;
                        f.sent.clear();
                    }
                }
                if self.menu.as_ref().is_some_and(|(t, _)| *t == tab) {
                    if let Some((_, m)) = self.menu.take() {
                        m.choose(None);
                    }
                }
                return Some(Event::Navigated(url));
            }
            other => return Some(other),
        }
        ctx.request_repaint();
        None
    }

    /// Whether the page should take the keyboard focus back (once).
    pub fn take_refocus(&mut self) -> bool {
        std::mem::take(&mut self.refocus)
    }

    /// The tab closed: answer what it still asks, as dismissed.
    pub fn close_tab(&mut self, tab: TabId) {
        for (_, p) in extract(&mut self.permissions, |(t, _)| *t == tab) {
            p.answer(Answer::Dismiss);
        }
        for (_, d, _) in extract(&mut self.dialogs, |(t, _, _)| *t == tab) {
            d.answer(false, "");
        }
        if self.menu.as_ref().is_some_and(|(t, _)| *t == tab) {
            if let Some((_, m)) = self.menu.take() {
                m.choose(None);
            }
        }
        if self.find.as_ref().is_some_and(|f| f.tab == tab) {
            self.find = None;
        }
    }

    /// Find, zoom, print and Escape for the tab on screen (cef/keys.rs).
    pub fn shortcut(&mut self, s: Shortcut, active: TabId) -> Option<Op> {
        match s {
            Shortcut::Find => {
                match self.find.as_mut() {
                    Some(f) if f.tab == active => f.focus = true,
                    _ => {
                        self.find = Some(FindBar {
                            tab: active,
                            text: String::new(),
                            sent: String::new(),
                            count: 0,
                            active: 0,
                            focus: true,
                        })
                    }
                }
                None
            }
            Shortcut::FindNext | Shortcut::FindPrev => self
                .find
                .as_ref()
                .filter(|f| f.tab == active && !f.text.is_empty())
                .map(|f| find_op(&f.text, s == Shortcut::FindNext, true)),
            Shortcut::ZoomIn => Some(Op::Zoom(Step::In)),
            Shortcut::ZoomOut => Some(Op::Zoom(Step::Out)),
            Shortcut::ZoomReset => Some(Op::Zoom(Step::Reset)),
            Shortcut::Print => Some(Op::Print),
            Shortcut::Escape => {
                // The page's context menu first, then the find bar.
                if let Some((_, m)) = self.menu.take() {
                    m.choose(None);
                    return None;
                }
                if self.find.as_ref().is_some_and(|f| f.tab == active) {
                    self.find = None;
                    self.refocus = true;
                    return Some(Op::StopFind);
                }
                None
            }
            _ => None,
        }
    }

    /// Whether the window's own controls need the keyboard: a page dialog
    /// waits for an answer, or the find bar was just opened.
    pub fn wants_keyboard(&self, active: TabId) -> bool {
        self.dialogs
            .iter()
            .any(|(t, d, _)| *t == active && d.is_open())
            || self
                .find
                .as_ref()
                .is_some_and(|f| f.tab == active && f.focus)
    }

    /// The bars above the page for the tab on screen: its dialog and the
    /// find bar. Drawn in the window's chrome, outside the page (the page
    /// is a native window nothing can be drawn over).
    pub fn bars(&mut self, ui: &mut egui::Ui, active: TabId) -> Vec<Op> {
        let mut ops = Vec::new();
        self.dialogs.retain(|(_, d, _)| d.is_open());
        self.show_dialog(ui, active);
        self.show_find(ui, active, &mut ops);
        ops
    }

    /// What floats over the page for the tab on screen, each in a small
    /// window of its own (popup.rs): the permission prompt, the page's
    /// context menu, the zoom level. `page` is the page area, in points.
    pub fn overlays(&mut self, ctx: &egui::Context, active: TabId, page: egui::Rect) {
        self.permissions.retain(|(_, p)| p.is_open());
        self.show_permission(ctx, active, page);
        self.show_menu(ctx, active, page);
        self.show_zoom(ctx, active, page);
    }

    fn show_permission(&mut self, ctx: &egui::Context, active: TabId, page: egui::Rect) {
        let Some(i) = self.permissions.iter().position(|(t, _)| *t == active) else {
            return;
        };
        let mut answer = None;
        let p = &self.permissions[i].1;
        let at = crate::popup::to_screen(ctx, page.min + egui::vec2(12.0, 4.0));
        crate::popup::show(
            ctx,
            egui::Id::new(("permission", p.prompt_id)),
            at,
            360.0,
            false,
            |ui| {
                ui.set_max_width(340.0);
                ui.horizontal(|ui| {
                    ui.strong(trf("{0} wants to", &p.origin));
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.small_button("✕").clicked() {
                            answer = Some(Answer::Dismiss);
                        }
                    });
                });
                for k in &p.kinds {
                    ui.label(format!("• {}", tr(k.label())));
                }
                ui.add_space(6.0);
                ui.horizontal(|ui| {
                    if ui.button(tr("Allow")).clicked() {
                        answer = Some(Answer::Allow);
                    }
                    if ui.button(tr("Allow this time")).clicked() {
                        answer = Some(Answer::AllowOnce);
                    }
                    if ui.button(tr("Block")).clicked() {
                        answer = Some(Answer::Block);
                    }
                });
            },
        );
        if let Some(a) = answer {
            let (_, p) = self.permissions.remove(i);
            p.answer(a);
        }
    }

    fn show_dialog(&mut self, ui: &mut egui::Ui, active: TabId) {
        let Some(i) = self.dialogs.iter().position(|(t, _, _)| *t == active) else {
            return;
        };
        let mut done = None;
        let (_, d, text) = &mut self.dialogs[i];
        let (title, message) = match d.kind {
            DialogKind::BeforeUnload { reload } => (
                tr(if reload {
                    "Reload site?"
                } else {
                    "Leave site?"
                })
                .to_string(),
                tr("Changes you made may not be saved.").to_string(),
            ),
            _ => (trf("{0} says", &d.origin), d.message.clone()),
        };
        crate::theme::bar(ui, crate::theme::Bar::Brand, |ui| {
            ui.vertical(|ui| {
                ui.strong(&title);
                ui.label(&message);
                ui.horizontal(|ui| {
                    if let DialogKind::Prompt { .. } = d.kind {
                        let r = ui.add(egui::TextEdit::singleline(text).desired_width(320.0));
                        if r.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
                            done = Some(true);
                        }
                        if !r.has_focus() && done.is_none() {
                            r.request_focus();
                        }
                    }
                    let ok = match d.kind {
                        DialogKind::BeforeUnload { reload: true } => tr("Reload"),
                        DialogKind::BeforeUnload { reload: false } => tr("Leave"),
                        _ => tr("OK"),
                    };
                    if ui.button(ok).clicked() {
                        done = Some(true);
                    }
                    if d.kind != DialogKind::Alert && ui.button(tr("Cancel")).clicked() {
                        done = Some(false);
                    }
                });
            });
        });
        ui.input(|i| {
            if i.key_pressed(Key::Escape) {
                done = Some(d.kind == DialogKind::Alert);
            } else if i.key_pressed(Key::Enter) && done.is_none() {
                done = Some(true);
            }
        });
        if let Some(ok) = done {
            let (_, d, text) = self.dialogs.remove(i);
            d.answer(ok, &text);
            self.refocus = true;
        }
    }

    fn show_menu(&mut self, ctx: &egui::Context, active: TabId, page: egui::Rect) {
        let Some((tab, menu)) = self.menu.as_ref() else {
            return;
        };
        if *tab != active {
            if let Some((_, m)) = self.menu.take() {
                m.choose(None);
            }
            return;
        }
        let at = crate::popup::to_screen(
            ctx,
            page.min + egui::vec2(menu.at.0 as f32, menu.at.1 as f32),
        );
        let mut chosen = None;
        crate::popup::menu_at(ctx, egui::Id::new("page-context-menu"), at, |ui| {
            for e in &menu.entries {
                match e {
                    Entry::Separator => {
                        ui.separator();
                    }
                    Entry::Item { command, enabled } => {
                        let b = egui::Button::new(tr(command.label()))
                            .frame(false)
                            .min_size(egui::vec2(ui.available_width(), 0.0));
                        if ui.add_enabled(*enabled, b).clicked() {
                            chosen = Some(*command);
                        }
                    }
                }
            }
        });
        if chosen.is_some() {
            if let Some((_, m)) = self.menu.take() {
                m.choose(chosen);
            }
        }
    }

    /// Close the page's context menu without choosing (a click elsewhere).
    pub fn close_menu(&mut self) {
        if let Some((_, m)) = self.menu.take() {
            m.choose(None);
        }
    }

    fn show_find(&mut self, ui: &mut egui::Ui, active: TabId, ops: &mut Vec<Op>) {
        let Some(f) = self.find.as_mut() else {
            return;
        };
        if f.tab != active {
            self.find = None;
            ops.push(Op::StopFind);
            return;
        }
        let mut close = false;
        crate::theme::bar(ui, crate::theme::Bar::Info, |ui| {
            let r = ui.add(
                egui::TextEdit::singleline(&mut f.text)
                    .hint_text(tr("Find in page"))
                    .desired_width(240.0),
            );
            if f.focus {
                r.request_focus();
                f.focus = false;
            }
            let enter = r.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter));
            let back = ui.input(|i| i.modifiers.shift);
            if f.text != f.sent {
                f.sent = f.text.clone();
                ops.push(if f.text.is_empty() {
                    Op::StopFind
                } else {
                    find_op(&f.text, true, false)
                });
                if f.text.is_empty() {
                    f.count = 0;
                    f.active = 0;
                }
            } else if enter && !f.text.is_empty() {
                ops.push(find_op(&f.text, !back, true));
                r.request_focus();
            }
            if !f.text.is_empty() {
                if f.count == 0 {
                    ui.weak(tr("No results"));
                } else {
                    ui.weak(format!("{}/{}", f.active, f.count));
                }
            }
            let any = !f.text.is_empty();
            if ui
                .add_enabled(any, egui::Button::new("⏶"))
                .on_hover_text(tr("Previous"))
                .clicked()
            {
                ops.push(find_op(&f.text, false, true));
            }
            if ui
                .add_enabled(any, egui::Button::new("⏷"))
                .on_hover_text(tr("Next"))
                .clicked()
            {
                ops.push(find_op(&f.text, true, true));
            }
            if ui.button("✕").on_hover_text(tr("Close")).clicked()
                || (r.has_focus() || r.lost_focus()) && ui.input(|i| i.key_pressed(Key::Escape))
            {
                close = true;
            }
        });
        if close {
            self.find = None;
            ops.push(Op::StopFind);
            self.refocus = true;
        }
    }

    fn show_zoom(&mut self, ctx: &egui::Context, active: TabId, page: egui::Rect) {
        let Some((tab, percent, at)) = self.zoom else {
            return;
        };
        let shown = Duration::from_millis(1500);
        if tab != active || at.elapsed() > shown {
            self.zoom = None;
            return;
        }
        let text = trf("Zoom: {0}%", &percent);
        let w = 140.0;
        let pos = crate::popup::to_screen(ctx, egui::pos2(page.max.x - w - 12.0, page.min.y + 8.0));
        crate::popup::show(ctx, egui::Id::new("zoom-badge"), pos, w, true, |ui| {
            ui.label(text);
        });
        ctx.request_repaint_after(shown.saturating_sub(at.elapsed()));
    }
}

fn find_op(text: &str, forward: bool, next: bool) -> Op {
    Op::Find {
        text: text.to_string(),
        forward,
        match_case: false,
        next,
    }
}

/// Remove and return the items `pred` picks, keeping the order of the rest.
fn extract<T>(v: &mut Vec<T>, pred: impl Fn(&T) -> bool) -> Vec<T> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < v.len() {
        if pred(&v[i]) {
            out.push(v.remove(i));
        } else {
            i += 1;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_label_has_korean() {
        use super::super::context_menu::Command::*;
        use super::super::permission::Kind;
        let commands = [
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
        ];
        for c in commands {
            assert!(ko(c.label()).is_some(), "{}", c.label());
        }
        let kinds = [
            Kind::Camera,
            Kind::Microphone,
            Kind::Screen,
            Kind::Location,
            Kind::Notifications,
            Kind::Clipboard,
            Kind::Midi,
            Kind::Downloads,
            Kind::Storage,
            Kind::Fonts,
            Kind::Windows,
            Kind::Idle,
            Kind::Other(1),
        ];
        for k in kinds {
            assert!(ko(k.label()).is_some(), "{}", k.label());
        }
    }

    #[test]
    fn find_and_zoom_shortcuts() {
        let mut p = Prompts::default();
        assert!(p.shortcut(Shortcut::Find, 7).is_none());
        assert!(p.find.as_ref().is_some_and(|f| f.tab == 7 && f.focus));
        assert!(p.wants_keyboard(7));
        assert!(matches!(
            p.shortcut(Shortcut::ZoomIn, 7),
            Some(Op::Zoom(Step::In))
        ));
        assert!(matches!(
            p.shortcut(Shortcut::ZoomReset, 7),
            Some(Op::Zoom(Step::Reset))
        ));
        assert!(matches!(p.shortcut(Shortcut::Print, 7), Some(Op::Print)));
        // Escape closes the find bar and gives the page its keyboard back.
        assert!(matches!(
            p.shortcut(Shortcut::Escape, 7),
            Some(Op::StopFind)
        ));
        assert!(p.find.is_none());
        assert!(p.take_refocus());
    }

    #[test]
    fn clipboard_and_other_events() {
        let ctx = egui::Context::default();
        let mut p = Prompts::default();
        assert!(p.take(&ctx, 1, Event::Clipboard("x".into())).is_none());
        assert!(p.take(&ctx, 1, Event::Zoom(110)).is_none());
        assert!(matches!(
            p.take(&ctx, 1, Event::Title("t".into())),
            Some(Event::Title(_))
        ));
    }
}
