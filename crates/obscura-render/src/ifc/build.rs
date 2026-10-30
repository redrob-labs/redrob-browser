//! Building an inline formatting context: DOM content -> Parley text, style
//! spans and inline boxes.
//!
//! Portions derived from Blitz (https://github.com/DioxusLabs/blitz), MIT OR Apache-2.0
//! (`blitz-dom/src/layout/inline/build.rs`).

use std::borrow::Cow;
use std::collections::HashMap;

use obscura_dom::tree::{DomTree, NodeId};
use parley::{
    FontFeature, FontStyle, FontVariation, FontWeight, InlineBox, InlineBoxEdge, InlineBoxKind,
    LineHeight, OverflowWrap, StyleProperty, TextStyle, TextWrapMode, WhiteSpaceCollapse,
    WordBreak,
};

use super::{
    BaselineSource, BoxKind, Brush, Ifc, IfcBox, IfcStore, InlineEdge, RootParams, Span, SpanOwner,
    TextPaint, TextRange,
};
use crate::dom::GeneratedBoxKind;
use crate::LayoutStyle;

/// One piece of an inline formatting context's content, in document order.
#[derive(Clone, Debug)]
pub(crate) enum Item {
    /// A DOM text node.
    Text(NodeId),
    /// Generated text of a `::before`/`::after` (its span is open).
    GeneratedText(String),
    /// The start of a non-atomic inline element or inline pseudo-element.
    SpanStart(SpanOwner),
    /// A fragment of an inline element split around a block: whether its
    /// inline-start and inline-end edges belong to this IFC.
    SplitSpanStart(NodeId, bool, bool),
    SpanEnd,
    /// An atomic inline box (inline-block, inline-flex/grid, replaced element).
    Atomic {
        dom: Option<NodeId>,
        node: taffy::NodeId,
        baseline: BaselineSource,
    },
    Float {
        dom: Option<NodeId>,
        node: taffy::NodeId,
    },
    OutOfFlow {
        dom: Option<NodeId>,
        node: taffy::NodeId,
    },
    Break(NodeId),
}

/// The style of a span owner.
fn owner_style<'a>(
    owner: SpanOwner,
    styles: &'a HashMap<NodeId, LayoutStyle>,
) -> Option<&'a LayoutStyle> {
    match owner {
        SpanOwner::Element(node) => styles.get(&node),
        SpanOwner::Pseudo(host, GeneratedBoxKind::Before) => {
            styles.get(&host)?.before_pseudo.as_deref()
        }
        SpanOwner::Pseudo(host, GeneratedBoxKind::After) => {
            styles.get(&host)?.after_pseudo.as_deref()
        }
    }
}

fn owner_node(owner: SpanOwner) -> NodeId {
    match owner {
        SpanOwner::Element(node) | SpanOwner::Pseudo(node, _) => node,
    }
}

/// Resolve an inline-axis length that may be relative to the font.
fn font_relative(value: crate::Dimension, font_size: f32) -> f32 {
    match value.resolve(font_size, 16.0, 0.0, 0.0) {
        crate::Dimension::Px(px) => px,
        _ => 0.0,
    }
}

/// Used `line-height` of a style as a Parley line height.
pub(crate) fn line_height(style: &LayoutStyle) -> LineHeight {
    let font_size = style.font_size.unwrap_or(16.0);
    match style.line_height {
        Some(crate::LineHeight::Px(px)) => LineHeight::Absolute(px),
        Some(crate::LineHeight::Ratio(ratio)) => LineHeight::FontSizeRelative(ratio),
        Some(crate::LineHeight::Relative(relative)) => match relative {
            crate::Dimension::Percent(percent) => LineHeight::Absolute(font_size * percent),
            dimension => LineHeight::Absolute(font_relative(dimension, font_size)),
        },
        None | Some(crate::LineHeight::Normal) => LineHeight::MetricsRelative(1.0),
    }
}

