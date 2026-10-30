//! Laying out an inline formatting context as a Taffy inline root.
//!
//! Portions derived from Blitz (https://github.com/DioxusLabs/blitz), MIT OR Apache-2.0
//! (`blitz-dom/src/layout/inline/layout.rs`).

use parley::{AlignmentOptions, BreakReason, IndentOptions, PositionedLayoutItem, YieldData};
use taffy::{
    AvailableSpace, BlockContext, BlockFormattingContext, BoxSizing, Clear, CollapsibleMarginSet,
    Float, FloatDirection, InlineLayoutHost, Layout, LayoutInput, LayoutOutput, MaybeMath,
    MaybeResolve, NodeId, Overflow, Point, Position, Rect, RequestedAxis, ResolveOrZero, RunMode,
    Size, SizingMode, Style,
};

use super::{BaselineSource, BoxKind, Ifc, IFC_CONTEXT_BIT};

type Host<'a> = dyn InlineLayoutHost<usize> + 'a;

/// The Taffy inline layout function (see `TaffyTree::set_inline_layout_function`).
pub(crate) fn compute_inline_layout(
    host: &mut Host<'_>,
    node: NodeId,
    inputs: LayoutInput,
    block_ctx: Option<&mut BlockContext<'_>>,
) -> LayoutOutput {
    let Some(index) = host
        .context(node)
        .copied()
        .filter(|context| context & IFC_CONTEXT_BIT != 0)
        .map(|context| context & !IFC_CONTEXT_BIT)
    else {
        return LayoutOutput::HIDDEN;
    };
    let style = host.style(node).clone();
    let is_scroll_container =
        style.overflow.x.is_scroll_container() || style.overflow.y.is_scroll_container();
    let result = super::with_active_ifc(index, |ifc| match block_ctx {
        Some(block_ctx) if !is_scroll_container => {
            layout_ifc(host, node, &style, ifc, inputs, block_ctx)
        }
        _ => {
            let mut bfc = BlockFormattingContext::new();
            let mut root = bfc.root_block_context();
            layout_ifc(host, node, &style, ifc, inputs, &mut root)
        }
    });
    result.unwrap_or(LayoutOutput::HIDDEN)
}

/// The content-box width a box with this style would shrink-to-fit to, or
/// `None` when its width is definite or it sizes itself (a replaced leaf).
fn needs_shrink_to_fit(host: &Host<'_>, node: NodeId, style: &Style) -> bool {
    if style.item_is_replaced || !style.size.width.is_auto() {
        return false;
    }
    !host.children(node).is_empty() || host.style(node).display == taffy::Display::Block
}

/// Lay out an atomic inline box, a float or an out-of-flow box whose auto
/// width shrinks to fit: `min(max(min-content, available), max-content)`.
fn layout_shrink_to_fit(
    host: &mut Host<'_>,
    node: NodeId,
    inputs: LayoutInput,
    available_width: Option<f32>,
) -> LayoutOutput {
    let style = host.style(node).clone();
    if inputs.known_dimensions.width.is_some() || !needs_shrink_to_fit(host, node, &style) {
        return host.compute_child_layout(node, inputs);
    }
    let measure = |host: &mut Host<'_>, available: AvailableSpace| {
        host.compute_child_layout(
            node,
            LayoutInput {
                run_mode: RunMode::ComputeSize,
                sizing_mode: SizingMode::InherentSize,
                axis: RequestedAxis::Horizontal,
                known_dimensions: Size::NONE,
                parent_size: inputs.parent_size,
                available_space: Size {
                    width: available,
                    height: AvailableSpace::MaxContent,
                },
                vertical_margins_are_collapsible: taffy::Line::FALSE,
            },
        )
        .size
        .width
    };
    let width = match inputs.available_space.width {
        AvailableSpace::MinContent => measure(host, AvailableSpace::MinContent),
        AvailableSpace::MaxContent => measure(host, AvailableSpace::MaxContent),
        AvailableSpace::Definite(_) => {
            let max_content = measure(host, AvailableSpace::MaxContent);
            match available_width {
                Some(available) if max_content > available => {
                    let min_content = measure(host, AvailableSpace::MinContent);
                    min_content.max(available)
                }
                _ => max_content,
            }
        }
    };
    host.compute_child_layout(
        node,
        LayoutInput {
            known_dimensions: Size {
                width: Some(width),
                height: inputs.known_dimensions.height,
            },
            ..inputs
        },
    )
}

/// Inputs for a child of the inline root, with its margins taken off the
/// available space (Taffy's convention: the parent subtracts the margins).
fn subtract_margins(mut inputs: LayoutInput, margin: Rect<f32>) -> LayoutInput {
    inputs.available_space = inputs
        .available_space
        .maybe_sub(margin.sum_axes())
        .maybe_max(Size::ZERO);
    inputs
}

fn last_baseline(
    output: &LayoutOutput,
    source: BaselineSource,
    padding: Rect<f32>,
    border: Rect<f32>,
) -> Option<f32> {
    match source {
        BaselineSource::LastLine => output.last_baseline.or(output.first_baselines.y),
        BaselineSource::FirstLine => output.first_baselines.y.or(output.last_baseline),
        BaselineSource::MarginBottom => None,
        BaselineSource::Button => output
            .first_baselines
            .y
            .or(output.last_baseline)
            .or(Some(output.size.height - padding.bottom - border.bottom)),
        BaselineSource::Control { ascent, descent } => output.first_baselines.y.or_else(|| {
            let top = padding.top + border.top;
            let content = output.size.height - top - padding.bottom - border.bottom;
            Some(top + ((content - ascent - descent) / 2.0).floor() + ascent)
        }),
    }
}

