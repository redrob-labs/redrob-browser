//! Replaced-element and form-control sizing for Taffy leaves, plus the
//! font-metric helpers layout uses without shaping. Inline formatting
//! contexts (text shaping, line breaking, inline boxes) live in
//! [`crate::ifc`].

use std::sync::OnceLock;

use crate::{Dimension, LayoutStyle};

pub(crate) use crate::ifc::fonts::WebFont;

const FAMILY: &str = crate::ifc::fonts::SANS_FAMILY;
const SERIF_FAMILY: &str = crate::ifc::fonts::SERIF_FAMILY;
const MONO_FAMILY: &str = crate::ifc::fonts::MONO_FAMILY;
const SYSTEM_FAMILY: &str = crate::ifc::fonts::SYSTEM_FAMILY;
const DEFAULT: &str = crate::ifc::fonts::DEFAULT_FAMILY;

/// Whether text contains a code point that can request emoji presentation.
/// Keep the color face out of ordinary render passes: its bitmap table is
/// large, and loading it for every page would spend RSS and startup time even
/// when no emoji can be shaped.
pub(crate) fn text_may_need_emoji_font(text: &str) -> bool {
    // Every candidate below is outside ASCII; style sheets and most page text
    // are ASCII and skip the per-character match.
    if text.is_ascii() {
        return false;
    }
    text.chars().any(|ch| {
        matches!(
            ch,
            '\u{00A9}' | '\u{00AE}' | '\u{203C}' | '\u{2049}' | '\u{2122}' | '\u{2139}'
                | '\u{2194}'..='\u{2199}' | '\u{21A9}'..='\u{21AA}'
                | '\u{231A}'..='\u{231B}' | '\u{2328}' | '\u{23CF}'
                | '\u{23E9}'..='\u{23F3}' | '\u{23F8}'..='\u{23FA}' | '\u{24C2}'
                | '\u{25AA}'..='\u{25AB}' | '\u{25B6}' | '\u{25C0}'
                | '\u{25FB}'..='\u{25FE}' | '\u{2600}'..='\u{2604}' | '\u{2611}'
                | '\u{2614}'..='\u{2615}' | '\u{2618}' | '\u{261D}' | '\u{2620}'
                | '\u{2622}'..='\u{2623}' | '\u{2626}' | '\u{262A}'
                | '\u{262E}'..='\u{262F}' | '\u{2638}'..='\u{263A}' | '\u{2640}'
                | '\u{2642}' | '\u{2648}'..='\u{2653}' | '\u{265F}'..='\u{2660}'
                | '\u{2663}' | '\u{2665}'..='\u{2666}' | '\u{2668}' | '\u{267B}'
                | '\u{267E}'..='\u{267F}' | '\u{2692}'..='\u{2697}' | '\u{2699}'
                | '\u{269B}'..='\u{269C}' | '\u{26A0}'..='\u{26A1}' | '\u{26A7}'
                | '\u{26AA}'..='\u{26AB}' | '\u{26B0}'..='\u{26B1}'
                | '\u{26BD}'..='\u{26BE}' | '\u{26C4}'..='\u{26C5}' | '\u{26C8}'
                | '\u{26CE}'..='\u{26CF}' | '\u{26D1}' | '\u{26D3}'..='\u{26D4}'
                | '\u{26E9}'..='\u{26EA}' | '\u{26F0}'..='\u{26F5}'
                | '\u{26F7}'..='\u{26FA}' | '\u{26FD}' | '\u{2702}' | '\u{2705}'
                | '\u{2708}'..='\u{270D}' | '\u{270F}' | '\u{2712}' | '\u{2714}'
                | '\u{2716}' | '\u{271D}' | '\u{2721}' | '\u{2728}'
                | '\u{2733}'..='\u{2734}' | '\u{2744}' | '\u{2747}' | '\u{274C}'
                | '\u{274E}' | '\u{2753}'..='\u{2755}' | '\u{2757}'
                | '\u{2763}'..='\u{2764}' | '\u{2795}'..='\u{2797}' | '\u{27A1}'
                | '\u{27B0}' | '\u{27BF}' | '\u{2934}'..='\u{2935}'
                | '\u{2B05}'..='\u{2B07}' | '\u{2B1B}'..='\u{2B1C}' | '\u{2B50}'
                | '\u{2B55}' | '\u{3030}' | '\u{303D}' | '\u{3297}' | '\u{3299}'
                | '\u{FE0F}' | '\u{1F000}'..='\u{1FAFF}'
        )
    })
}