/// Parley vertical alignment of an inline element or atomic box.
pub(crate) fn vertical_align(style: &LayoutStyle) -> parley::VerticalAlign {
    use crate::InlineVerticalAlign as V;
    let font_size = style.font_size.unwrap_or(16.0);
    match style.vertical_align_inline.unwrap_or_default() {
        V::Baseline => parley::VerticalAlign::BASELINE,
        V::Sub => parley::VerticalAlign::SUB,
        V::Super => parley::VerticalAlign::SUPER,
        V::TextTop => parley::VerticalAlign::TEXT_TOP,
        V::TextBottom => parley::VerticalAlign::TEXT_BOTTOM,
        V::Middle => parley::VerticalAlign::MIDDLE,
        V::Top => parley::VerticalAlign::TOP,
        V::Bottom => parley::VerticalAlign::BOTTOM,
        V::Length(px) => parley::VerticalAlign::length(px),
        V::Percent(fraction) => {
            let line_height = match line_height(style) {
                LineHeight::Absolute(px) => px,
                LineHeight::FontSizeRelative(ratio) => ratio * font_size,
                LineHeight::MetricsRelative(_) => font_size * 1.15,
            };
            parley::VerticalAlign::length(line_height * fraction)
        }
    }
}

fn white_space(style: &LayoutStyle) -> (WhiteSpaceCollapse, TextWrapMode) {
    match style.white_space.unwrap_or_default() {
        crate::WhiteSpace::Normal => (WhiteSpaceCollapse::Collapse, TextWrapMode::Wrap),
        crate::WhiteSpace::NoWrap => (WhiteSpaceCollapse::Collapse, TextWrapMode::NoWrap),
        crate::WhiteSpace::Pre => (WhiteSpaceCollapse::Preserve, TextWrapMode::NoWrap),
        crate::WhiteSpace::PreWrap => (WhiteSpaceCollapse::Preserve, TextWrapMode::Wrap),
        crate::WhiteSpace::PreLine => (WhiteSpaceCollapse::PreserveBreaks, TextWrapMode::Wrap),
        crate::WhiteSpace::BreakSpaces => (WhiteSpaceCollapse::BreakSpaces, TextWrapMode::Wrap),
    }
}

/// The Parley text style of an element.
pub(crate) fn text_style(
    fonts: &mut super::fonts::Fonts,
    style: &LayoutStyle,
    brush: Brush,
) -> TextStyle<'static, 'static, Brush> {
    let font_size = style.font_size.unwrap_or(16.0).max(0.0);
    let (white_space_collapse, text_wrap_mode) = white_space(style);
    let (word_break, overflow_wrap) = match (
        style.word_break.unwrap_or_default(),
        style.overflow_wrap.unwrap_or_default(),
    ) {
        (crate::WordBreak::BreakWord, _) => (WordBreak::Normal, OverflowWrap::Anywhere),
        (word_break, overflow_wrap) => (
            match word_break {
                crate::WordBreak::BreakAll => WordBreak::BreakAll,
                crate::WordBreak::KeepAll => WordBreak::KeepAll,
                _ => WordBreak::Normal,
            },
            match overflow_wrap {
                crate::OverflowWrap::Normal => OverflowWrap::Normal,
                crate::OverflowWrap::BreakWord => OverflowWrap::BreakWord,
                crate::OverflowWrap::Anywhere => OverflowWrap::Anywhere,
            },
        ),
    };
    let mut variations: Vec<FontVariation> = style
        .font_variation_settings
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter(|setting| setting.value.is_finite())
        .map(|setting| FontVariation {
            tag: parley::setting::Tag::new(&setting.tag),
            value: setting.value,
        })
        .collect();
    // `font-optical-sizing: auto` sets a variable font's `opsz` axis to the
    // font size in CSS px; an explicit `opsz` setting wins. Faces without the
    // axis ignore it, and the face clamps it to its own range.
    let opsz = parley::setting::Tag::new(b"opsz");
    if style.font_optical_sizing.unwrap_or_default() == crate::FontOpticalSizing::Auto
        && !variations.iter().any(|variation| variation.tag == opsz)
    {
        variations.push(FontVariation {
            tag: opsz,
            value: style.font_size.unwrap_or(16.0),
        });
    }
    let letter_spacing = style.letter_spacing.unwrap_or(0.0);
    let features: Vec<FontFeature> = if style.letter_spacing_non_normal.unwrap_or(false)
        && letter_spacing.is_finite()
        && letter_spacing != 0.0
    {
        // Chromium disables optional ligatures under non-zero letter-spacing.
        vec![
            FontFeature {
                tag: parley::setting::Tag::new(b"liga"),
                value: 0,
            },
            FontFeature {
                tag: parley::setting::Tag::new(b"clig"),
                value: 0,
            },
        ]
    } else {
        Vec::new()
    };
    TextStyle {
        font_family: fonts.families(style.font_family.as_deref()),
        font_size,
        font_width: parley::FontWidth::NORMAL,
        font_style: if style.font_style_italic.unwrap_or(false) {
            FontStyle::Italic
        } else {
            FontStyle::Normal
        },
        font_weight: FontWeight::new(crate::style::used_font_weight(style) as f32),
        font_variations: parley::FontVariations::List(Cow::Owned(variations)),
        font_features: parley::FontFeatures::List(Cow::Owned(features)),
        locale: None,
        brush,
        has_underline: false,
        underline_offset: None,
        underline_size: None,
        underline_brush: None,
        has_strikethrough: false,
        strikethrough_offset: None,
        strikethrough_size: None,
        strikethrough_brush: None,
        line_height: line_height(style),
        vertical_align: vertical_align(style),
        word_spacing: style
            .word_spacing
            .filter(|spacing| spacing.is_finite())
            .unwrap_or(0.0),
        letter_spacing: if letter_spacing.is_finite() {
            letter_spacing
        } else {
            0.0
        },
        word_break,
        line_break: parley::LineBreak::Normal,
        overflow_wrap,
        text_wrap_mode,
        white_space_collapse,
    }
}