/// Size the atomic inline boxes of `ifc` for `child_inputs` and store the
/// sizes on the Parley inline boxes.
fn size_atomic_boxes(
    host: &mut Host<'_>,
    ifc: &mut Ifc,
    child_inputs: LayoutInput,
    children: &[NodeId],
) {
    let calc_fn = host.calc_resolver();
    let has_box = |box_node: Option<NodeId>| box_node.is_some_and(|n| children.contains(&n));
    let box_count = ifc.boxes.len();
    for index in 0..box_count {
        let ibox = ifc.boxes[index];
        let (width, height, baseline) = match ibox.kind {
            BoxKind::Atomic { baseline } if has_box(ibox.node) => {
                let child = ibox.node.expect("atomic box node");
                let child_style = host.style(child).clone();
                let margin = child_style
                    .margin
                    .resolve_or_zero(child_inputs.parent_size.width, calc_fn);
                // Laid out in full (not just measured) so that flex and grid
                // boxes report their baselines.
                let box_inputs = subtract_margins(child_inputs, margin);
                let output = layout_shrink_to_fit(
                    host,
                    child,
                    box_inputs,
                    box_inputs.available_space.width.into_option(),
                );
                let child_padding = child_style
                    .padding
                    .resolve_or_zero(child_inputs.parent_size.width, calc_fn);
                let child_border = child_style
                    .border
                    .resolve_or_zero(child_inputs.parent_size.width, calc_fn);
                let baseline =
                    last_baseline(&output, baseline, child_padding, child_border).map(|b| {
                        let b = if child_style.overflow.y != Overflow::Visible {
                            b.clamp(0.0, output.size.height)
                        } else {
                            b
                        };
                        margin.top + b
                    });
                let margin_box_height = margin.top + margin.bottom + output.size.height;
                (
                    margin.left + margin.right + output.size.width,
                    if baseline.is_some() {
                        margin_box_height.min(f32::MAX)
                    } else {
                        // A negative margin box still makes a line box with
                        // the strut (Chrome); a zero-height box would leave
                        // the line empty, so keep it a hair above zero.
                        margin_box_height.max(1.0 / 64.0).min(f32::MAX)
                    },
                    baseline,
                )
            }
            BoxKind::Edge { span, start } => {
                let span = &ifc.spans[span as usize];
                let edge = if start { span.start } else { span.end };
                (edge.advance(), 0.0, None)
            }
            _ => (0.0, 0.0, None),
        };
        if let Some(parley_box) = ifc.layout.inline_boxes_mut().nth(index) {
            parley_box.width = width;
            parley_box.height = height;
            parley_box.baseline = baseline;
        }
    }
}

/// The atomic inline boxes of `ifc` with a percentage width, min-width or
/// max-width, by box index. In a shrink-to-fit width such a box's
/// max-content contribution treats the percentage as auto and its
/// min-content contribution is zero (CSS Sizing 3 §5.2.1, compressible
/// replaced elements); the percentage then resolves against the width
/// that comes out.
fn percentage_sized_atomics(host: &Host<'_>, ifc: &Ifc, children: &[NodeId]) -> Vec<usize> {
    let mut out = Vec::new();
    for (index, ibox) in ifc.boxes.iter().enumerate() {
        let BoxKind::Atomic { .. } = ibox.kind else {
            continue;
        };
        let Some(child) = ibox.node.filter(|node| children.contains(node)) else {
            continue;
        };
        let style = host.style(child);
        if [style.size.width, style.min_size.width, style.max_size.width]
            .iter()
            .any(|dimension| {
                let raw = dimension.into_raw();
                raw.tag() == taffy::CompactLength::PERCENT_TAG || raw.is_calc()
            })
        {
            out.push(index);
        }
    }
    out
}