/// The bundled face Chromium would use for a CSS `font-family` list.
fn resolve_font_family(fam: Option<&str>) -> &'static str {
    let Some(f) = fam else { return DEFAULT };
    for tok in f.split(',') {
        if let Some(family) = crate::ifc::fonts::bundled_family_for_css_token(tok) {
            return family;
        }
    }
    DEFAULT
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct FaceMetrics {
    ascent: f32,
    descent: f32,
    line_gap: f32,
    units_per_em: f32,
}

/// Resolve `line-height: normal` from the selected face's horizontal header.
///
/// Chromium's FreeType-backed Linux path grid-fits the ascent, descent, and
/// line gap independently before adding them. Multiplying their sum by the
/// font size (or rounding the final line height) is observably different at
/// fractional and small sizes: Liberation Sans at 9.333px is 10px in
/// Chromium, not 11px. Keep these metrics beside the embedded faces so normal
/// line boxes follow the same device-pixel rhythm without consulting host
/// fonts.
fn bundled_face_metrics(family: &str) -> FaceMetrics {
    let (ascent, descent, line_gap) = match family {
        SERIF_FAMILY => (1825.0, 443.0, 87.0),
        MONO_FAMILY => (1705.0, 615.0, 0.0),
        SYSTEM_FAMILY => (1901.0, 483.0, 0.0),
        _ => (1854.0, 434.0, 67.0),
    };
    FaceMetrics {
        ascent,
        descent,
        line_gap,
        units_per_em: 2048.0,
    }
}

fn normal_line_height(font_size: f32, metrics: FaceMetrics) -> f32 {
    let scale = font_size / metrics.units_per_em.max(1.0);
    (metrics.ascent * scale).round()
        + (metrics.descent * scale).round()
        + (metrics.line_gap * scale).round()
}

fn used_line_height_with_metrics(style: &LayoutStyle, metrics: FaceMetrics) -> f32 {
    let font_size = style.font_size.unwrap_or(16.0);
    match style.line_height {
        Some(crate::LineHeight::Px(px)) => px,
        Some(crate::LineHeight::Ratio(ratio)) => font_size * ratio,
        Some(crate::LineHeight::Relative(relative)) => match relative {
            crate::Dimension::Percent(percent) => font_size * percent,
            dimension => match dimension.resolve(font_size, 16.0, 0.0, 0.0) {
                crate::Dimension::Px(px) => px,
                _ => font_size,
            },
        },
        None | Some(crate::LineHeight::Normal) => normal_line_height(font_size, metrics),
    }
}

/// Computed used line-height shared by shaped inline runs and forced-break
/// sentinels that cannot join a run.
pub(crate) fn used_line_height(style: &LayoutStyle) -> f32 {
    let family = resolve_font_family(style.font_family.as_deref());
    used_line_height_with_metrics(style, bundled_face_metrics(family))
}

/// Grid-fitted ascent and descent of the bundled face `style` selects.
pub(crate) fn fitted_font_ascent_descent(style: &LayoutStyle) -> (f32, f32) {
    let family = resolve_font_family(style.font_family.as_deref());
    fitted_font_box_metrics(
        style.font_size.unwrap_or(16.0),
        bundled_face_metrics(family),
    )
}

/// Grid-fitted ascent and descent of a face at `font_size`.
fn fitted_font_box_metrics(font_size: f32, metrics: FaceMetrics) -> (f32, f32) {
    let scale = font_size / metrics.units_per_em.max(1.0);
    (
        (metrics.ascent * scale).round(),
        (metrics.descent * scale).round(),
    )
}

thread_local! {
    static REUSE_SUSPENDED: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

/// Whether layouts on this thread may reuse work from earlier layouts.
pub(crate) fn layout_reuse_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| std::env::var_os("OBSCURA_LAYOUT_NO_TEXT_CACHE").is_none())
        && !REUSE_SUSPENDED.with(std::cell::Cell::get)
}

/// Run `f` with cross-layout reuse switched off on this thread.
pub(crate) fn without_shaped_item_reuse<R>(f: impl FnOnce() -> R) -> R {
    let previous = REUSE_SUSPENDED.with(|flag| flag.replace(true));
    let result = f();
    REUSE_SUSPENDED.with(|flag| flag.set(previous));
    result
}