/// UAX #14 classes of printable ASCII, as Blink's break-all pair table uses
/// them (PLUS SIGN tailored to AL).
#[derive(Clone, Copy, PartialEq, Eq)]
enum AsciiClass {
    Al,
    Nu,
    Hy,
    Sy,
    Ba,
    Pr,
    Po,
    Cp,
    Cl,
    Op,
    Ex,
    Is,
    Qu,
    Other,
}

fn ascii_class(ch: char) -> AsciiClass {
    use AsciiClass::*;
    match ch {
        'a'..='z' | 'A'..='Z' => Al,
        '0'..='9' => Nu,
        '-' => Hy,
        '/' => Sy,
        '|' => Ba,
        '+' => Al,
        '$' | '\\' => Pr,
        '%' => Po,
        ')' | ']' => Cp,
        '}' => Cl,
        '(' | '[' | '{' => Op,
        '!' | '?' => Ex,
        ',' | '.' | ':' | ';' => Is,
        '"' | '\'' => Qu,
        '#' | '&' | '*' | '@' | '^' | '_' | '`' | '~' | '<' | '=' | '>' => Al,
        _ => Other,
    }
}

/// Blink's `word-break: break-all` pair table for ASCII
/// (`kBreakAllLineBreakClassTable`): the extra opportunities break-all adds.
fn break_all_pair(before: char, after: char) -> bool {
    use AsciiClass::*;
    let (b, a) = (ascii_class(before), ascii_class(after));
    let after_vertical_line = after == '|';
    let al_like_after = matches!(a, Al | Hy | Nu | Op | Pr) || after_vertical_line;
    match b {
        Al | Nu | Sy | Ba => al_like_after,
        Cl => matches!(a, Al | Hy | Nu | Pr) || after_vertical_line,
        Cp => matches!(a, Al | Hy | Nu | Pr) || after_vertical_line,
        Ex | Po => matches!(a, Al | Hy | Nu | Po | Pr) || after_vertical_line,
        Is => matches!(a, Al | Hy | Nu) || after_vertical_line,
        Hy => a == Nu,
        Pr => a == Po,
        _ => false,
    }
}

/// Line break opportunities as Chromium finds them: its ASCII pair table in
/// normal text, plus its break-all pair table where `word-break: break-all`.
fn chromium_line_break(cx: parley::LineBreakContext) -> Option<bool> {
    let normal = (parley::CHROMIUM_LINE_BREAK_OVERRIDE)(cx);
    if !cx.break_all || !cx.before.is_ascii() || !cx.after.is_ascii() {
        return normal;
    }
    if cx.before == ' ' || cx.after == ' ' {
        return normal;
    }
    Some(normal.unwrap_or(false) || break_all_pair(cx.before, cx.after))
}

