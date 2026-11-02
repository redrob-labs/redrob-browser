//! Off-screen rendering: what a tab's page looks like and how big it is.
//!
//! Each tab has a [`View`] shared between its CEF render handler, which
//! fills in frames, and the window, which says how big the page area is and
//! draws the newest frame (compositor/). Frames arrive as GPU textures
//! (`OnAcceleratedPaint`: dmabuf, IOSurface, D3D11 shared handle) when the
//! window's wgpu device can import them, else as BGRA pixels (`OnPaint`).

use std::sync::{Arc, Mutex, MutexGuard};

use cef::{
    rc::Rc as _, sys, wrap_render_handler, AcceleratedPaintInfo, Browser, ImplRenderHandler,
    PaintElementType, Range, Rect, RenderHandler, ScreenInfo, TextInputMode, WrapRenderHandler,
};
use eframe::wgpu;

use super::Sink;
use crate::model::TabId;

/// One layer of a page: the page itself or a popup widget (an open
/// `<select>`, a date picker), in physical pixels.
#[derive(Default)]
pub struct Layer {
    /// BGRA rows, `width * 4` bytes each (`OnPaint`).
    pub pixels: Vec<u8>,
    pub width: u32,
    pub height: u32,
    /// Rows changed since the window last uploaded them: (top, bottom).
    pub dirty: Option<(u32, u32)>,
    /// The newest frame as a texture (`OnAcceleratedPaint`), not yet shown.
    pub texture: Option<wgpu::Texture>,
    /// Bumped on every new frame.
    pub serial: u64,
}

impl Layer {
    fn paint(&mut self, dirty: &[Rect], buffer: *const u8, width: i32, height: i32) {
        if buffer.is_null() || width <= 0 || height <= 0 {
            return;
        }
        let (w, h) = (width as u32, height as u32);
        let len = w as usize * h as usize * 4;
        // SAFETY: CEF hands a BGRA buffer of width * height pixels, valid
        // for this callback.
        let src = unsafe { std::slice::from_raw_parts(buffer, len) };
        let resized = (w, h) != (self.width, self.height);
        if resized {
            self.pixels = src.to_vec();
            self.width = w;
            self.height = h;
            self.dirty = Some((0, h));
        } else {
            let row = w as usize * 4;
            let (mut top, mut bottom) = self.dirty.unwrap_or((h, 0));
            for r in dirty {
                let y0 = r.y.clamp(0, height) as usize;
                let y1 = (r.y + r.height).clamp(0, height) as usize;
                let x0 = r.x.clamp(0, width) as usize * 4;
                let x1 = (r.x + r.width).clamp(0, width) as usize * 4;
                for y in y0..y1 {
                    let at = y * row;
                    self.pixels[at + x0..at + x1].copy_from_slice(&src[at + x0..at + x1]);
                }
                top = top.min(y0 as u32);
                bottom = bottom.max(y1 as u32);
            }
            if dirty.is_empty() {
                self.pixels.copy_from_slice(src);
                top = 0;
                bottom = h;
            }
            if top < bottom {
                self.dirty = Some((top, bottom));
            }
        }
        self.texture = None;
        self.serial += 1;
    }
}

/// A tab's page as the window and CEF both see it.
pub struct View {
    /// The page area in CSS pixels (egui points).
    pub width: u32,
    pub height: u32,
    /// Physical pixels per CSS pixel.
    pub scale: f32,
    /// Where the page area's top-left is on screen, in points, for popups
    /// and `window.screenX`.
    pub origin: (i32, i32),
    pub page: Layer,
    pub popup: Layer,
    /// The popup widget's place in the page, in CSS pixels, while shown.
    pub popup_rect: Option<[i32; 4]>,
    pub cursor: egui::CursorIcon,
    /// A text field has focus: the window turns on the input method.
    pub editing: bool,
    /// The composition's character boxes, CSS pixels, for the IME window.
    pub ime_rect: Option<[i32; 4]>,
    /// The link under the pointer (Chromium's status message).
    pub status: Option<String>,
    /// The page's tooltip (`title` attribute) under the pointer.
    pub tooltip: Option<String>,
}

impl Default for View {
    fn default() -> Self {
        Self {
            width: 1280,
            height: 800,
            scale: 1.0,
            origin: (0, 0),
            page: Layer::default(),
            popup: Layer::default(),
            popup_rect: None,
            cursor: egui::CursorIcon::Default,
            editing: false,
            ime_rect: None,
            status: None,
            tooltip: None,
        }
    }
}

pub type SharedView = Arc<Mutex<View>>;

pub fn lock(v: &SharedView) -> MutexGuard<'_, View> {
    v.lock().unwrap_or_else(|e| e.into_inner())
}

/// The window's GPU, when CEF frames can be imported into it.
#[derive(Clone)]
pub struct Gpu {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
}

pub fn handler(view: SharedView, tab: TabId, sink: Sink, gpu: Option<Gpu>) -> RenderHandler {
    OsrHandler::new(view, tab, sink, gpu)
}