#[allow(clippy::too_many_lines)]
fn layout_ifc(
    host: &mut Host<'_>,
    node: NodeId,
    style: &Style,
    ifc: &mut Ifc,
    inputs: LayoutInput,
    block_ctx: &mut BlockContext<'_>,
) -> LayoutOutput {
    let LayoutInput {
        known_dimensions,
        parent_size,
        available_space,
        sizing_mode,
        run_mode,
        ..
    } = inputs;

    let calc_fn = host.calc_resolver();
    let padding = style.padding.resolve_or_zero(parent_size.width, calc_fn);
    let border = style.border.resolve_or_zero(parent_size.width, calc_fn);
    let container_pb = padding + border;
    let pb_sum = container_pb.sum_axes();
    let box_sizing_adjustment = if style.box_sizing == BoxSizing::ContentBox {
        pb_sum
    } else {
        Size::ZERO
    };
    let scrollbar_gutter = style.overflow.transpose().map(|overflow| match overflow {
        Overflow::Scroll => style.scrollbar_width,
        _ => 0.0,
    });
    let mut content_box_inset = container_pb;
    content_box_inset.right += scrollbar_gutter.x;
    content_box_inset.bottom += scrollbar_gutter.y;

    let (node_size, node_min_size, node_max_size, aspect_ratio) = match sizing_mode {
        SizingMode::ContentSize => (known_dimensions, Size::NONE, Size::NONE, None),
        SizingMode::InherentSize => {
            let aspect_ratio = style.aspect_ratio;
            let style_size = style
                .size
                .maybe_resolve(parent_size, calc_fn)
                .maybe_apply_aspect_ratio(aspect_ratio)
                .maybe_add(box_sizing_adjustment);
            let style_min_size = style
                .min_size
                .maybe_resolve(parent_size, calc_fn)
                .maybe_apply_aspect_ratio(aspect_ratio)
                .maybe_add(box_sizing_adjustment);
            let style_max_size = style
                .max_size
                .maybe_resolve(parent_size, calc_fn)
                .maybe_add(box_sizing_adjustment);
            let node_size =
                known_dimensions.or(style_size.maybe_clamp(style_min_size, style_max_size));
            (node_size, style_min_size, style_max_size, aspect_ratio)
        }
    };
    let min_max_definite_size = node_min_size.zip_map(node_max_size, |min, max| match (min, max) {
        (Some(min), Some(max)) if max <= min => Some(min),
        _ => None,
    });
    let known_dimensions = known_dimensions
        .or(min_max_definite_size)
        .or(node_size)
        .maybe_max(pb_sum);
    if run_mode == RunMode::ComputeSize {
        if let Size {
            width: Some(width),
            height: Some(height),
        } = known_dimensions
        {
            return LayoutOutput::from_outer_size(Size { width, height });
        }
    }

    let has_styles_preventing_being_collapsed_through = style.display != taffy::Display::Block
        || style.overflow.x.is_scroll_container()
        || style.overflow.y.is_scroll_container()
        || style.position == Position::Absolute
        || padding.top > 0.0
        || padding.bottom > 0.0
        || border.top > 0.0
        || border.bottom > 0.0;

    let children = host.children(node);
    let has_box = |box_node: Option<NodeId>| box_node.is_some_and(|n| children.contains(&n));

    if !ifc.has_content
        && ifc.spans.is_empty()
        && !ifc
            .boxes
            .iter()
            .any(|ibox| matches!(ibox.kind, BoxKind::Float) && has_box(ibox.node))
    {
        // Nothing generates a line box. Out-of-flow boxes still get a
        // position (their static position is the content-box start).
        if run_mode == RunMode::PerformLayout {
            ifc.content_offset = (container_pb.left, container_pb.top);
            place_out_of_flow_without_lines(
                host,
                ifc,
                &children,
                container_pb,
                border,
                known_dimensions,
            );
            mark_final(ifc);
        }
        let size = known_dimensions
            .or(node_size)
            .unwrap_or(Size::ZERO)
            .maybe_clamp(node_min_size, node_max_size)
            .maybe_max(pb_sum.map(Some));
        let size = Size {
            width: size.width.max(pb_sum.width),
            height: size.height.max(pb_sum.height),
        };
        return LayoutOutput {
            size,
            content_size: Size::ZERO,
            first_baselines: Point::NONE,
            last_baseline: None,
            top_margin: CollapsibleMarginSet::ZERO,
            bottom_margin: CollapsibleMarginSet::ZERO,
            margins_can_collapse_through: !has_styles_preventing_being_collapsed_through
                && size.height == 0.0,
        };
    }

    // Available space for the content box.
    let available_space = Size {
        width: known_dimensions
            .width
            .map(AvailableSpace::from)
            .unwrap_or(available_space.width)
            .maybe_set(node_size.width)
            .map_definite_value(|size| {
                (size.maybe_clamp(node_min_size.width, node_max_size.width)
                    - content_box_inset.horizontal_axis_sum())
                .max(0.0)
            }),
        height: known_dimensions
            .height
            .map(AvailableSpace::from)
            .unwrap_or(available_space.height)
            .maybe_set(node_size.height)
            .map_definite_value(|size| {
                (size.maybe_clamp(node_min_size.height, node_max_size.height)
                    - content_box_inset.vertical_axis_sum())
                .max(0.0)
            }),
    };

    let child_inputs = LayoutInput {
        known_dimensions: Size::NONE,
        available_space,
        sizing_mode: SizingMode::InherentSize,
        parent_size: Size {
            width: available_space.width.into_option(),
            height: if ifc.anonymous {
                parent_size.height
            } else {
                available_space.height.into_option()
            },
        },
        vertical_margins_are_collapsible: taffy::Line::FALSE,
        run_mode: RunMode::PerformLayout,
        axis: RequestedAxis::Both,
    };

    // Size the atomic inline boxes. A shrink-to-fit width measures boxes
    // with percentage widths as auto first, then sizes them against it.
    let percentage_atomics = if known_dimensions.width.is_none()
        && matches!(available_space.width, AvailableSpace::Definite(_))
    {
        percentage_sized_atomics(host, ifc, &children)
    } else {
        Vec::new()
    };
    if !percentage_atomics.is_empty() {
        let intrinsic_inputs = LayoutInput {
            available_space: Size {
                width: AvailableSpace::MaxContent,
                ..child_inputs.available_space
            },
            parent_size: Size {
                width: None,
                ..child_inputs.parent_size
            },
            ..child_inputs
        };
        size_atomic_boxes(host, ifc, intrinsic_inputs, &children);
    } else {
        size_atomic_boxes(host, ifc, child_inputs, &children);
    }

    // Percentage text indents do not contribute to intrinsic widths.
    let indent_options = IndentOptions {
        each_line: false,
        hanging: false,
    };
    let fixed_indent = match ifc.params.text_indent {
        crate::Dimension::Px(px) => px,
        _ => 0.0,
    };
    ifc.layout.set_text_indent(fixed_indent, indent_options);

    let pbw = container_pb.horizontal_components().sum();
    let float_info = |host: &Host<'_>, child: NodeId| {
        let child_style = host.style(child);
        let margin = child_style
            .margin
            .resolve_or_zero(child_inputs.parent_size.width, host.calc_resolver());
        (child_style.float, child_style.clear, margin)
    };
    let width = known_dimensions.width.map(|w| w - pbw).unwrap_or_else(|| {
        let mut content_sizes = ifc.layout.calculate_content_widths();
        if !percentage_atomics.is_empty() {
            let mut saved = Vec::new();
            for (index, parley_box) in ifc.layout.inline_boxes_mut().enumerate() {
                if percentage_atomics.contains(&index) {
                    saved.push((index, parley_box.width));
                    parley_box.width = 0.0;
                }
            }
            content_sizes.min = ifc.layout.calculate_content_widths().min;
            for (index, parley_box) in ifc.layout.inline_boxes_mut().enumerate() {
                if let Some(&(_, width)) = saved.iter().find(|(saved, _)| *saved == index) {
                    parley_box.width = width;
                }
            }
        }
        let float_width = match available_space.width {
            AvailableSpace::Definite(_) => 0.0,
            AvailableSpace::MinContent => {
                let mut width: f32 = 0.0;
                for ibox in ifc.boxes.clone() {
                    if ibox.kind != BoxKind::Float || !has_box(ibox.node) {
                        continue;
                    }
                    let child = ibox.node.expect("float node");
                    let (_, _, margin) = float_info(host, child);
                    let output = layout_shrink_to_fit(
                        host,
                        child,
                        subtract_margins(
                            LayoutInput {
                                run_mode: RunMode::ComputeSize,
                                ..child_inputs
                            },
                            margin,
                        ),
                        None,
                    );
                    width = width.max(output.size.width + margin.left + margin.right);
                }
                width
            }
            AvailableSpace::MaxContent => {
                let (mut left_band, mut right_band, mut width) = (0.0f32, 0.0f32, 0.0f32);
                for ibox in ifc.boxes.clone() {
                    if ibox.kind != BoxKind::Float || !has_box(ibox.node) {
                        continue;
                    }
                    let child = ibox.node.expect("float node");
                    let (float, clear, margin) = float_info(host, child);
                    if matches!(clear, Clear::Left | Clear::Both) {
                        left_band = 0.0;
                    }
                    if matches!(clear, Clear::Right | Clear::Both) {
                        right_band = 0.0;
                    }
                    let output = layout_shrink_to_fit(
                        host,
                        child,
                        subtract_margins(
                            LayoutInput {
                                run_mode: RunMode::ComputeSize,
                                ..child_inputs
                            },
                            margin,
                        ),
                        None,
                    );
                    let box_width = output.size.width + margin.left + margin.right;
                    match float {
                        Float::Left => left_band += box_width,
                        Float::Right => right_band += box_width,
                        Float::None => {}
                    }
                    width = width.max(left_band + right_band);
                }
                width
            }
        };
        let computed_width = match available_space.width {
            AvailableSpace::MinContent => content_sizes.min.max(float_width),
            AvailableSpace::MaxContent => content_sizes.max + float_width,
            AvailableSpace::Definite(limit) => limit
                .min(content_sizes.max + float_width)
                .max(content_sizes.min),
        };
        node_size
            .width
            .unwrap_or(computed_width + pbw)
            .max(computed_width)
            .maybe_clamp(node_min_size.width, node_max_size.width)
            - pbw
    });

    if !percentage_atomics.is_empty() {
        let final_inputs = LayoutInput {
            available_space: Size {
                width: AvailableSpace::Definite(width),
                ..child_inputs.available_space
            },
            parent_size: Size {
                width: Some(width),
                ..child_inputs.parent_size
            },
            ..child_inputs
        };
        size_atomic_boxes(host, ifc, final_inputs, &children);
    }

    let is_bfc_root = block_ctx.is_bfc_root();
    if is_bfc_root {
        block_ctx.set_width(width + pbw);
    }

    // A width-only query skips line breaking. Taffy's layout cache does not
    // key on the requested axis, so the zero height must never answer a
    // later height query with the same inputs: with a known width there is
    // no width to compute anyway, so lay the lines out.
    if run_mode == RunMode::ComputeSize
        && inputs.axis == RequestedAxis::Horizontal
        && known_dimensions.width.is_none()
    {
        let measured = Size { width, height: 0.0 };
        let size = known_dimensions
            .or(node_size)
            .unwrap_or(measured + content_box_inset.sum_axes())
            .maybe_clamp(node_min_size, node_max_size)
            .maybe_max(pb_sum.map(Some));
        return LayoutOutput::from_outer_size(size);
    }

    // A measuring pass that follows a final pass re-breaks the lines: keep
    // the final lines for geometry and paint.
    if run_mode != RunMode::PerformLayout && ifc.layout_is_final && ifc.final_layout.is_none() {
        ifc.final_layout = Some(ifc.layout.clone());
    }

    let resolved_indent = match ifc.params.text_indent {
        crate::Dimension::Percent(fraction) => fraction * width.max(0.0),
        _ => fixed_indent,
    };
    ifc.layout.set_text_indent(resolved_indent, indent_options);

    let outer_block_ctx = block_ctx;
    let mut block_ctx =
        outer_block_ctx.sub_context(container_pb.top, [container_pb.left, container_pb.right]);

    // Content widths and the line breaker sum advances in different orders;
    // break with a little slack so a line exactly at max-content still fits
    // (Chromium's LayoutUnit is 1/64 px).
    let width_for_breaking = width + 1.0 / 64.0;
    // `text-wrap: balance` breaks every line at the narrowest width that
    // keeps the natural line count. Lines still align in the full width.
    let line_width = if ifc.params.balance
        && block_ctx
            .find_content_slot(0.0, Clear::None, None)
            .segment_id
            .is_none()
    {
        balanced_width(&mut ifc.layout, width_for_breaking).unwrap_or(width_for_breaking)
    } else {
        width_for_breaking
    };
    let fit = |slot_width: f32| (slot_width + 1.0 / 64.0).min(line_width);

    // Break lines one at a time into the space the floats leave.
    let float_child_inputs = LayoutInput {
        run_mode: RunMode::PerformLayout,
        ..child_inputs
    };
    let mut placed_floats: Vec<(NodeId, Layout)> = Vec::new();
    {
        let mut breaker = ifc.layout.break_lines();
        let initial_slot = block_ctx.find_content_slot(0.0, Clear::None, None);
        let mut has_active_floats = initial_slot.segment_id.is_some();
        let mut slot = initial_slot;
        let state = breaker.state_mut();
        state.set_layout_max_advance(width_for_breaking);
        state.set_line_max_advance(fit(initial_slot.width));
        state.set_line_x(initial_slot.x);
        state.set_line_y(initial_slot.y as f64);
        let mut floats_this_line = 0usize;
        let mut retries = 0usize;
        while let Some(yield_data) = breaker.break_next() {
            match yield_data {
                YieldData::LineBreak(data) => {
                    // A line whose content does not fit beside the floats
                    // moves down to the next band (CSS 2.2 §9.5).
                    let used = data.metrics.advance - data.metrics.hanging_advance;
                    if std::env::var_os("OBSCURA_IFC_DEBUG").is_some() {
                        eprintln!(
                            "[ifc] line used={used} slot={slot:?} active={has_active_floats} floats={floats_this_line} y={}..{}",
                            data.line_y_start, data.line_y_end
                        );
                    }
                    // Floats placed on this line stay placed: re-breaking it
                    // below them only skips their boxes (see InlineBoxBreak).
                    if has_active_floats
                        && slot.segment_id.is_some()
                        && used > slot.width + 0.01
                        && slot.height.is_finite()
                        && retries < 64
                        && breaker.revert()
                    {
                        retries += 1;
                        let next =
                            block_ctx.find_content_slot(slot.y + slot.height, Clear::None, None);
                        has_active_floats = next.segment_id.is_some();
                        slot = next;
                        let state = breaker.state_mut();
                        state.set_line_max_advance(if has_active_floats {
                            fit(next.width)
                        } else {
                            line_width
                        });
                        state.set_line_x(if has_active_floats { next.x } else { 0.0 });
                        state.set_line_y(next.y as f64);
                        continue;
                    }
                    retries = 0;
                    floats_this_line = 0;
                    let state = breaker.state_mut();
                    if has_active_floats {
                        let min_y = state.line_y() as f32;
                        let next = block_ctx.find_content_slot(min_y, Clear::None, None);
                        has_active_floats = next.segment_id.is_some();
                        slot = next;
                        state.set_line_max_advance(fit(next.width));
                        state.set_line_x(next.x);
                        state.set_line_y(next.y as f64);
                    } else {
                        state.set_line_x(0.0);
                        state.set_line_max_advance(line_width);
                    }
                }
                YieldData::MaxHeightExceeded(_) => {}
                YieldData::InlineBoxBreak(box_break) => {
                    let index = box_break.inline_box_id as usize;
                    let Some(child) = ifc.boxes.get(index).and_then(|ibox| ibox.node) else {
                        breaker.state_mut().append_inline_box_to_line(
                            box_break.advance,
                            f32::NEG_INFINITY,
                            f32::NEG_INFINITY,
                        );
                        continue;
                    };
                    if !children.contains(&child) {
                        breaker.state_mut().append_inline_box_to_line(
                            box_break.advance,
                            f32::NEG_INFINITY,
                            f32::NEG_INFINITY,
                        );
                        continue;
                    }
                    if placed_floats.iter().any(|(placed, _)| *placed == child) {
                        // The line was reverted after this float was placed
                        // (its content did not fit beside it): keep the float
                        // where it is.
                        breaker.state_mut().append_inline_box_to_line(
                            box_break.advance,
                            f32::NEG_INFINITY,
                            f32::NEG_INFINITY,
                        );
                        continue;
                    }
                    floats_this_line += 1;
                    let (float, clear, margin) = float_info(host, child);
                    let direction = match float {
                        Float::Right => FloatDirection::Right,
                        _ => FloatDirection::Left,
                    };
                    let output = layout_shrink_to_fit(
                        host,
                        child,
                        subtract_margins(float_child_inputs, margin),
                        float_child_inputs
                            .available_space
                            .width
                            .into_option()
                            .map(|w| (w - margin.left - margin.right).max(0.0)),
                    );
                    let state = breaker.state_mut();
                    let min_y = state.line_y() as f32;
                    let pos = block_ctx.place_floated_box(
                        output.size + margin.sum_axes(),
                        min_y,
                        direction,
                        clear,
                    );
                    let next = block_ctx.find_content_slot(min_y, Clear::None, None);
                    has_active_floats = next.segment_id.is_some();
                    slot = next;
                    // The line in progress now has less room beside the float.
                    let line_x = state.line_x();
                    let new_x = if has_active_floats { next.x } else { 0.0 };
                    state.set_line_max_advance(if has_active_floats {
                        fit(next.width)
                    } else {
                        line_width
                    });
                    // A float that fits beside the line shifts the content
                    // already on it, as in Chrome.
                    if (new_x - line_x).abs() > f32::EPSILON && pos.y <= min_y + 0.01 {
                        state.set_line_x(new_x);
                    }
                    state.set_line_y(next.y.max(min_y) as f64);
                    let location = Point {
                        x: pos.x + margin.left + container_pb.left,
                        y: pos.y + margin.top + container_pb.top,
                    };
                    let child_style = host.style(child);
                    let child_padding = child_style
                        .padding
                        .resolve_or_zero(child_inputs.parent_size.width, calc_fn);
                    let child_border = child_style
                        .border
                        .resolve_or_zero(child_inputs.parent_size.width, calc_fn);
                    placed_floats.push((
                        child,
                        Layout {
                            order: index as u32,
                            location,
                            size: output.size,
                            content_size: output.content_size,
                            scrollbar_size: Size::ZERO,
                            border: child_border,
                            padding: child_padding,
                            margin,
                        },
                    ));
                    breaker.state_mut().append_inline_box_to_line(
                        box_break.advance,
                        f32::NEG_INFINITY,
                        f32::NEG_INFINITY,
                    );
                }
            }
        }
        breaker.finish();
    }
    if run_mode == RunMode::PerformLayout {
        for (child, layout) in &placed_floats {
            host.set_unrounded_layout(*child, layout);
        }
    }

    let float_height_contribution = block_ctx.floated_content_height_contribution();
    outer_block_ctx.add_child_floated_content_height_contribution(
        container_pb.top + float_height_contribution,
    );

    ifc.layout.align(
        ifc.params.align,
        AlignmentOptions {
            align_when_overflowing: false,
            last_line_alignment: None,
        },
    );

    let has_inline_content = ifc.has_content;
    // Lines moved down past floats leave gaps, so the content height is the
    // bottom of the last line box rather than the sum of the line heights.
    let lines_bottom = |layout: &parley::Layout<super::Brush>, skip_last: bool| {
        let count = layout.len() - usize::from(skip_last && layout.len() > 0);
        (0..count)
            .filter_map(|index| layout.get(index))
            .map(|line| line.metrics().block_max_coord)
            .fold(0.0f32, f32::max)
    };
    let mut height = if has_inline_content {
        lines_bottom(&ifc.layout, false)
    } else {
        0.0
    };
    // A forced break at the end ends the last line box without starting a
    // new one; Parley's trailing empty line is not a line box.
    let line_count = ifc.layout.len();
    let mut trailing_empty_line = None;
    if line_count >= 2 {
        if let (Some(prev_line), Some(last_line)) = (
            ifc.layout.get(line_count - 2),
            ifc.layout.get(line_count - 1),
        ) {
            if prev_line.break_reason() == BreakReason::Explicit
                && last_line.text_range().is_empty()
                && last_line.items().next().is_none()
            {
                trailing_empty_line = Some(line_count - 1);
            }
        }
    }
    if trailing_empty_line.is_some() && has_inline_content {
        height = lines_bottom(&ifc.layout, true);
    }
    // A line clamp cuts the content height after the last counted line.
    if let Some(limit) = ifc.params.line_clamp.filter(|limit| *limit > 0) {
        if let Some(line) = clamped_last_line(&ifc.layout, limit) {
            height = height.min(line);
        }
    }
    if is_bfc_root {
        height = height.max(float_height_contribution);
    }

    let measured_size = Size { width, height };
    let content_width = width.max(ifc.layout.width());
    let clamped_size = known_dimensions
        .or(node_size)
        .unwrap_or(measured_size + content_box_inset.sum_axes())
        .maybe_clamp(node_min_size, node_max_size);
    let final_size = Size {
        width: clamped_size.width,
        height: clamped_size.height.max(
            aspect_ratio
                .map(|ratio| clamped_size.width / ratio)
                .unwrap_or(0.0),
        ),
    }
    .maybe_max(pb_sum.map(Some));
    let final_size = Size {
        width: final_size.width.max(pb_sum.width),
        height: final_size.height.max(pb_sum.height),
    };

    let block_offset = if ifc.params.center_block {
        ((final_size.height - content_box_inset.vertical_axis_sum() - measured_size.height) / 2.0)
            .max(0.0)
    } else {
        0.0
    };
    let line_box_top = container_pb.top + block_offset;

    if run_mode == RunMode::PerformLayout {
        resolve_relative_offsets(ifc, final_size - content_box_inset.sum_axes());
        place_inline_boxes(
            host,
            ifc,
            &children,
            child_inputs,
            container_pb,
            line_box_top,
            final_size,
            content_box_inset,
            border,
        );
        ifc.content_offset = (container_pb.left, line_box_top);
        mark_final(ifc);
    }

    let line_baseline =
        |line: parley::Line<'_, super::Brush>| line.metrics().baseline + line_box_top;
    let first_baseline = has_inline_content
        .then(|| ifc.layout.lines().next().map(line_baseline))
        .flatten();
    let last_line_index = trailing_empty_line.unwrap_or(line_count).checked_sub(1);
    let last_baseline = has_inline_content
        .then(|| last_line_index.and_then(|i| ifc.layout.get(i)))
        .flatten()
        .map(line_baseline);

    LayoutOutput {
        size: final_size,
        content_size: Size {
            width: content_width + padding.horizontal_axis_sum(),
            height: measured_size.height + padding.vertical_axis_sum() + block_offset.max(0.0),
        },
        first_baselines: Point {
            x: None,
            y: first_baseline,
        },
        last_baseline,
        top_margin: CollapsibleMarginSet::ZERO,
        bottom_margin: CollapsibleMarginSet::ZERO,
        margins_can_collapse_through: !has_styles_preventing_being_collapsed_through
            && final_size.height == 0.0
            && measured_size.height == 0.0,
    }
}