static LINE_BREAK_OVERRIDE: &parley::LineBreakOverrideFn =
    &(chromium_line_break as fn(parley::LineBreakContext) -> Option<bool>);

/// Whether an inline element generates no box fragment of its own in
/// Chromium (a "culled" inline): no box decoration, positioning, vertical
/// alignment or font metrics of its own.
fn is_culled(style: &LayoutStyle, parent: &LayoutStyle) -> bool {
    let edges_zero =
        |e: &crate::Edges| e.top == 0.0 && e.right == 0.0 && e.bottom == 0.0 && e.left == 0.0;
    edges_zero(&style.padding)
        && edges_zero(&style.border)
        && style.margin.left == 0.0
        && style.margin.right == 0.0
        && style.background_color.is_none_or(|color| color[3] == 0)
        && style.background_image.is_none()
        && style.background_gradient.is_none()
        && style.box_shadow.is_none()
        && style.position.is_none()
        && matches!(
            style.vertical_align_inline,
            None | Some(crate::InlineVerticalAlign::Baseline)
        )
        && style.font_size == parent.font_size
        && style.font_family == parent.font_family
        && style.line_height == parent.line_height
}

/// Inline-axis edges of an inline element (left/right in horizontal text).
fn inline_edges(style: &LayoutStyle) -> (InlineEdge, InlineEdge) {
    let rtl = style.direction == Some(taffy::Direction::Rtl);
    let left = InlineEdge {
        margin: style.margin.left,
        border: style.border.left,
        padding: style.padding.left,
    };
    let right = InlineEdge {
        margin: style.margin.right,
        border: style.border.right,
        padding: style.padding.right,
    };
    if rtl {
        (right, left)
    } else {
        (left, right)
    }
}

/// Applies `text-transform` to text, tracking word starts across text nodes.
struct CaseTransformer {
    at_word_start: bool,
}

impl CaseTransformer {
    fn transform<'t>(&mut self, text: &'t str, transform: crate::TextTransform) -> Cow<'t, str> {
        match transform {
            crate::TextTransform::None => {
                if let Some(last) = text.chars().last() {
                    self.at_word_start = !last.is_alphanumeric();
                }
                Cow::Borrowed(text)
            }
            crate::TextTransform::Uppercase => {
                if let Some(last) = text.chars().last() {
                    self.at_word_start = !last.is_alphanumeric();
                }
                Cow::Owned(text.to_uppercase())
            }
            crate::TextTransform::Lowercase => {
                if let Some(last) = text.chars().last() {
                    self.at_word_start = !last.is_alphanumeric();
                }
                Cow::Owned(text.to_lowercase())
            }
            crate::TextTransform::Capitalize => {
                let mut out = String::with_capacity(text.len());
                for ch in text.chars() {
                    if ch.is_alphanumeric() {
                        if self.at_word_start {
                            out.extend(ch.to_uppercase());
                        } else {
                            out.push(ch);
                        }
                        self.at_word_start = false;
                    } else {
                        // Apostrophes and hyphens stay inside a word, as in
                        // Chromium's word-start detection.
                        if !matches!(ch, '\'' | '’' | '-' | '_') {
                            self.at_word_start = true;
                        }
                        out.push(ch);
                    }
                }
                Cow::Owned(out)
            }
        }
    }
}

/// Text decorations in force for text inside an element (they propagate to
/// descendants; an element only adds its own).
#[derive(Clone, Copy, Default)]
struct Decorations {
    underline: bool,
    overline: bool,
    line_through: bool,
}

impl Decorations {
    fn with(self, style: &LayoutStyle) -> Self {
        Self {
            underline: self.underline || style.underline.unwrap_or(false),
            overline: self.overline || style.overline.unwrap_or(false),
            line_through: self.line_through || style.line_through.unwrap_or(false),
        }
    }
}