wrap_render_handler! {
    struct OsrHandler {
        view: SharedView,
        tab: TabId,
        sink: Sink,
        gpu: Option<Gpu>,
    }

    impl RenderHandler {
        fn view_rect(&self, _browser: Option<&mut Browser>, rect: Option<&mut Rect>) {
            if let Some(rect) = rect {
                let v = lock(&self.view);
                *rect = Rect {
                    x: 0,
                    y: 0,
                    width: v.width.max(1) as i32,
                    height: v.height.max(1) as i32,
                };
            }
        }

        fn root_screen_rect(&self, _browser: Option<&mut Browser>, rect: Option<&mut Rect>) -> ::std::os::raw::c_int {
            let Some(rect) = rect else { return 0 };
            let v = lock(&self.view);
            *rect = Rect {
                x: v.origin.0,
                y: v.origin.1,
                width: v.width.max(1) as i32,
                height: v.height.max(1) as i32,
            };
            1
        }

        fn screen_point(
            &self,
            _browser: Option<&mut Browser>,
            view_x: ::std::os::raw::c_int,
            view_y: ::std::os::raw::c_int,
            screen_x: Option<&mut ::std::os::raw::c_int>,
            screen_y: Option<&mut ::std::os::raw::c_int>,
        ) -> ::std::os::raw::c_int {
            let v = lock(&self.view);
            if let (Some(x), Some(y)) = (screen_x, screen_y) {
                *x = v.origin.0 + view_x;
                *y = v.origin.1 + view_y;
                return 1;
            }
            0
        }

        fn screen_info(
            &self,
            _browser: Option<&mut Browser>,
            screen_info: Option<&mut ScreenInfo>,
        ) -> ::std::os::raw::c_int {
            let Some(info) = screen_info else { return 0 };
            let v = lock(&self.view);
            info.device_scale_factor = v.scale;
            info.depth = 24;
            info.depth_per_component = 8;
            let rect = Rect {
                x: v.origin.0,
                y: v.origin.1,
                width: v.width.max(1) as i32,
                height: v.height.max(1) as i32,
            };
            info.rect = rect.clone();
            info.available_rect = rect;
            1
        }

        fn on_popup_show(&self, _browser: Option<&mut Browser>, show: ::std::os::raw::c_int) {
            let mut v = lock(&self.view);
            if show == 0 {
                v.popup_rect = None;
                v.popup = Layer::default();
            }
            drop(v);
            self.sink.repaint(self.tab);
        }

        fn on_popup_size(&self, _browser: Option<&mut Browser>, rect: Option<&Rect>) {
            let Some(r) = rect else { return };
            let mut v = lock(&self.view);
            // Keep the popup inside the page area, as Chrome does.
            let (vw, vh) = (v.width as i32, v.height as i32);
            let w = r.width.min(vw);
            let h = r.height.min(vh);
            let x = r.x.min(vw - w).max(0);
            let y = r.y.min(vh - h).max(0);
            v.popup_rect = Some([x, y, w, h]);
        }

        fn on_paint(
            &self,
            _browser: Option<&mut Browser>,
            type_: PaintElementType,
            dirty_rects: Option<&[Rect]>,
            buffer: *const u8,
            width: ::std::os::raw::c_int,
            height: ::std::os::raw::c_int,
        ) {
            let popup = *type_.as_ref() == sys::cef_paint_element_type_t::PET_POPUP;
            {
                let mut v = lock(&self.view);
                let layer = if popup { &mut v.popup } else { &mut v.page };
                layer.paint(dirty_rects.unwrap_or(&[]), buffer, width, height);
            }
            self.sink.repaint(self.tab);
        }

        fn on_accelerated_paint(
            &self,
            _browser: Option<&mut Browser>,
            type_: PaintElementType,
            _dirty_rects: Option<&[Rect]>,
            info: Option<&AcceleratedPaintInfo>,
        ) {
            let (Some(info), Some(gpu)) = (info, self.gpu.as_ref()) else {
                return;
            };
            let handle = cef::osr_texture_import::SharedTextureHandle::new(info);
            // SAFETY: inside the CEF callback for this frame; the window's
            // device runs on the GPU CEF renders with (accelerated paint is
            // only turned on for a hardware adapter that can import).
            let texture = match unsafe { handle.import_texture(&gpu.device, &gpu.queue) } {
                Ok(t) => t,
                Err(e) => {
                    eprintln!("redrob-browser: page frame import failed: {e}");
                    return;
                }
            };
            let popup = *type_.as_ref() == sys::cef_paint_element_type_t::PET_POPUP;
            {
                let mut v = lock(&self.view);
                let layer = if popup { &mut v.popup } else { &mut v.page };
                layer.width = texture.width();
                layer.height = texture.height();
                layer.pixels = Vec::new();
                layer.dirty = None;
                layer.texture = Some(texture);
                layer.serial += 1;
            }
            self.sink.repaint(self.tab);
        }

        fn start_dragging(
            &self,
            browser: Option<&mut Browser>,
            drag_data: Option<&mut cef::DragData>,
            allowed_ops: cef::DragOperationsMask,
            x: ::std::os::raw::c_int,
            y: ::std::os::raw::c_int,
        ) -> ::std::os::raw::c_int {
            let (Some(browser), Some(data)) = (browser, drag_data) else {
                return 0;
            };
            super::input::start_drag(browser, data, allowed_ops, (x, y));
            1
        }

        fn update_drag_cursor(&self, _browser: Option<&mut Browser>, operation: cef::DragOperationsMask) {
            let none = *operation.as_ref() == sys::cef_drag_operations_mask_t::DRAG_OPERATION_NONE;
            lock(&self.view).cursor = if none {
                egui::CursorIcon::NoDrop
            } else {
                egui::CursorIcon::Grabbing
            };
            self.sink.repaint(self.tab);
        }

        fn on_ime_composition_range_changed(
            &self,
            _browser: Option<&mut Browser>,
            _selected_range: Option<&Range>,
            character_bounds: Option<&[Rect]>,
        ) {
            let Some(bounds) = character_bounds.filter(|b| !b.is_empty()) else {
                return;
            };
            let x0 = bounds.iter().map(|r| r.x).min().unwrap_or(0);
            let y0 = bounds.iter().map(|r| r.y).min().unwrap_or(0);
            let x1 = bounds.iter().map(|r| r.x + r.width).max().unwrap_or(0);
            let y1 = bounds.iter().map(|r| r.y + r.height).max().unwrap_or(0);
            lock(&self.view).ime_rect = Some([x0, y0, x1 - x0, y1 - y0]);
            self.sink.repaint(self.tab);
        }

        fn on_virtual_keyboard_requested(&self, _browser: Option<&mut Browser>, input_mode: TextInputMode) {
            let none = *input_mode.as_ref() == sys::cef_text_input_mode_t::CEF_TEXT_INPUT_MODE_NONE;
            let mut v = lock(&self.view);
            v.editing = !none;
            if none {
                v.ime_rect = None;
            }
            drop(v);
            self.sink.repaint(self.tab);
        }
    }
}