fn mark_final(ifc: &mut Ifc) {
    ifc.layout_is_final = true;
    ifc.final_layout = None;
}

/// Store the positions of the atomic and out-of-flow boxes after the final
/// line layout.
#[allow(clippy::too_many_arguments)]
fn place_inline_boxes(
    host: &mut Host<'_>,
    ifc: &mut Ifc,
    children: &[NodeId],
    child_inputs: LayoutInput,
    container_pb: Rect<f32>,
    line_box_top: f32,
    final_size: Size<f32>,
    content_box_inset: Rect<f32>,
    container_border: Rect<f32>,
) {
    let mut positions: Vec<(usize, f32, f32, f32, f32)> = Vec::new();
    for line in ifc.layout.lines() {
        let metrics = *line.metrics();
        for item in line.items() {
            if let PositionedLayoutItem::InlineBox(ibox) = item {
                positions.push((
                    ibox.id as usize,
                    ibox.x,
                    ibox.y,
                    metrics.block_min_coord,
                    metrics.block_max_coord,
                ));
            }
        }
    }
    let content_size = final_size - content_box_inset.sum_axes();
    for (index, x, y, line_top, line_bottom) in positions {
        let Some(ibox) = ifc.boxes.get(index).copied() else {
            continue;
        };
        let Some(child) = ibox.node.filter(|node| children.contains(node)) else {
            continue;
        };
        let child_style = host.style(child).clone();
        let calc_fn = host.calc_resolver();
        let padding = child_style
            .padding
            .resolve_or_zero(child_inputs.parent_size.width, calc_fn);
        let border = child_style
            .border
            .resolve_or_zero(child_inputs.parent_size.width, calc_fn);
        let margin = child_style
            .margin
            .resolve_or_zero(child_inputs.parent_size.width, calc_fn);
        let parley_height = ifc
            .layout
            .inline_boxes()
            .nth(index)
            .map_or(0.0, |parley_box| parley_box.height);
        match ibox.kind {
            BoxKind::Atomic { .. } => {
                let output = layout_shrink_to_fit(
                    host,
                    child,
                    subtract_margins(child_inputs, margin),
                    child_inputs
                        .available_space
                        .width
                        .into_option()
                        .map(|w| (w - margin.left - margin.right).max(0.0)),
                );
                let span_offset = ibox
                    .parent_span
                    .and_then(|span| ifc.spans.get(span as usize))
                    .map(|span| span.relative)
                    .unwrap_or((0.0, 0.0));
                let inset = child_style.inset;
                let relative = if child_style.position == Position::Relative {
                    let left = inset.left.maybe_resolve(content_size.width, calc_fn);
                    let right = inset.right.maybe_resolve(content_size.width, calc_fn);
                    let top = inset.top.maybe_resolve(content_size.height, calc_fn);
                    let bottom = inset.bottom.maybe_resolve(content_size.height, calc_fn);
                    Point {
                        x: left.or(right.map(|x| -x)).unwrap_or(0.0),
                        y: top.or(bottom.map(|y| -y)).unwrap_or(0.0),
                    }
                } else {
                    Point::ZERO
                };
                host.set_unrounded_layout(
                    child,
                    &Layout {
                        order: index as u32,
                        location: Point {
                            x: x + margin.left + container_pb.left + relative.x + span_offset.0,
                            // The border box sits above the margin box's
                            // bottom edge; for a box whose margin box is
                            // negative (clamped to zero height in the line)
                            // this keeps its bottom margin edge on the line
                            // (Chrome: margin-top:-20px on a 5px image).
                            y: y + parley_height - margin.bottom - output.size.height
                                + line_box_top
                                + relative.y
                                + span_offset.1,
                        },
                        size: output.size,
                        content_size: output.content_size,
                        scrollbar_size: Size::ZERO,
                        border,
                        padding,
                        margin,
                    },
                );
            }
            BoxKind::OutOfFlow => {
                let static_position = Point {
                    x: x + container_pb.left,
                    y: line_top + line_box_top,
                };
                let _ = line_bottom;
                place_out_of_flow(
                    host,
                    child,
                    index,
                    &child_style,
                    static_position,
                    final_size,
                    container_border,
                    padding,
                    border,
                    margin,
                );
            }
            _ => {}
        }
    }
}