impl IfcStore {
    /// Build an IFC from its content items. `root` is the element whose
    /// style is the root inline style; `anonymous` marks an anonymous block
    /// wrapper inside `root`.
    pub(crate) fn create(
        &mut self,
        tree: &DomTree,
        styles: &HashMap<NodeId, LayoutStyle>,
        root: NodeId,
        root_style: &LayoutStyle,
        anonymous: bool,
        items: &[Item],
        params: RootParams,
    ) -> Option<usize> {
        let fonts = self.fonts.as_mut()?;

        // Paint entries and the span text styles are resolved before the
        // builder borrows the font context.
        struct Frame<'s> {
            span: Option<u32>,
            decorations: Decorations,
            color: [u8; 4],
            transform: crate::TextTransform,
            clip_fill: Option<u32>,
            owner: NodeId,
            white_space: WhiteSpaceCollapse,
            style: &'s LayoutStyle,
            offset: (f32, f32),
        }
        let root_decorations = Decorations::default().with(root_style);
        let root_color = root_style.color.unwrap_or([0, 0, 0, 255]);
        let root_fill = root_style.background_clip_text.then_some(0);
        let mut paints: Vec<TextPaint> = vec![TextPaint {
            color: root_color,
            underline: root_decorations.underline,
            overline: root_decorations.overline,
            line_through: root_decorations.line_through,
            text_node: None,
            span: None,
            clip_fill: root_fill,
            owner: root,
            offset: (0.0, 0.0),
        }];
        let mut spans: Vec<Span> = Vec::new();
        let mut span_text_styles: Vec<TextStyle<'static, 'static, Brush>> = Vec::new();
        // Per item: the paint (brush) of a text item or span.
        let mut item_paint: Vec<u32> = Vec::with_capacity(items.len());
        let mut stack: Vec<Frame> = vec![Frame {
            span: None,
            decorations: root_decorations,
            color: root_color,
            transform: root_style
                .text_transform
                .unwrap_or(crate::TextTransform::None),
            clip_fill: root_fill,
            owner: root,
            white_space: white_space(root_style).0,
            style: root_style,
            offset: (0.0, 0.0),
        }];
        for item in items {
            let parent = stack.last().expect("root frame");
            match item {
                Item::Text(node) => {
                    item_paint.push(paints.len() as u32);
                    paints.push(TextPaint {
                        color: parent.color,
                        underline: parent.decorations.underline,
                        overline: parent.decorations.overline,
                        line_through: parent.decorations.line_through,
                        text_node: Some(*node),
                        span: parent.span,
                        clip_fill: parent.clip_fill,
                        owner: parent.owner,
                        offset: parent.offset,
                    });
                }
                Item::GeneratedText(_) => {
                    item_paint.push(paints.len() as u32);
                    paints.push(TextPaint {
                        color: parent.color,
                        underline: parent.decorations.underline,
                        overline: parent.decorations.overline,
                        line_through: parent.decorations.line_through,
                        text_node: None,
                        span: parent.span,
                        clip_fill: parent.clip_fill,
                        owner: parent.owner,
                        offset: parent.offset,
                    });
                }
                Item::SpanStart(_) | Item::SplitSpanStart(..) => {
                    let (owner, keep_start, keep_end) = match item {
                        Item::SplitSpanStart(id, start, end) => {
                            (&SpanOwner::Element(*id), *start, *end)
                        }
                        Item::SpanStart(owner) => (owner, true, true),
                        _ => unreachable!(),
                    };
                    let style = owner_style(*owner, styles).unwrap_or(root_style);
                    let span_index = spans.len() as u32;
                    let (mut start, mut end) = inline_edges(style);
                    if !keep_start {
                        start = InlineEdge::default();
                    }
                    if !keep_end {
                        end = InlineEdge::default();
                    }
                    let color = style.color.unwrap_or(parent.color);
                    let paint = paints.len() as u32;
                    let clip_fill = if style.background_clip_text {
                        Some(paint)
                    } else if color[3] == 0 {
                        parent.clip_fill
                    } else {
                        None
                    };
                    let decorations = parent.decorations.with(style);
                    // Relative offsets resolve against the content box at layout.
                    let offset = parent.offset;
                    let inset = (style.position == Some(taffy::Position::Relative)
                        && !style.position_sticky)
                        .then_some(style.inset);
                    paints.push(TextPaint {
                        color,
                        underline: decorations.underline,
                        overline: decorations.overline,
                        line_through: decorations.line_through,
                        text_node: None,
                        span: Some(span_index),
                        clip_fill,
                        owner: owner_node(*owner),
                        offset,
                    });
                    let culled = is_culled(style, parent.style);
                    spans.push(Span {
                        owner: *owner,
                        parent: parent.span,
                        start,
                        end,
                        block_start: style.border.top + style.padding.top,
                        block_end: style.border.bottom + style.padding.bottom,
                        ascent: 0.0,
                        descent: 0.0,
                        relative: offset,
                        inset,
                        font_size: style.font_size.unwrap_or(16.0),
                        culled,
                    });
                    span_text_styles.push(text_style(fonts, style, Brush(paint)));
                    item_paint.push(paint);
                    let frame = Frame {
                        span: Some(span_index),
                        decorations,
                        color,
                        transform: style.text_transform.unwrap_or(parent.transform),
                        clip_fill,
                        owner: owner_node(*owner),
                        white_space: white_space(style).0,
                        style,
                        offset,
                    };
                    stack.push(frame);
                }
                Item::SpanEnd => {
                    item_paint.push(0);
                    if stack.len() > 1 {
                        stack.pop();
                    }
                }
                _ => item_paint.push(0),
            }
        }