/// What a replaced leaf's measure function depends on, so a later layout can
/// tell that it measures exactly as before.
#[derive(Clone)]
pub(crate) enum MeasureSignature {
    Replaced(ReplacedItem),
}

impl MeasureSignature {
    pub(crate) fn same_measure(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Replaced(a), Self::Replaced(b)) => a == b,
        }
    }
}

pub(crate) const REPLACED_CONTEXT_BIT: usize = 1usize << (usize::BITS - 1);

#[derive(Clone, Copy, PartialEq)]
pub(crate) struct ReplacedItem {
    independent_axes: bool,
    intrinsic_width: Option<f32>,
    intrinsic_height: Option<f32>,
    preferred_width: Option<f32>,
    preferred_height: Option<f32>,
    preferred_ratio: f32,
    min_width: Option<f32>,
    min_height: Option<f32>,
    max_width: Option<f32>,
    max_height: Option<f32>,
    /// Both intrinsic axes are absent but a real preferred ratio exists.
    /// CSS replaced sizing stretch-fits this case to a definite available
    /// inline size instead of using the 300x150 default-object contribution.
    ratio_only: bool,
    /// Definite normal-flow containing width captured before Taffy's intrinsic
    /// flex-item contribution pass. Only populated for ratio-only auto/auto
    /// replaced boxes; decoded raster dimensions never use it.
    ratio_only_available_width: Option<f32>,
    /// CSS Sizing's cyclic-percentage rule makes a proper replaced element's
    /// inline min-content contribution zero when its preferred or maximum
    /// inline size contains a percentage. The natural size still participates
    /// in max-content sizing and in the final definite layout.
    zero_inline_min_content: bool,
}

impl ReplacedItem {
    fn from_style(width: f32, height: f32, style: &LayoutStyle) -> Self {
        Self::from_intrinsic(
            crate::ReplacedIntrinsic::from_dimensions(width, height),
            style,
        )
    }

    fn from_intrinsic(intrinsic: crate::ReplacedIntrinsic, style: &LayoutStyle) -> Self {
        let px = |dimension| match dimension {
            Dimension::Px(value) => Some(value.max(0.0)),
            _ => None,
        };
        let expression_has_percentage = |index: usize| {
            style.size_expressions[index]
                .as_deref()
                .is_some_and(|expression| expression.contains('%'))
        };
        let explicit_ratio = style
            .aspect_ratio
            .filter(|ratio| ratio.is_finite() && *ratio > 0.0)
            .or_else(|| {
                intrinsic
                    .ratio
                    .filter(|ratio| ratio.is_finite() && *ratio > 0.0)
            });
        let intrinsic_ratio = intrinsic
            .ratio
            .filter(|ratio| ratio.is_finite() && *ratio > 0.0)
            .or_else(|| {
                let (width, height) = intrinsic.natural_size()?;
                (width.is_finite() && height.is_finite() && width > 0.0 && height > 0.0)
                    .then_some(width / height)
            })
            .unwrap_or(2.0);
        ReplacedItem {
            independent_axes: false,
            intrinsic_width: intrinsic
                .width
                .filter(|width| width.is_finite() && *width > 0.0),
            intrinsic_height: intrinsic
                .height
                .filter(|height| height.is_finite() && *height > 0.0),
            preferred_width: px(style.width),
            preferred_height: px(style.height),
            preferred_ratio: explicit_ratio.unwrap_or(intrinsic_ratio),
            min_width: px(style.min_width),
            min_height: px(style.min_height),
            max_width: px(style.max_width),
            max_height: px(style.max_height),
            ratio_only: intrinsic.width.is_none()
                && intrinsic.height.is_none()
                && explicit_ratio.is_some(),
            ratio_only_available_width: style.ratio_only_available_width,
            zero_inline_min_content: matches!(style.width, Dimension::Percent(_))
                || matches!(style.max_width, Dimension::Percent(_))
                || expression_has_percentage(0)
                || expression_has_percentage(4),
        }
    }

    fn clamp(value: f32, min: Option<f32>, max: Option<f32>) -> f32 {
        // CSS sizing gives the minimum precedence when min > max.
        let value = max.map_or(value, |max| value.min(max));
        min.map_or(value, |min| value.max(min))
    }