/// Out-of-flow boxes of an IFC without line boxes sit at the content-box start.
fn place_out_of_flow_without_lines(
    host: &mut Host<'_>,
    ifc: &Ifc,
    children: &[NodeId],
    container_pb: Rect<f32>,
    container_border: Rect<f32>,
    known: Size<Option<f32>>,
) {
    let final_size = Size {
        width: known.width.unwrap_or(0.0),
        height: known.height.unwrap_or(0.0),
    };
    for (index, ibox) in ifc.boxes.iter().enumerate() {
        if ibox.kind != BoxKind::OutOfFlow {
            continue;
        }
        let Some(child) = ibox.node.filter(|node| children.contains(node)) else {
            continue;
        };
        let child_style = host.style(child).clone();
        let calc_fn = host.calc_resolver();
        let padding = child_style.padding.resolve_or_zero(known.width, calc_fn);
        let border = child_style.border.resolve_or_zero(known.width, calc_fn);
        let margin = child_style.margin.resolve_or_zero(known.width, calc_fn);
        place_out_of_flow(
            host,
            child,
            index,
            &child_style,
            Point {
                x: container_pb.left,
                y: container_pb.top,
            },
            final_size,
            container_border,
            padding,
            border,
            margin,
        );
    }
}

/// Lay out an absolutely positioned child of the inline root: against the
/// root's padding box when it is the containing block, else at its static
/// position (the DOM layout later moves it to its real containing block).
#[allow(clippy::too_many_arguments)]
fn place_out_of_flow(
    host: &mut Host<'_>,
    child: NodeId,
    order: usize,
    style: &Style,
    static_position: Point<f32>,
    container_size: Size<f32>,
    container_border: Rect<f32>,
    padding: Rect<f32>,
    border: Rect<f32>,
    margin: Rect<f32>,
) {
    // The padding box of the inline root.
    let area = Size {
        width: (container_size.width - container_border.horizontal_axis_sum()).max(0.0),
        height: (container_size.height - container_border.vertical_axis_sum()).max(0.0),
    };
    let (left, right, top, bottom) = {
        let calc_fn = host.calc_resolver();
        (
            style.inset.left.maybe_resolve(area.width, calc_fn),
            style.inset.right.maybe_resolve(area.width, calc_fn),
            style.inset.top.maybe_resolve(area.height, calc_fn),
            style.inset.bottom.maybe_resolve(area.height, calc_fn),
        )
    };
    let width = match (left, right) {
        (Some(l), Some(r)) if style.size.width.is_auto() => {
            Some((area.width - l - r - margin.left - margin.right).max(0.0))
        }
        _ => None,
    };
    let height = match (top, bottom) {
        (Some(t), Some(b)) if style.size.height.is_auto() => {
            Some((area.height - t - b - margin.top - margin.bottom).max(0.0))
        }
        _ => None,
    };
    let inputs = LayoutInput {
        run_mode: RunMode::PerformLayout,
        sizing_mode: SizingMode::InherentSize,
        axis: RequestedAxis::Both,
        known_dimensions: Size { width, height },
        parent_size: area.map(Some),
        available_space: Size {
            width: AvailableSpace::Definite(
                (area.width
                    - left.unwrap_or(0.0)
                    - right.unwrap_or(0.0)
                    - margin.left
                    - margin.right)
                    .max(0.0),
            ),
            height: AvailableSpace::Definite(area.height),
        },
        vertical_margins_are_collapsible: taffy::Line::FALSE,
    };
    let available = inputs.available_space.width.into_option();
    let output = layout_shrink_to_fit(host, child, inputs, available);
    let x = match (left, right) {
        (Some(l), _) => container_border.left + l + margin.left,
        (None, Some(r)) => {
            container_size.width - container_border.right - r - margin.right - output.size.width
        }
        (None, None) => static_position.x + margin.left,
    };
    let y = match (top, bottom) {
        (Some(t), _) => container_border.top + t + margin.top,
        (None, Some(b)) => {
            container_size.height - container_border.bottom - b - margin.bottom - output.size.height
        }
        (None, None) => static_position.y + margin.top,
    };
    host.set_unrounded_layout(
        child,
        &Layout {
            order: order as u32,
            location: Point { x, y },
            size: output.size,
            content_size: output.content_size,
            scrollbar_size: Size::ZERO,
            border,
            padding,
            margin,
        },
    );
}