        let mut root_text_style = text_style(fonts, root_style, Brush(0));
        // The root inline box is the strut: the root element's own
        // `vertical-align` places it in its parent's line, not its content.
        root_text_style.vertical_align = parley::VerticalAlign::BASELINE;
        let mut builder =
            self.layout_context
                .tree_builder(&mut fonts.context, 1.0, true, &root_text_style);
        builder.set_line_break_override(Some(LINE_BREAK_OVERRIDE));
        builder.set_base_direction(if root_style.direction == Some(taffy::Direction::Rtl) {
            parley::BaseDirection::Rtl
        } else {
            parley::BaseDirection::Ltr
        });

        let mut boxes: Vec<IfcBox> = Vec::new();
        let mut texts: Vec<TextRange> = Vec::new();
        let mut has_content = params.has_marker;
        let mut case = CaseTransformer {
            at_word_start: true,
        };
        let mut span_styles = span_text_styles.into_iter();
        // (span index, transform, white-space) of the open spans.
        let mut open: Vec<(Option<u32>, crate::TextTransform, WhiteSpaceCollapse)> = vec![(
            None,
            root_style
                .text_transform
                .unwrap_or(crate::TextTransform::None),
            white_space(root_style).0,
        )];
        let mut next_span = 0u32;
        let edge_box =
            |kind: InlineBoxKind, id: usize, width: f32, edge: InlineBoxEdge| InlineBox {
                id: id as u64,
                kind,
                index: 0,
                width,
                height: 0.0,
                baseline: None,
                vertical_align: parley::VerticalAlign::BASELINE,
                edge,
            };
        for (item, paint) in items.iter().zip(item_paint) {
            let (current_span, transform, collapse) = *open.last().expect("root span");
            match item {
                Item::Text(node) => {
                    let contents = tree
                        .with_node(*node, |node| match &node.data {
                            obscura_dom::tree::NodeData::Text { contents } => {
                                Some(contents.clone())
                            }
                            _ => None,
                        })
                        .flatten()
                        .unwrap_or_default();
                    let text = case.transform(&contents, transform);
                    let preserves = matches!(
                        collapse,
                        WhiteSpaceCollapse::Preserve | WhiteSpaceCollapse::BreakSpaces
                    );
                    if (preserves && !text.is_empty()) || !is_css_whitespace(&text) {
                        has_content = true;
                    }
                    // A text-only style span: `vertical-align` is not inherited, so it
                    // must not shift the text again inside its (shifted) span.
                    builder.push_style_modification_span(&[
                        StyleProperty::Brush(Brush(paint)),
                        StyleProperty::VerticalAlign(parley::VerticalAlign::BASELINE),
                    ]);
                    let start = builder.text().len();
                    builder.push_text(&text);
                    let end = builder.text().len();
                    builder.pop_style_span();
                    texts.push(TextRange {
                        node: *node,
                        start,
                        end,
                    });
                }
                Item::GeneratedText(text) => {
                    let text = case.transform(text, transform);
                    if !is_css_whitespace(&text) {
                        has_content = true;
                    }
                    // A text-only style span: `vertical-align` is not inherited, so it
                    // must not shift the text again inside its (shifted) span.
                    builder.push_style_modification_span(&[
                        StyleProperty::Brush(Brush(paint)),
                        StyleProperty::VerticalAlign(parley::VerticalAlign::BASELINE),
                    ]);
                    builder.push_text(&text);
                    builder.pop_style_span();
                }
                Item::SpanStart(_) | Item::SplitSpanStart(..) => {
                    let owner = match item {
                        Item::SplitSpanStart(id, ..) => &SpanOwner::Element(*id),
                        Item::SpanStart(owner) => owner,
                        _ => unreachable!(),
                    };
                    let span_index = next_span;
                    next_span += 1;
                    let span = &spans[span_index as usize];
                    if span.start.advance() != 0.0 || span.end.advance() != 0.0 {
                        has_content = true;
                    }
                    let style = owner_style(*owner, styles).unwrap_or(root_style);
                    if let Some(text_style) = span_styles.next() {
                        builder.push_style_span(text_style);
                    }
                    let index = boxes.len();
                    boxes.push(IfcBox {
                        parent_span: current_span,
                        kind: BoxKind::Edge {
                            span: span_index,
                            start: true,
                        },
                        node: None,
                        dom: None,
                    });
                    builder.push_inline_box(edge_box(
                        InlineBoxKind::InFlow,
                        index,
                        span.start.advance(),
                        InlineBoxEdge::Start,
                    ));
                    open.push((
                        Some(span_index),
                        style.text_transform.unwrap_or(transform),
                        white_space(style).0,
                    ));
                }
                Item::SpanEnd => {
                    if open.len() <= 1 {
                        continue;
                    }
                    open.pop();
                    if let Some(span_index) = current_span {
                        let index = boxes.len();
                        boxes.push(IfcBox {
                            parent_span: current_span,
                            kind: BoxKind::Edge {
                                span: span_index,
                                start: false,
                            },
                            node: None,
                            dom: None,
                        });
                        builder.push_inline_box(edge_box(
                            InlineBoxKind::InFlow,
                            index,
                            spans[span_index as usize].end.advance(),
                            InlineBoxEdge::End,
                        ));
                    }
                    builder.pop_style_span();
                }
                Item::Atomic {
                    dom,
                    node,
                    baseline,
                } => {
                    has_content = true;
                    let index = boxes.len();
                    boxes.push(IfcBox {
                        parent_span: current_span,
                        kind: BoxKind::Atomic {
                            baseline: *baseline,
                        },
                        node: Some(*node),
                        dom: *dom,
                    });
                    let mut inline_box =
                        edge_box(InlineBoxKind::InFlow, index, 0.0, InlineBoxEdge::None);
                    inline_box.vertical_align = dom
                        .and_then(|dom| styles.get(&dom))
                        .map(vertical_align)
                        .unwrap_or(parley::VerticalAlign::BASELINE);
                    builder.push_inline_box(inline_box);
                    case.at_word_start = true;
                }
                Item::Float { dom, node } => {
                    let index = boxes.len();
                    boxes.push(IfcBox {
                        parent_span: current_span,
                        kind: BoxKind::Float,
                        node: Some(*node),
                        dom: *dom,
                    });
                    builder.push_inline_box(edge_box(
                        InlineBoxKind::CustomOutOfFlow,
                        index,
                        0.0,
                        InlineBoxEdge::None,
                    ));
                }
                Item::OutOfFlow { dom, node } => {
                    let index = boxes.len();
                    boxes.push(IfcBox {
                        parent_span: current_span,
                        kind: BoxKind::OutOfFlow,
                        node: Some(*node),
                        dom: *dom,
                    });
                    builder.push_inline_box(edge_box(
                        InlineBoxKind::OutOfFlow,
                        index,
                        0.0,
                        InlineBoxEdge::None,
                    ));
                }
                Item::Break(node) => {
                    has_content = true;
                    let index = boxes.len();
                    boxes.push(IfcBox {
                        parent_span: current_span,
                        kind: BoxKind::Break { node: *node },
                        node: None,
                        dom: Some(*node),
                    });
                    builder.push_inline_box(edge_box(
                        InlineBoxKind::InFlow,
                        index,
                        0.0,
                        InlineBoxEdge::End,
                    ));
                    builder.push_style_modification_span(&[StyleProperty::WhiteSpaceCollapse(
                        WhiteSpaceCollapse::Preserve,
                    )]);
                    builder.push_text("\n");
                    builder.pop_style_span();
                    case.at_word_start = true;
                }
            }
        }
        // Close anything left open so the builder's span tree balances.
        while open.len() > 1 {
            open.pop();
            builder.pop_style_span();
        }
        let mut layout = parley::Layout::new();
        let text = builder.build_into(&mut layout);
        layout.set_line_height_quirk(tree.is_quirks());