    /// Apply the CSS 2.1 10.4/10.7 constraint table for a replaced element
    /// whose preferred width and height are both auto. Unlike independently
    /// clamping the two axes, this transfers a one-axis min/max constraint
    /// through the preferred aspect ratio whenever the constraints allow it.
    fn constrain_auto_size(self, tentative: taffy::Size<f32>) -> taffy::Size<f32> {
        let min_width = self.min_width.unwrap_or(0.0);
        let min_height = self.min_height.unwrap_or(0.0);
        let max_width = self.max_width.unwrap_or(f32::INFINITY).max(min_width);
        let max_height = self.max_height.unwrap_or(f32::INFINITY).max(min_height);
        let width = tentative.width;
        let height = tentative.height;

        let height_at_max_width = (max_width / self.preferred_ratio).max(min_height);
        let height_at_min_width = (min_width / self.preferred_ratio).min(max_height);
        let width_at_max_height = (max_height * self.preferred_ratio).max(min_width);
        let width_at_min_height = (min_height * self.preferred_ratio).min(max_width);

        let (width, height) = if width > max_width {
            if height > max_height {
                if max_width * height <= max_height * width {
                    (max_width, height_at_max_width)
                } else {
                    (width_at_max_height, max_height)
                }
            } else {
                (max_width, height_at_max_width)
            }
        } else if width < min_width {
            if height < min_height {
                if min_width * height <= min_height * width {
                    (width_at_min_height, min_height)
                } else {
                    (min_width, height_at_min_width)
                }
            } else {
                (min_width, height_at_min_width)
            }
        } else if height > max_height {
            (width_at_max_height, max_height)
        } else if height < min_height {
            (width_at_min_height, min_height)
        } else {
            (width, height)
        };

        taffy::Size { width, height }
    }

    fn size(self, known: taffy::Size<Option<f32>>) -> taffy::Size<f32> {
        if self.independent_axes {
            return taffy::Size {
                width: known.width.or(self.intrinsic_width).unwrap_or(0.0),
                height: known.height.or(self.intrinsic_height).unwrap_or(0.0),
            };
        }
        let (width, height) = match (known.width, known.height) {
            (Some(width), Some(height)) => (width, height),
            (Some(width), None) => (width, width / self.preferred_ratio),
            (None, Some(height)) => (height * self.preferred_ratio, height),
            (None, None) => match (self.preferred_width, self.preferred_height) {
                (Some(width), Some(height)) => (width, height),
                (Some(width), None) => (width, width / self.preferred_ratio),
                (None, Some(height)) => (height * self.preferred_ratio, height),
                (None, None) => match (self.intrinsic_width, self.intrinsic_height) {
                    (Some(width), Some(height)) => (width, height),
                    (Some(width), None) => (width, width / self.preferred_ratio),
                    (None, Some(height)) => (height * self.preferred_ratio, height),
                    // Contain the intrinsic ratio inside CSS Images' 300x150
                    // default object size. A definite authored/known axis is
                    // handled above and transfers through the same ratio.
                    (None, None) => {
                        let width = if self.preferred_ratio >= 2.0 {
                            300.0
                        } else {
                            150.0 * self.preferred_ratio
                        };
                        (width, width / self.preferred_ratio)
                    }
                },
            },
        };
        let tentative = taffy::Size { width, height };
        if self.preferred_width.is_none()
            && self.preferred_height.is_none()
            && (known.width.is_none() || known.height.is_none())
        {
            self.constrain_auto_size(tentative)
        } else {
            taffy::Size {
                width: Self::clamp(width, self.min_width, self.max_width),
                height: Self::clamp(height, self.min_height, self.max_height),
            }
        }
    }
}

pub(crate) fn constrained_auto_replaced_size(
    width: f32,
    height: f32,
    style: &LayoutStyle,
) -> taffy::Size<f32> {
    ReplacedItem::from_style(width, height, style).size(taffy::Size {
        width: None,
        height: None,
    })
}

/// The measured leaves of one layout: replaced elements and native form
/// controls. Their Taffy contexts carry `REPLACED_CONTEXT_BIT`.
#[derive(Default)]
pub struct TextEngine {
    replaced: Vec<ReplacedItem>,
}