/// The bottom of the `limit`th line that has content, when more lines follow.
fn clamped_last_line(layout: &parley::Layout<super::Brush>, limit: usize) -> Option<f32> {
    let mut counted = 0;
    for index in 0..layout.len() {
        let line = layout.get(index)?;
        if line.items().next().is_none() {
            continue;
        }
        counted += 1;
        if counted == limit {
            return Some(line.metrics().block_max_coord);
        }
    }
    None
}

/// Resolve `position: relative` on inline spans against the content box and
/// accumulate them down the span tree into the text that paints.
fn resolve_relative_offsets(ifc: &mut Ifc, content: Size<f32>) {
    for index in 0..ifc.spans.len() {
        let parent = ifc.spans[index]
            .parent
            .and_then(|parent| ifc.spans.get(parent as usize))
            .map(|parent| parent.relative)
            .unwrap_or((0.0, 0.0));
        let span = &ifc.spans[index];
        let own = span.inset.map_or((0.0, 0.0), |[top, right, bottom, left]| {
            let px = |value: Option<crate::Dimension>, basis: f32| {
                value.and_then(|value| match value {
                    crate::Dimension::Percent(fraction) => Some(fraction * basis),
                    other => match other.resolve(span.font_size, 16.0, 0.0, 0.0) {
                        crate::Dimension::Px(px) => Some(px),
                        _ => None,
                    },
                })
            };
            (
                px(left, content.width)
                    .or(px(right, content.width).map(|x| -x))
                    .unwrap_or(0.0),
                px(top, content.height)
                    .or(px(bottom, content.height).map(|y| -y))
                    .unwrap_or(0.0),
            )
        });
        ifc.spans[index].relative = (parent.0 + own.0, parent.1 + own.1);
    }
    for paint in &mut ifc.paints {
        paint.offset = paint
            .span
            .and_then(|span| ifc.spans.get(span as usize))
            .map(|span| span.relative)
            .unwrap_or((0.0, 0.0));
    }
}

/// The narrowest line width, to 1/64 px, at which `layout` breaks into as
/// many lines as at `width`, for `text-wrap: balance`. Chromium balances at
/// most six lines and leaves longer paragraphs alone.
fn balanced_width(layout: &mut parley::Layout<super::Brush>, width: f32) -> Option<f32> {
    layout.break_all_lines(Some(width));
    let lines = layout.len();
    if !(2..=6).contains(&lines) {
        return None;
    }
    let (mut low, mut high) = (0.0f32, width);
    while high - low > 1.0 / 64.0 {
        let mid = (low + high) / 2.0;
        layout.break_all_lines(Some(mid));
        if layout.len() <= lines {
            high = mid;
        } else {
            low = mid;
        }
    }
    Some(high)
}