        // Span font boxes come from the style each start edge was pushed in.
        for (index, inline_box) in boxes.iter().enumerate() {
            if let BoxKind::Edge { span, start: true } = inline_box.kind {
                if let Some(metrics) = layout.inline_box_span_metrics(index) {
                    let span = &mut spans[span as usize];
                    span.ascent = metrics.ascent;
                    span.descent = metrics.descent;
                }
            }
        }

        // The truncation marker, shaped like the root's text.
        let marker = (params.line_clamp.is_some() || params.ellipsis).then(|| {
            let marker_style = text_style(fonts, root_style, Brush(0));
            let mut builder =
                self.layout_context
                    .tree_builder(&mut fonts.context, 1.0, true, &marker_style);
            builder.push_text("\u{2026}");
            let mut marker = parley::Layout::new();
            let _ = builder.build_into(&mut marker);
            marker.break_all_lines(None);
            marker
        });

        let index = self.ifcs.len();
        self.ifcs.push(Some(Box::new(Ifc {
            root,
            anonymous,
            node: None,
            text,
            layout,
            final_layout: None,
            layout_is_final: false,
            paints,
            spans,
            boxes,
            texts,
            params,
            content_offset: (0.0, 0.0),
            has_content,
            origin: (0.0, 0.0),
            clip: None,
            marker,
        })));
        Some(index)
    }
}