impl TextEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub(crate) fn for_document_layout(_fonts: &[WebFont], _load_emoji: bool) -> Self {
        Self::default()
    }

    /// The measure signature of taffy context `idx`.
    pub(crate) fn measure_signature(&self, idx: usize) -> Option<MeasureSignature> {
        if idx & REPLACED_CONTEXT_BIT == 0 {
            return None;
        }
        self.replaced
            .get(idx & !REPLACED_CONTEXT_BIT)
            .copied()
            .map(MeasureSignature::Replaced)
    }

    /// Register a replaced element (img/svg/canvas/video) as a measured leaf.
    pub fn register_replaced(&mut self, width: f32, height: f32, style: &LayoutStyle) -> usize {
        self.register_replaced_intrinsic(
            crate::ReplacedIntrinsic::from_dimensions(width, height),
            style,
        )
    }

    pub(crate) fn register_native_control(
        &mut self,
        width: f32,
        height: f32,
        style: &LayoutStyle,
    ) -> usize {
        let mut item = ReplacedItem::from_style(width, height, style);
        item.independent_axes = true;
        let index = self.replaced.len();
        self.replaced.push(item);
        REPLACED_CONTEXT_BIT | index
    }

    pub(crate) fn register_replaced_intrinsic(
        &mut self,
        intrinsic: crate::ReplacedIntrinsic,
        style: &LayoutStyle,
    ) -> usize {
        let index = self.replaced.len();
        self.replaced
            .push(ReplacedItem::from_intrinsic(intrinsic, style));
        REPLACED_CONTEXT_BIT | index
    }

    /// Measure an intrinsic replaced element. Replaced boxes transfer a
    /// definite axis through their intrinsic ratio; with neither axis definite
    /// they contribute their natural size.
    pub fn measure_taffy(
        &mut self,
        idx: usize,
        known: taffy::Size<Option<f32>>,
        available: taffy::Size<taffy::AvailableSpace>,
    ) -> taffy::Size<f32> {
        if idx & REPLACED_CONTEXT_BIT != 0 {
            let replaced = self.replaced[idx & !REPLACED_CONTEXT_BIT];
            let stretch_width = (replaced.ratio_only
                && replaced.preferred_width.is_none()
                && replaced.preferred_height.is_none()
                && known.width.is_none())
            .then(|| match available.width {
                taffy::AvailableSpace::Definite(width) => Some(width.max(0.0)),
                _ => replaced.ratio_only_available_width,
            })
            .flatten();
            let mut size = replaced.size(taffy::Size {
                width: known.width.or(stretch_width),
                height: known.height,
            });
            if replaced.zero_inline_min_content
                && known.width.is_none()
                && matches!(available.width, taffy::AvailableSpace::MinContent)
            {
                size.width = 0.0;
            }
            return size;
        }
        taffy::Size::ZERO
    }

    /// Grid-fitted ascent plus descent of the bundled face for `style`.
    pub(crate) fn inline_font_box_height(&self, style: &LayoutStyle) -> f32 {
        let family = resolve_font_family(style.font_family.as_deref());
        let (ascent, descent) = fitted_font_box_metrics(
            style.font_size.unwrap_or(16.0),
            bundled_face_metrics(family),
        );
        ascent + descent
    }

    /// The used line-height of `style`.
    pub(crate) fn selected_line_height(&self, style: &LayoutStyle) -> f32 {
        used_line_height(style)
    }
}

/// Replaced / atomic-inline tags: their box does not contain text, so folding
/// one into a shaped buffer would drop its content entirely. A subtree that
/// contains one is never a pure-text IFC (it keeps the general build path,
/// where the element gets a real taffy box). This is by tag, not display, so a
/// stylesheet setting `img{display:inline}` cannot trick us into folding it.
pub(crate) fn is_replaced(local: &str) -> bool {
    matches!(
        local,
        "img"
            | "svg"
            | "canvas"
            | "video"
            | "audio"
            | "iframe"
            | "embed"
            | "object"
            | "input"
            | "textarea"
            | "select"
            | "button"
            | "progress"
            | "meter"
    )
}

/// Elements that use CSS's intrinsic replaced-size algorithm. This is
/// deliberately narrower than `is_replaced`: ordinary form controls are
/// atomic inline boxes, but grid `normal` stretches them like non-replaced
/// boxes in Chromium and Gecko.
pub(crate) fn has_replaced_sizing(local: &str) -> bool {
    matches!(
        local,
        "img" | "canvas" | "video" | "audio" | "iframe" | "embed" | "object" | "progress" | "meter"
    )
}

