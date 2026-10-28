//! The Redrob design system (`@redrob-labs/ui`) in egui: colours, type,
//! metrics and icons for the window's own chrome and pages.
//!
//! egui has no CSS, so the window reads the delivery's `tokens.json`, which
//! carries every token already resolved for the light and dark themes. The
//! file is vendored under `assets/redrob-ui/` and pinned in
//! `DESIGN_SYSTEM_PIN.json`; widgets take every colour from [`Palette`] and
//! never hard-code one.

use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use egui::{
    Color32, CornerRadius, FontFamily, FontId, Rect, Response, Sense, Stroke, TextStyle, Ui, Vec2,
};

const TOKENS: &str = include_str!("../assets/redrob-ui/tokens.json");
const WANTED_SANS: &[u8] = include_bytes!("../assets/fonts/WantedSans-Regular.ttf");
pub const BRAND_ICON: &[u8] = include_bytes!("../assets/redrob-ui/redrob-browser-icon.svg");

/// Semantic colours of one theme, named as in the design system.
#[derive(Clone, Copy, Debug)]
pub struct Palette {
    pub dark: bool,
    pub surface_base: Color32,
    pub surface_raised: Color32,
    pub surface_sunken: Color32,
    pub surface_brand_subtle: Color32,
    pub border_subtle: Color32,
    pub border_strong: Color32,
    pub ink_primary: Color32,
    pub ink_secondary: Color32,
    pub ink_muted: Color32,
    pub ink_brand: Color32,
    pub ink_on_brand: Color32,
    pub action_primary: Color32,
    pub action_primary_hover: Color32,
    pub focus_ring: Color32,
    pub danger: Color32,
    pub warning: Color32,
}

/// Lengths from the design system, in points.
pub mod size {
    pub const SPACE_1: f32 = 4.0;
    pub const SPACE_2: f32 = 8.0;
    pub const SPACE_3: f32 = 12.0;
    pub const SPACE_4: f32 = 16.0;
    pub const SPACE_6: f32 = 24.0;
    pub const RADIUS_XS: u8 = 4;
    pub const RADIUS_SM: u8 = 6;
    pub const RADIUS_MD: u8 = 8;
    pub const RADIUS_LG: u8 = 12;
    pub const RADIUS_FULL: u8 = 255;
    pub const CONTROL_SM: f32 = 32.0;
    pub const CONTROL_LG: f32 = 48.0;
}

fn tokens() -> &'static HashMap<String, (String, String)> {
    static T: OnceLock<HashMap<String, (String, String)>> = OnceLock::new();
    T.get_or_init(|| {
        let v: serde_json::Value = serde_json::from_str(TOKENS).unwrap_or_default();
        v["tokens"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|t| {
                let name = t["name"].as_str()?.to_string();
                let light = t["light"].as_str().or(t["value"].as_str())?.to_string();
                let dark = t["dark"]
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| light.clone());
                Some((name, (light, dark)))
            })
            .collect()
    })
}

/// `#rrggbb`, `#rrggbbaa` or `rgba(r, g, b, a)`.
fn parse_color(s: &str) -> Option<Color32> {
    let s = s.trim();
    if let Some(hex) = s.strip_prefix('#') {
        let n = u32::from_str_radix(hex, 16).ok()?;
        return match hex.len() {
            6 => Some(Color32::from_rgb((n >> 16) as u8, (n >> 8) as u8, n as u8)),
            8 => Some(Color32::from_rgba_unmultiplied(
                (n >> 24) as u8,
                (n >> 16) as u8,
                (n >> 8) as u8,
                n as u8,
            )),
            _ => None,
        };
    }
    let inner = s
        .strip_prefix("rgba(")
        .or_else(|| s.strip_prefix("rgb("))?
        .strip_suffix(')')?;
    let parts: Vec<f32> = inner
        .split(',')
        .filter_map(|p| p.trim().parse().ok())
        .collect();
    let a = parts.get(3).copied().unwrap_or(1.0);
    Some(Color32::from_rgba_unmultiplied(
        *parts.first()? as u8,
        *parts.get(1)? as u8,
        *parts.get(2)? as u8,
        (a * 255.0).round() as u8,
    ))
}

fn color(name: &str, dark: bool) -> Color32 {
    tokens()
        .get(name)
        .and_then(|(l, d)| parse_color(if dark { d } else { l }))
        // A token the delivery dropped shows up as magenta, never as a guess.
        .unwrap_or(Color32::from_rgb(255, 0, 255))
}