/// Root parameters of an IFC from its root style.
pub(crate) fn root_params(style: &LayoutStyle, has_marker: bool, center_block: bool) -> RootParams {
    let rtl = style.direction == Some(taffy::Direction::Rtl);
    let (align, justify) = match style.text_align {
        Some(taffy::AlignItems::CENTER) => (parley::Alignment::Center, false),
        Some(taffy::AlignItems::FLEX_END) | Some(taffy::AlignItems::END) => {
            (parley::Alignment::End, false)
        }
        Some(taffy::AlignItems::STRETCH) => (parley::Alignment::Justify, true),
        _ => (parley::Alignment::Start, false),
    };
    RootParams {
        align,
        justify,
        text_indent: style.text_indent.unwrap_or(crate::Dimension::Px(0.0)),
        direction_rtl: rtl,
        has_marker,
        center_block,
        line_clamp: (style.webkit_box_display.is_some() && style.webkit_box_orient_vertical)
            .then_some(style.webkit_line_clamp)
            .flatten()
            .map(|lines| lines as usize),
        ellipsis: style.text_overflow == crate::TextOverflow::Ellipsis && style.clips_overflow_x(),
        balance: style.text_wrap_style == Some(crate::TextWrapStyle::Balance),
        vertical: style.vertical_writing,
    }
}

/// Whether `text` is only CSS document white space (space, tab, line feed,
/// carriage return, form feed). U+00A0 and other Unicode spaces are content.
pub(crate) fn is_css_whitespace(text: &str) -> bool {
    text.chars()
        .all(|c| matches!(c, ' ' | '\t' | '\n' | '\r' | '\u{c}'))
}