/// HTML's default object size for replaced media whose intrinsic metadata is
/// not available yet. Canvas dimensions and decoded video metadata can replace
/// these defaults before layout when present.
pub(crate) fn default_replaced_intrinsic_size(
    local: &str,
    font_size: f32,
    has_controls: bool,
    has_resource: bool,
) -> Option<(f32, f32)> {
    match local {
        "canvas" | "video" | "iframe" | "object" => Some((300.0, 150.0)),
        "embed" if has_resource => Some((300.0, 150.0)),
        "audio" if has_controls => Some((300.0, 54.0)),
        "progress" => Some((font_size * 10.0, font_size)),
        "meter" => Some((font_size * 5.0, font_size)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replaced_percentage_math_only_zeroes_inline_min_content() {
        for expression_index in [0, 4] {
            let mut engine = TextEngine::new();
            let mut style = LayoutStyle::default();
            style.size_expressions[expression_index] = Some("calc(100% - 1px)".to_string());
            let item = engine.register_replaced(800.0, 400.0, &style);
            let unknown = taffy::Size {
                width: None,
                height: None,
            };
            let min_content = engine.measure_taffy(
                item,
                unknown,
                taffy::Size {
                    width: taffy::AvailableSpace::MinContent,
                    height: taffy::AvailableSpace::MaxContent,
                },
            );
            let max_content = engine.measure_taffy(
                item,
                unknown,
                taffy::Size {
                    width: taffy::AvailableSpace::MaxContent,
                    height: taffy::AvailableSpace::MaxContent,
                },
            );
            let final_size = engine.measure_taffy(
                item,
                taffy::Size {
                    width: Some(300.0),
                    height: None,
                },
                taffy::Size {
                    width: taffy::AvailableSpace::Definite(300.0),
                    height: taffy::AvailableSpace::MaxContent,
                },
            );

            assert_eq!(min_content.width, 0.0);
            assert_eq!(max_content.width, 800.0);
            assert_eq!(max_content.height, 400.0);
            assert_eq!(final_size.width, 300.0);
            assert_eq!(final_size.height, 150.0);
        }
    }

    #[test]
    fn partial_replaced_intrinsics_use_the_default_object_axis() {
        let unknown = taffy::Size {
            width: None,
            height: None,
        };
        let style = LayoutStyle::default();
        let width_only = ReplacedItem::from_intrinsic(
            crate::ReplacedIntrinsic {
                width: Some(100.0),
                height: None,
                ratio: None,
            },
            &style,
        )
        .size(unknown);
        assert_eq!((width_only.width, width_only.height), (100.0, 150.0));

        let height_only = ReplacedItem::from_intrinsic(
            crate::ReplacedIntrinsic {
                width: None,
                height: Some(100.0),
                ratio: None,
            },
            &style,
        )
        .size(unknown);
        assert_eq!((height_only.width, height_only.height), (300.0, 100.0));
    }

    #[test]
    fn both_auto_replaced_constraints_transfer_through_preferred_ratio() {
        let unknown = taffy::Size {
            width: None,
            height: None,
        };
        let measure =
            |style: &LayoutStyle| ReplacedItem::from_style(512.0, 323.0, style).size(unknown);

        let max_height = LayoutStyle {
            max_height: Dimension::Px(128.0),
            ..Default::default()
        };
        let size = measure(&max_height);
        assert!((size.width - 202.89783).abs() < 0.001, "{size:?}");
        assert!((size.height - 128.0).abs() < 0.001, "{size:?}");

        let max_width = LayoutStyle {
            max_width: Dimension::Px(256.0),
            ..Default::default()
        };
        let size = measure(&max_width);
        assert!((size.width - 256.0).abs() < 0.001, "{size:?}");
        assert!((size.height - 161.5).abs() < 0.001, "{size:?}");

        let min_width = LayoutStyle {
            min_width: Dimension::Px(1024.0),
            ..Default::default()
        };
        let size = measure(&min_width);
        assert!((size.width - 1024.0).abs() < 0.001, "{size:?}");
        assert!((size.height - 646.0).abs() < 0.001, "{size:?}");

        let min_height = LayoutStyle {
            min_height: Dimension::Px(646.0),
            ..Default::default()
        };
        let size = measure(&min_height);
        assert!((size.width - 1024.0).abs() < 0.001, "{size:?}");
        assert!((size.height - 646.0).abs() < 0.001, "{size:?}");

        // A non-intrinsic authored ratio is the preferred ratio used for
        // transfer, rather than the decoded resource's natural ratio.
        let authored_ratio = LayoutStyle {
            max_height: Dimension::Px(128.0),
            aspect_ratio: Some(4.0),
            ..Default::default()
        };
        let size = measure(&authored_ratio);
        assert!((size.width - 512.0).abs() < 0.001, "{size:?}");
        assert!((size.height - 128.0).abs() < 0.001, "{size:?}");
    }

    #[test]
    fn inline_descendant_keeps_its_computed_font_metrics() {
        let tree = obscura_dom::parse_html(
            r#"<style>
                #copy { font-size:16px; line-height:20px }
                #big { font-size:2em; line-height:1.5 }
            </style>
            <p id="copy">small <a id="big">large</a></p>"#,
        );
        let copy = tree.get_element_by_id("copy").unwrap();
        let big = tree.get_element_by_id("big").unwrap();
        let laid = crate::dom::layout_dom(&tree, (500.0, 200.0));

        assert_eq!(laid.styles[&big].font_size, Some(32.0));
        let ifc = laid.ifc.get(laid.ifc.by_node[&copy][0]).unwrap();
        let glyph_sizes = ifc
            .final_layout()
            .lines()
            .flat_map(|line| {
                line.items()
                    .filter_map(|item| match item {
                        parley::PositionedLayoutItem::GlyphRun(run) => Some(run.run().font_size()),
                        _ => None,
                    })
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>();
        assert!(
            glyph_sizes.iter().any(|size| (*size - 16.0).abs() < 0.01),
            "base text should shape at 16px: {glyph_sizes:?}"
        );
        assert!(
            glyph_sizes.iter().any(|size| (*size - 32.0).abs() < 0.01),
            "inline descendant should shape at 32px: {glyph_sizes:?}"
        );
    }

    #[test]
    fn preformatted_newlines_preserve_authored_line_count() {
        let tree = obscura_dom::parse_html(
            r#"<style>
                html,body { margin:0 }
                .box { margin:0; width:200px; font:16px/24px monospace }
                #explicit { white-space:pre-wrap }
                #normal { white-space:normal }
            </style>
            <pre id="ua" class="box"><code>alpha
beta
gamma</code></pre>
            <div id="explicit" class="box">alpha
beta
gamma</div>
            <div id="normal" class="box">alpha
beta
gamma</div>"#,
        );
        let laid = crate::dom::layout_dom(&tree, (400.0, 300.0));
        let rect = |id| laid.rects[&tree.get_element_by_id(id).unwrap()];

        assert_eq!(
            laid.styles[&tree.get_element_by_id("ua").unwrap()].white_space,
            Some(crate::WhiteSpace::Pre)
        );
        assert_eq!(
            laid.styles[&tree.get_element_by_id("explicit").unwrap()].white_space,
            Some(crate::WhiteSpace::PreWrap)
        );
        assert!((rect("ua").height - 72.0).abs() < 0.01, "{:?}", rect("ua"));
        assert!(
            (rect("explicit").height - 72.0).abs() < 0.01,
            "{:?}",
            rect("explicit")
        );
        assert!(
            (rect("normal").height - 24.0).abs() < 0.01,
            "{:?}",
            rect("normal")
        );
    }

    #[test]
    fn text_wrap_style_is_inherited_and_can_be_reset() {
        let tree = obscura_dom::parse_html(
            r#"<style>
                #outer { text-wrap:balance }
                #reset { text-wrap-style:auto }
            </style>
            <div id="outer">
                <h1 id="inherited">balanced heading words</h1>
                <h1 id="reset">ordinary heading words</h1>
            </div>"#,
        );
        let inherited = tree.get_element_by_id("inherited").unwrap();
        let reset = tree.get_element_by_id("reset").unwrap();
        let laid = crate::dom::layout_dom(&tree, (500.0, 300.0));

        assert_eq!(
            laid.styles[&inherited].text_wrap_style,
            Some(crate::TextWrapStyle::Balance)
        );
        assert_eq!(
            laid.styles[&reset].text_wrap_style,
            Some(crate::TextWrapStyle::Auto)
        );
    }
}