impl Palette {
    fn load(dark: bool) -> Self {
        let c = |n: &str| color(n, dark);
        Palette {
            dark,
            surface_base: c("surface-base"),
            surface_raised: c("surface-raised"),
            surface_sunken: c("surface-sunken"),
            surface_brand_subtle: c("surface-brand-subtle"),
            border_subtle: c("border-subtle"),
            border_strong: c("border-strong"),
            ink_primary: c("ink-primary"),
            ink_secondary: c("ink-secondary"),
            ink_muted: c("ink-muted"),
            ink_brand: c("ink-brand"),
            ink_on_brand: c("ink-on-brand"),
            action_primary: c("action-primary"),
            action_primary_hover: c("action-primary-hover"),
            focus_ring: c("focus-ring"),
            danger: c("status-danger"),
            warning: c("status-warning"),
        }
    }

    pub fn of(dark: bool) -> &'static Palette {
        static LIGHT: OnceLock<Palette> = OnceLock::new();
        static DARK: OnceLock<Palette> = OnceLock::new();
        if dark {
            DARK.get_or_init(|| Palette::load(true))
        } else {
            LIGHT.get_or_init(|| Palette::load(false))
        }
    }
}

/// The palette of the theme `ui` is drawn in.
pub fn palette(ui: &Ui) -> &'static Palette {
    Palette::of(ui.visuals().dark_mode)
}

/// Fonts, visuals and spacing for both themes, and the SVG image loader.
pub fn install(ctx: &egui::Context) {
    egui_extras::install_image_loaders(ctx);
    let mut fonts = egui::FontDefinitions::default();
    // Wanted Sans is the system's Korean face and carries Latin too; egui's
    // own fonts stay behind it for symbols it lacks.
    fonts.font_data.insert(
        "wanted-sans".into(),
        Arc::new(egui::FontData::from_static(WANTED_SANS)),
    );
    for family in [FontFamily::Proportional, FontFamily::Monospace] {
        if let Some(f) = fonts.families.get_mut(&family) {
            let at = if family == FontFamily::Proportional {
                0
            } else {
                1.min(f.len())
            };
            f.insert(at, "wanted-sans".into());
        }
    }
    // Chinese and Japanese page titles fall back to the system's CJK face.
    const CJK: &[&str] = &[
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "C:\\Windows\\Fonts\\msyh.ttc",
        "C:\\Windows\\Fonts\\YuGothM.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc",
    ];
    if let Some(bytes) = CJK.iter().find_map(|p| std::fs::read(p).ok()) {
        fonts
            .font_data
            .insert("cjk".into(), Arc::new(egui::FontData::from_owned(bytes)));
        for family in [FontFamily::Proportional, FontFamily::Monospace] {
            fonts.families.entry(family).or_default().push("cjk".into());
        }
    }
    ctx.set_fonts(fonts);
    for (theme, dark) in [(egui::Theme::Light, false), (egui::Theme::Dark, true)] {
        ctx.set_visuals_of(theme, visuals(Palette::of(dark)));
        ctx.style_mut_of(theme, |s| {
            s.spacing.item_spacing = Vec2::new(size::SPACE_2, 6.0);
            s.spacing.button_padding = Vec2::new(10.0, 5.0);
            s.spacing.interact_size.y = 28.0;
            s.spacing.menu_margin = egui::Margin::same(6);
            s.text_styles
                .insert(TextStyle::Small, FontId::proportional(11.0));
            s.text_styles
                .insert(TextStyle::Body, FontId::proportional(13.0));
            s.text_styles
                .insert(TextStyle::Button, FontId::proportional(13.0));
            s.text_styles
                .insert(TextStyle::Heading, FontId::proportional(21.0));
            s.text_styles
                .insert(TextStyle::Monospace, FontId::monospace(12.0));
        });
    }
}