/// egui's cursor for a CEF cursor type.
pub fn cursor_icon(t: sys::cef_cursor_type_t) -> egui::CursorIcon {
    use egui::CursorIcon as C;
    use sys::cef_cursor_type_t as T;
    match t {
        T::CT_CROSS => C::Crosshair,
        T::CT_HAND => C::PointingHand,
        T::CT_IBEAM => C::Text,
        T::CT_WAIT => C::Wait,
        T::CT_HELP => C::Help,
        T::CT_EASTRESIZE => C::ResizeEast,
        T::CT_NORTHRESIZE => C::ResizeNorth,
        T::CT_NORTHEASTRESIZE => C::ResizeNorthEast,
        T::CT_NORTHWESTRESIZE => C::ResizeNorthWest,
        T::CT_SOUTHRESIZE => C::ResizeSouth,
        T::CT_SOUTHEASTRESIZE => C::ResizeSouthEast,
        T::CT_SOUTHWESTRESIZE => C::ResizeSouthWest,
        T::CT_WESTRESIZE => C::ResizeWest,
        T::CT_NORTHSOUTHRESIZE => C::ResizeVertical,
        T::CT_EASTWESTRESIZE => C::ResizeHorizontal,
        T::CT_NORTHEASTSOUTHWESTRESIZE => C::ResizeNeSw,
        T::CT_NORTHWESTSOUTHEASTRESIZE => C::ResizeNwSe,
        T::CT_COLUMNRESIZE => C::ResizeColumn,
        T::CT_ROWRESIZE => C::ResizeRow,
        T::CT_MIDDLEPANNING
        | T::CT_MIDDLE_PANNING_VERTICAL
        | T::CT_MIDDLE_PANNING_HORIZONTAL
        | T::CT_EASTPANNING
        | T::CT_NORTHPANNING
        | T::CT_NORTHEASTPANNING
        | T::CT_NORTHWESTPANNING
        | T::CT_SOUTHPANNING
        | T::CT_SOUTHEASTPANNING
        | T::CT_SOUTHWESTPANNING
        | T::CT_WESTPANNING => C::AllScroll,
        T::CT_MOVE => C::Move,
        T::CT_VERTICALTEXT => C::VerticalText,
        T::CT_CELL => C::Cell,
        T::CT_CONTEXTMENU => C::ContextMenu,
        T::CT_ALIAS | T::CT_DND_LINK => C::Alias,
        T::CT_PROGRESS => C::Progress,
        T::CT_NODROP | T::CT_DND_NONE => C::NoDrop,
        T::CT_COPY | T::CT_DND_COPY => C::Copy,
        T::CT_NONE => C::None,
        T::CT_NOTALLOWED => C::NotAllowed,
        T::CT_ZOOMIN => C::ZoomIn,
        T::CT_ZOOMOUT => C::ZoomOut,
        T::CT_GRAB => C::Grab,
        T::CT_GRABBING | T::CT_DND_MOVE => C::Grabbing,
        _ => C::Default,
    }
}