fn visuals(p: &Palette) -> egui::Visuals {
    let mut v = if p.dark {
        egui::Visuals::dark()
    } else {
        egui::Visuals::light()
    };
    v.panel_fill = p.surface_base;
    v.window_fill = p.surface_base;
    v.extreme_bg_color = p.surface_sunken;
    v.faint_bg_color = p.surface_raised;
    v.code_bg_color = p.surface_sunken;
    v.hyperlink_color = p.ink_brand;
    v.warn_fg_color = p.warning;
    v.error_fg_color = p.danger;
    v.window_stroke = Stroke::new(1.0, p.border_subtle);
    v.window_corner_radius = CornerRadius::same(size::RADIUS_LG);
    v.menu_corner_radius = CornerRadius::same(size::RADIUS_MD);
    let shadow = egui::epaint::Shadow {
        offset: [0, 4],
        blur: 12,
        spread: 0,
        color: Color32::from_black_alpha(if p.dark { 110 } else { 26 }),
    };
    v.popup_shadow = shadow;
    v.window_shadow = egui::epaint::Shadow {
        offset: [0, 16],
        blur: 40,
        spread: 0,
        color: Color32::from_black_alpha(if p.dark { 140 } else { 36 }),
    };
    v.selection.bg_fill = p.action_primary.gamma_multiply(0.28);
    v.selection.stroke = Stroke::new(1.0, p.action_primary);
    v.text_cursor.stroke = Stroke::new(2.0, p.action_primary);
    let radius = CornerRadius::same(size::RADIUS_MD);
    let w = &mut v.widgets;
    w.noninteractive.bg_fill = p.surface_base;
    w.noninteractive.weak_bg_fill = p.surface_base;
    w.noninteractive.bg_stroke = Stroke::new(1.0, p.border_subtle);
    w.noninteractive.fg_stroke = Stroke::new(1.0, p.ink_secondary);
    w.noninteractive.corner_radius = radius;
    w.inactive.bg_fill = p.surface_sunken;
    w.inactive.weak_bg_fill = p.surface_raised;
    w.inactive.bg_stroke = Stroke::new(1.0, p.border_subtle);
    w.inactive.fg_stroke = Stroke::new(1.0, p.ink_primary);
    w.inactive.corner_radius = radius;
    w.hovered.bg_fill = p.surface_sunken;
    w.hovered.weak_bg_fill = p.surface_sunken;
    w.hovered.bg_stroke = Stroke::new(1.0, p.border_strong);
    w.hovered.fg_stroke = Stroke::new(1.0, p.ink_primary);
    w.hovered.corner_radius = radius;
    w.hovered.expansion = 0.0;
    w.active.bg_fill = p.border_subtle;
    w.active.weak_bg_fill = p.border_subtle;
    w.active.bg_stroke = Stroke::new(1.0, p.border_strong);
    w.active.fg_stroke = Stroke::new(1.0, p.ink_primary);
    w.active.corner_radius = radius;
    w.active.expansion = 0.0;
    w.open.bg_fill = p.surface_sunken;
    w.open.weak_bg_fill = p.surface_sunken;
    w.open.bg_stroke = Stroke::new(1.0, p.border_subtle);
    w.open.fg_stroke = Stroke::new(1.0, p.ink_primary);
    w.open.corner_radius = radius;
    v
}

/// Icons from the design system's set (24px grid, 2px stroke).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Icon {
    Back,
    Forward,
    Refresh,
    Close,
    Plus,
    Star,
    StarFilled,
    More,
    Search,
    Lock,
    Globe,
    Download,
    History,
    Key,
    Code,
    Settings,
    Sparkle,
    User,
    SignIn,
    Incognito,
}

impl Icon {
    fn file(self) -> (&'static str, &'static str) {
        macro_rules! svg {
            ($n:literal) => {
                (
                    $n,
                    include_str!(concat!("../assets/redrob-ui/icons/", $n, ".svg")),
                )
            };
        }
        match self {
            Icon::Back => svg!("back"),
            Icon::Forward => svg!("forward"),
            Icon::Refresh => svg!("refresh"),
            Icon::Close => svg!("close"),
            Icon::Plus => svg!("plus"),
            Icon::Star | Icon::StarFilled => svg!("star"),
            Icon::More => svg!("more"),
            Icon::Search => svg!("search"),
            Icon::Lock => svg!("lock"),
            Icon::Globe => svg!("globe"),
            Icon::Download => svg!("download"),
            Icon::History => svg!("history"),
            Icon::Key => svg!("key"),
            Icon::Code => svg!("code"),
            Icon::Settings => svg!("settings"),
            Icon::Sparkle => svg!("sparkle"),
            Icon::User => svg!("user"),
            Icon::SignIn => svg!("signIn"),
            Icon::Incognito => svg!("anonymous"),
        }
    }

    /// The icon drawn in white, so `tint` gives it any colour.
    fn bytes(self) -> (String, &'static [u8]) {
        static CACHE: OnceLock<std::sync::Mutex<HashMap<String, &'static [u8]>>> = OnceLock::new();
        let (name, svg) = self.file();
        let key = if self == Icon::StarFilled {
            format!("{name}-filled")
        } else {
            name.to_string()
        };
        let mut cache = CACHE
            .get_or_init(Default::default)
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let bytes = *cache.entry(key.clone()).or_insert_with(|| {
            let mut s = svg.replace("currentColor", "#ffffff");
            if self == Icon::StarFilled {
                s = s.replacen("fill=\"none\"", "fill=\"#ffffff\"", 1);
            }
            Box::leak(s.into_bytes().into_boxed_slice())
        });
        (format!("bytes://redrob-ui/{key}.svg"), bytes)
    }

    pub fn image(self, size: f32, tint: Color32) -> egui::Image<'static> {
        let (uri, bytes) = self.bytes();
        egui::Image::from_bytes(uri, bytes)
            .fit_to_exact_size(Vec2::splat(size))
            .tint(tint)
    }

    pub fn paint(self, ui: &Ui, rect: Rect, tint: Color32) {
        self.image(rect.width(), tint).paint_at(ui, rect);
    }
}

/// A square, borderless icon button (`control-height-sm`), filled on hover.
pub fn icon_button(ui: &mut Ui, icon: Icon, tip: &str) -> Response {
    icon_button_sized(ui, icon, tip, size::CONTROL_SM, true)
}

pub fn icon_button_sized(ui: &mut Ui, icon: Icon, tip: &str, side: f32, enabled: bool) -> Response {
    let p = palette(ui);
    let sense = if enabled {
        Sense::click()
    } else {
        Sense::hover()
    };
    let (rect, r) = ui.allocate_exact_size(Vec2::splat(side), sense);
    if ui.is_rect_visible(rect) {
        let fill = if !enabled {
            Color32::TRANSPARENT
        } else if r.is_pointer_button_down_on() {
            p.border_subtle
        } else if r.hovered() {
            p.surface_sunken
        } else {
            Color32::TRANSPARENT
        };
        ui.painter()
            .rect_filled(rect, CornerRadius::same(size::RADIUS_MD), fill);
        let tint = if !enabled {
            p.ink_muted.gamma_multiply(0.5)
        } else if r.hovered() {
            p.ink_primary
        } else {
            p.ink_secondary
        };
        let s = (side * 0.56).round();
        icon.paint(
            ui,
            Rect::from_center_size(rect.center(), Vec2::splat(s)),
            tint,
        );
    }
    if tip.is_empty() {
        r
    } else {
        r.on_hover_text(tip)
    }
}

/// A primary (filled, brand) or secondary (outlined) text button.
pub fn button(ui: &mut Ui, text: &str, primary: bool) -> Response {
    let p = palette(ui);
    let (fill, ink, stroke) = if primary {
        (p.action_primary, p.ink_on_brand, Stroke::NONE)
    } else {
        (
            p.surface_base,
            p.ink_primary,
            Stroke::new(1.0, p.border_subtle),
        )
    };
    let b = egui::Button::new(egui::RichText::new(text).color(ink))
        .fill(fill)
        .stroke(stroke)
        .corner_radius(CornerRadius::same(size::RADIUS_MD))
        .min_size(Vec2::new(0.0, 28.0));
    let r = ui.add(b);
    if primary && r.hovered() {
        ui.painter().rect_filled(
            r.rect,
            CornerRadius::same(size::RADIUS_MD),
            p.action_primary_hover,
        );
        ui.painter().text(
            r.rect.center(),
            egui::Align2::CENTER_CENTER,
            text,
            FontId::proportional(13.0),
            ink,
        );
    }
    r
}

/// Kinds of message bar under the toolbar.
#[derive(Clone, Copy)]
pub enum Bar {
    Info,
    Brand,
    Danger,
}

/// A full-width message bar with a bottom border, in the design system's
/// subtle surface for its kind.
pub fn bar<R>(ui: &mut Ui, kind: Bar, add: impl FnOnce(&mut Ui) -> R) -> R {
    let p = palette(ui);
    let (fill, accent) = match kind {
        Bar::Info => (p.surface_raised, p.ink_secondary),
        Bar::Brand => (p.surface_brand_subtle, p.ink_brand),
        Bar::Danger => (p.surface_raised, p.danger),
    };
    let r = egui::Frame::new()
        .fill(fill)
        .inner_margin(egui::Margin::symmetric(size::SPACE_4 as i8, 6))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                let (dot, _) = ui.allocate_exact_size(Vec2::splat(8.0), Sense::hover());
                ui.painter().circle_filled(dot.center(), 3.5, accent);
                add(ui)
            })
            .inner
        });
    let rect = r.response.rect;
    ui.painter().hline(
        rect.x_range(),
        rect.bottom(),
        Stroke::new(1.0, p.border_subtle),
    );
    r.inner
}

/// Shorten `text` to `max` characters with an ellipsis.
pub fn elide(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let mut s: String = text.chars().take(max.saturating_sub(1)).collect();
    s.push('…');
    s
}

/// Follow the saved theme choice: "light", "dark", anything else follows the system.
pub fn set_preference(ctx: &egui::Context, choice: &str) {
    ctx.set_theme(match choice {
        "light" => egui::ThemePreference::Light,
        "dark" => egui::ThemePreference::Dark,
        _ => egui::ThemePreference::System,
    });
}
