//! Font matching, text metrics, variable-font and text-paint behaviour of
//! the inline formatting context. Expected values come from Chrome 145
//! (headless shell, Linux) on the same markup, fonts and sizes: widths and
//! heights from getBoundingClientRect, faces from comparing advance widths.
//! They replace the cosmic-text engine tests of the same names.

use std::collections::HashMap;
use std::sync::Arc;

use obscura_dom::tree::{DomTree, NodeId};

use super::fonts::{SANS_B, SANS_R, SYSTEM_R};
use crate::dom::DomLayout;
use crate::inline::WebFont;

/// One glyph run of the text under an element.
#[derive(Debug, Clone)]
struct RunFace {
    family: String,
    weight: u16,
    italic: bool,
    embolden: bool,
    skew: f32,
    coords: Vec<i16>,
    glyphs: usize,
}

fn layout(html: &str, fonts: &[WebFont]) -> (DomTree, DomLayout) {
    let tree = obscura_dom::parse_html(html);
    let laid =
        crate::dom::layout_dom_with_web_fonts(&tree, (1280.0, 800.0), &HashMap::new(), fonts);
    (tree, laid)
}

fn web_font(data: &[u8], family: &str, weight: Option<(u16, u16)>) -> WebFont {
    WebFont {
        data: Arc::new(data.to_vec()),
        family: Some(family.to_string()),
        weight,
        italic: Some(false),
    }
}

fn variable_font() -> Vec<u8> {
    use base64::Engine;
    let encoded: String = include_str!("../../tests/fonts/obscura-vf-test.woff2.b64")
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect();
    let compressed = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .expect("decode the variable-font fixture");
    wuff::decompress_woff2(&compressed).expect("decompress the variable-font fixture")
}

fn element(tree: &DomTree, id: &str) -> NodeId {
    tree.get_element_by_id(id)
        .unwrap_or_else(|| panic!("#{id}"))
}

fn width(tree: &DomTree, laid: &DomLayout, id: &str) -> f32 {
    laid.rects[&element(tree, id)].width
}

fn height(tree: &DomTree, laid: &DomLayout, id: &str) -> f32 {
    laid.rects[&element(tree, id)].height
}

/// The glyph runs of the text nodes inside `#id`.
fn faces(tree: &DomTree, laid: &DomLayout, id: &str) -> Vec<RunFace> {
    let host = element(tree, id);
    let texts: Vec<NodeId> = tree
        .descendants(host)
        .into_iter()
        .filter(|node| {
            tree.borrow_node(*node)
                .is_some_and(|node| !node.is_element())
        })
        .collect();
    let mut out = Vec::new();
    for index in 0..laid.ifc.len() {
        let Some(ifc) = laid.ifc.get(index) else {
            continue;
        };
        for line in ifc.final_layout().lines() {
            for item in line.items() {
                let parley::PositionedLayoutItem::GlyphRun(run) = item else {
                    continue;
                };
                let Some(paint) = ifc.paints.get(run.style().brush.0 as usize) else {
                    continue;
                };
                if !paint.text_node.is_some_and(|node| texts.contains(&node)) {
                    continue;
                }
                let font = run.run().font();
                let face = swash::FontRef::from_index(font.data.as_ref(), font.index as usize)
                    .expect("a parsable face");
                let family = face
                    .localized_strings()
                    .find_by_id(swash::StringId::Family, None)
                    .map(|name| name.to_string())
                    .unwrap_or_default();
                let attributes = face.attributes();
                let synthesis = run.run().synthesis();
                out.push(RunFace {
                    family,
                    weight: attributes.weight().0,
                    italic: attributes.style() != swash::Style::Normal,
                    embolden: synthesis.embolden(),
                    skew: synthesis.skew().unwrap_or(0.0),
                    coords: run
                        .run()
                        .normalized_coords()
                        .iter()
                        .map(|c| c.to_bits())
                        .collect(),
                    glyphs: run.glyphs().count(),
                });
            }
        }
    }
    assert!(!out.is_empty(), "#{id} has no glyph runs");
    out
}

fn face(tree: &DomTree, laid: &DomLayout, id: &str) -> RunFace {
    faces(tree, laid, id).remove(0)
}

fn close(actual: f32, expected: f32, what: &str) {
    assert!(
        (actual - expected).abs() < 0.02,
        "{what}: {actual} vs Chrome {expected}"
    );
}

const SAMPLE: &str = "Hamburgefonstiv";

// --- Font matching -------------------------------------------------------

#[test]
fn missing_font_weights_follow_css_search_order() {
    // Arial maps to Liberation Sans, which has 400 and 700 faces. CSS Fonts
    // 4 §5.2: 300/400/500 find the regular face, 600/800 the bold one.
    let weights = [300, 400, 500, 600, 700, 800];
    let html: String = weights
        .iter()
        .map(|w| format!("<div><span id=w{w} style='font:{w} 32px Arial;white-space:pre'>{SAMPLE}</span></div>"))
        .collect();
    let (tree, laid) = layout(
        &format!("<!doctype html><body style='margin:0'>{html}"),
        &[],
    );
    for (weight, face_weight, chrome_width) in [
        (300, 400, 241.891),
        (400, 400, 241.891),
        (500, 400, 241.891),
        (600, 700, 263.141),
        (700, 700, 263.141),
        (800, 700, 263.141),
    ] {
        let id = format!("w{weight}");
        let run = face(&tree, &laid, &id);
        assert_eq!(run.family, "Liberation Sans", "{id}");
        assert_eq!(run.weight, face_weight, "{id}");
        assert!(
            !run.embolden,
            "{id}: a matched bold face is not synthesized"
        );
        close(width(&tree, &laid, &id), chrome_width, &id);
    }
}

#[test]
fn system_ui_resolves_in_stack_order_to_chromium_linux_face() {
    let stack = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', \
                 'Liberation Sans', Arial, sans-serif";
    let (tree, laid) = layout(
        &format!(
            "<!doctype html><body style='margin:0;font-size:32px;white-space:pre'>\
             <div><span id=sys400 style='font-family:system-ui'>{SAMPLE}</span></div>\
             <div><span id=sys600 style='font-family:system-ui;font-weight:600'>{SAMPLE}</span></div>\
             <div><span id=stack600 style=\"font-family:{stack};font-weight:600\">{SAMPLE}</span></div>\
             <div><span id=italic style='font-family:system-ui;font-style:italic'>{SAMPLE}</span></div>\
             <div><span id=arial600 style='font-family:Arial, sans-serif;font-weight:600'>{SAMPLE}</span></div>"
        ),
        &[],
    );
    let regular = face(&tree, &laid, "sys400");
    assert_eq!(
        (regular.family.as_str(), regular.weight),
        ("DejaVu Sans", 400)
    );
    close(width(&tree, &laid, "sys400"), 276.203, "sys400");

    // CSS weight 600 selects DejaVu Sans Bold, as in Chrome.
    for id in ["sys600", "stack600"] {
        let bold = face(&tree, &laid, id);
        assert_eq!(
            (bold.family.as_str(), bold.weight),
            ("DejaVu Sans", 700),
            "{id}"
        );
        assert!(!bold.embolden, "{id}");
        close(width(&tree, &laid, id), 312.656, id);
    }

    // There is no DejaVu Sans italic: Chrome slants the regular face and
    // keeps its advances.
    let italic = face(&tree, &laid, "italic");
    assert_eq!(
        (italic.family.as_str(), italic.weight),
        ("DejaVu Sans", 400)
    );
    assert!(!italic.italic);
    assert!(italic.skew != 0.0, "italic is synthesized: {italic:?}");
    close(width(&tree, &laid, "italic"), 276.203, "italic");

    let arial = face(&tree, &laid, "arial600");
    assert_eq!(
        (arial.family.as_str(), arial.weight),
        ("Liberation Sans", 700)
    );
    close(width(&tree, &laid, "arial600"), 263.141, "arial600");
}

/// Three @font-face rules for one family: 400 and 700 from Liberation Sans
/// files and 500 from DejaVu Sans, whose internal family name differs.
fn declared_family() -> (DomTree, DomLayout) {
    layout(
        &format!(
            "<!doctype html><body style='margin:0;white-space:pre'>\
             <div><span id=pop400 style='font:32px Pop'>{SAMPLE}</span></div>\
             <div><span id=pop500 style='font:500 32px Pop'>{SAMPLE}</span></div>\
             <div><span id=pop600 style='font:600 32px Pop'>{SAMPLE}</span></div>\
             <div><span id=pop700 style='font:700 32px Pop'>{SAMPLE}</span></div>"
        ),
        &[
            web_font(SANS_R, "Pop", Some((400, 400))),
            web_font(SYSTEM_R, "Pop", Some((500, 500))),
            web_font(SANS_B, "Pop", Some((700, 700))),
        ],
    )
}

#[test]
fn declared_family_selects_a_face_with_a_different_internal_name() {
    let (tree, laid) = declared_family();
    let medium = face(&tree, &laid, "pop500");
    assert_eq!(
        (medium.family.as_str(), medium.weight),
        ("DejaVu Sans", 400)
    );
    assert!(!medium.embolden);
    // Chrome: 276 (web fonts advance in whole pixels there; Chrome uses
    // DejaVu's hinted advance for one glyph, so ours is 1px wider).
    assert!(
        (width(&tree, &laid, "pop500") - 276.0).abs() <= 1.0,
        "{}",
        width(&tree, &laid, "pop500")
    );
    // 600 searches upward first and finds the 700 rule.
    let semibold = face(&tree, &laid, "pop600");
    assert_eq!(
        (semibold.family.as_str(), semibold.weight),
        ("Liberation Sans", 700)
    );
}

#[test]
fn descriptor_selected_resource_pins_the_exact_font_face() {
    let (tree, laid) = declared_family();
    let regular = face(&tree, &laid, "pop400");
    assert_eq!(
        (regular.family.as_str(), regular.weight),
        ("Liberation Sans", 400)
    );
    let bold = face(&tree, &laid, "pop700");
    assert_eq!(
        (bold.family.as_str(), bold.weight),
        ("Liberation Sans", 700)
    );
    assert!(
        !bold.embolden,
        "the 700 rule's own bold file is used, not synthesis"
    );
    // Chrome: 244 and 266.
    assert!((width(&tree, &laid, "pop400") - 244.0).abs() < 0.5);
    assert!((width(&tree, &laid, "pop700") - 266.0).abs() < 0.5);
}

#[test]
fn declared_web_family_keeps_the_loaded_faces_line_metrics() {
    // `line-height: normal` uses the declared face's own metrics: DejaVu
    // Sans lines are 19px at 16px and 46px at 40px in Chrome (Liberation
    // Sans would give 18px and 46px).
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'>\
         <div id=small style='font:16px Dv'>Hamburg</div>\
         <div id=large style='font:40px Dv'>Hamburg</div>",
        &[web_font(SYSTEM_R, "Dv", None)],
    );
    assert_eq!(height(&tree, &laid, "small"), 19.0);
    assert_eq!(height(&tree, &laid, "large"), 46.0);
    assert_eq!(face(&tree, &laid, "small").family, "DejaVu Sans");
}

/// One static regular face declared for the whole weight range 100-900.
fn ranged_family() -> (DomTree, DomLayout) {
    layout(
        &format!(
            "<!doctype html><body style='margin:0;white-space:pre'>\
             <div><span id=range400 style='font:32px Range'>{SAMPLE}</span></div>\
             <div><span id=range700 style='font:700 32px Range'>{SAMPLE}</span></div>"
        ),
        &[web_font(SANS_R, "Range", Some((100, 900)))],
    )
}

#[test]
fn ranged_face_keeps_requested_weight_as_fallback_axis_intent() {
    // The face covers 700 by its descriptor, so a 700 request uses it
    // without synthetic bold: Chrome lays both spans out 244px wide.
    let (tree, laid) = ranged_family();
    let bold = face(&tree, &laid, "range700");
    assert_eq!(
        (bold.family.as_str(), bold.weight),
        ("Liberation Sans", 400)
    );
    assert!(!bold.embolden, "{bold:?}");
    close(
        width(&tree, &laid, "range700"),
        width(&tree, &laid, "range400"),
        "range700",
    );
}

#[test]
fn ranged_face_shapes_at_its_font_database_weight() {
    let (tree, laid) = ranged_family();
    let regular = face(&tree, &laid, "range400");
    assert_eq!(
        (regular.family.as_str(), regular.weight),
        ("Liberation Sans", 400)
    );
    assert!(!regular.embolden);
    assert!((width(&tree, &laid, "range400") - 244.0).abs() < 0.5);
}

// --- Text and line metrics ----------------------------------------------

#[test]
fn keep_all_never_inserts_controls_inside_grapheme_clusters() {
    // keep-all only removes break opportunities between letters: it never
    // changes the text or the shaped width (Hangul, a kana with a combining
    // voiced mark, a ZWJ family emoji and a skin-tone modifier).
    let source = "각각 か\u{3099}か\u{3099} 👨\u{200d}👩\u{200d}👧\u{200d}👦 👍🏽";
    let (tree, laid) = layout(
        &format!(
            "<!doctype html><body style='margin:0;font:40px sans-serif'>\
             <div><span id=normal style='display:inline-block'>{source}</span></div>\
             <div><span id=keep style='display:inline-block;word-break:keep-all'>{source}</span></div>"
        ),
        &[],
    );
    assert_eq!(width(&tree, &laid, "keep"), width(&tree, &laid, "normal"));
    let keep = element(&tree, "keep");
    let text = tree.children(keep)[0];
    let shaped: String = laid.text_runs[&text]
        .iter()
        .map(|(_, content)| content.as_str())
        .collect();
    assert_eq!(shaped, source);
}

#[test]
fn non_normal_letter_spacing_reaches_shaping_features() {
    // Chrome turns off optional ligatures when letter-spacing is not zero:
    // DejaVu Sans "office ffi" is 128.906px with ligatures and 149.875px
    // with 2px spacing (20px of spacing plus the un-ligated glyphs).
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:32px system-ui;white-space:pre'>\
         <div><span id=liga>office ffi</span></div>\
         <div><span id=spaced style='letter-spacing:2px'>office ffi</span></div>",
        &[],
    );
    close(width(&tree, &laid, "liga"), 128.906, "liga");
    close(width(&tree, &laid, "spaced"), 149.875, "spaced");
    let ligated: usize = faces(&tree, &laid, "liga")
        .iter()
        .map(|run| run.glyphs)
        .sum();
    let spaced: usize = faces(&tree, &laid, "spaced")
        .iter()
        .map(|run| run.glyphs)
        .sum();
    assert_eq!(spaced, 10, "one glyph per character");
    assert!(ligated < spaced, "{ligated} ligated glyphs");
}

#[test]
fn normal_line_height_grid_fits_each_face_metric() {
    // Chrome rounds ascent, descent and line gap separately for each face.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'>\
         <div id=sans9 style='font:9.3333px sans-serif'>x</div>\
         <div id=sans12 style='font:12px sans-serif'>x</div>\
         <div id=serif13 style='font:13px serif'>x</div>\
         <div id=mono13 style='font:13px monospace'>x</div>\
         <div id=system16 style='font:16px system-ui'>x</div>\
         <div id=system40 style='font:40px system-ui'>x</div>",
        &[],
    );
    for (id, chrome) in [
        ("sans9", 10.0),
        ("sans12", 14.0),
        ("serif13", 16.0),
        ("mono13", 15.0),
        ("system16", 19.0),
        ("system40", 46.0),
    ] {
        assert_eq!(height(&tree, &laid, id), chrome, "{id}");
    }
}

// --- Variable fonts -------------------------------------------------------

fn variable_spans(extra: &str) -> (DomTree, DomLayout) {
    layout(
        &format!(
            "<!doctype html><body style='margin:0;white-space:pre'>\
             <div><span id=w400 style='font:400 32px VF, sans-serif'>Tools and</span></div>\
             <div><span id=w900 style='font:900 32px VF, sans-serif'>Tools and</span></div>\
             <div><span id=nopsz style='font:400 32px VF, sans-serif;font-optical-sizing:none'>Tools and</span></div>\
             <div><span id=opsz14 style=\"font:400 32px VF, sans-serif;font-variation-settings:'opsz' 14\">Tools and</span></div>\
             {extra}"
        ),
        &[WebFont {
            data: Arc::new(variable_font()),
            family: Some("VF".to_string()),
            weight: Some((100, 900)),
            italic: Some(false),
        }],
    )
}

/// The run drawn by the variable face itself (the fixture covers a few
/// glyphs; the rest fall back to sans-serif).
fn variable_run(tree: &DomTree, laid: &DomLayout, id: &str) -> RunFace {
    faces(tree, laid, id)
        .into_iter()
        .find(|run| run.family == "Obscura VF Test")
        .expect("a run in the variable face")
}

fn axis_coords(tree: &DomTree, laid: &DomLayout, id: &str) -> Vec<i16> {
    variable_run(tree, laid, id).coords
}

#[test]
fn optical_sizing_changes_tailwind_heading_shape_and_raster_axes() {
    // Chrome ("VF, sans-serif" at 32px): automatic optical sizing gives
    // 135.297px; turning it off, or pinning opsz to 14, gives 137.297px.
    let (tree, laid) = variable_spans("");
    close(width(&tree, &laid, "w400"), 135.297, "auto opsz");
    close(width(&tree, &laid, "nopsz"), 137.297, "no opsz");
    close(width(&tree, &laid, "opsz14"), 137.297, "opsz 14");
    assert_ne!(
        axis_coords(&tree, &laid, "w400"),
        axis_coords(&tree, &laid, "nopsz")
    );
}

#[test]
fn variable_font_multi_axis_shaping_preserves_space_advance() {
    // Setting wght and opsz together must not collapse the space advance:
    // the 900 span is wider than the 400 one by the bolder glyphs only.
    let (tree, laid) = variable_spans("");
    close(width(&tree, &laid, "w900"), 147.047, "wght 900");
}

#[test]
fn variable_wght_changes_shape_and_true_outline() {
    let (tree, laid) = variable_spans("");
    let regular = variable_run(&tree, &laid, "w400");
    let black = variable_run(&tree, &laid, "w900");
    assert!(!black.embolden, "a wght axis is used, not synthetic bold");
    assert_ne!(
        regular.coords, black.coords,
        "wght reaches the outline coordinates"
    );
    assert!(width(&tree, &laid, "w900") > width(&tree, &laid, "w400"));
}

#[test]
fn automatic_axes_follow_the_actual_variable_fallback_face() {
    // A missing glyph falls back to another face; the automatic opsz/wght
    // coordinates are those of the face that draws the run, so the bundled
    // static fallback carries none.
    let (tree, laid) =
        variable_spans("<div><span id=fallback style='font:900 40px VF'>Tools 漢</span></div>");
    let runs = faces(&tree, &laid, "fallback");
    let variable = runs
        .iter()
        .find(|run| !run.coords.is_empty())
        .expect("a VF run");
    assert!(!variable.embolden);
    for run in runs.iter().filter(|run| run.family != variable.family) {
        assert!(run.coords.is_empty(), "{run:?}");
    }
}

// --- Paint ----------------------------------------------------------------

fn pixel(pixmap: &tiny_skia::Pixmap, x: u32, y: u32) -> [u8; 4] {
    let p = pixmap.pixel(x, y).expect("pixel in range").demultiply();
    [p.red(), p.green(), p.blue(), p.alpha()]
}

/// The darkest and the reddest pixel colours inside the glyphs of "WWWW".
fn ink_colors(html: &str) -> Vec<[u8; 4]> {
    let tree = obscura_dom::parse_html(html);
    let pixmap = crate::paint::paint_dom(&tree, (200.0, 60.0), None).expect("paint");
    let mut out = Vec::new();
    for y in 0..60 {
        for x in 0..200 {
            let color = pixel(&pixmap, x, y);
            if color != [255, 255, 255, 255] {
                out.push(color);
            }
        }
    }
    out
}

#[test]
fn clip_fill_only_for_transparent_clip_text() {
    let base = "<!doctype html><body style='margin:0;background:#fff'>\
                <div style='font:bold 48px sans-serif;background:rgb(200,0,0);\
                -webkit-background-clip:text;background-clip:text;width:200px;color:";
    // Transparent text shows the background through the glyphs.
    let transparent = ink_colors(&format!("{base}transparent'>WWWW</div>"));
    assert!(transparent
        .iter()
        .any(|c| c[0] > 150 && c[1] < 60 && c[2] < 60));
    // Opaque text paints over the clipped background (Chrome: black glyphs).
    let opaque = ink_colors(&format!("{base}rgb(0,0,0)'>WWWW</div>"));
    assert!(opaque.iter().any(|c| c[0] < 40 && c[1] < 40 && c[2] < 40));
    assert!(
        !opaque.iter().any(|c| c[0] > 150 && c[1] < 60),
        "no red outside the glyph ink"
    );
    // Without background-clip:text, transparent text paints nothing and the
    // background fills the box.
    let plain = ink_colors(
        "<!doctype html><body style='margin:0;background:#fff'>\
         <div style='font:bold 48px sans-serif;color:transparent'>WWWW</div>",
    );
    assert!(plain.is_empty(), "{} inked pixels", plain.len());
}

#[test]
fn shaped_text_preserves_authored_alpha_through_mask_rasterization() {
    let ink = |color: &str, underline: bool| {
        let decoration = if underline {
            "text-decoration:underline;"
        } else {
            ""
        };
        let colors = ink_colors(&format!(
            "<!doctype html><body style='margin:0;background:#fff'>\
             <div style='font:32px/40px sans-serif;{decoration}color:{color}'>Alpha</div>"
        ));
        colors
            .iter()
            .map(|c| 255 - u64::from(c[0].min(c[1]).min(c[2])))
            .sum::<u64>()
    };
    assert_eq!(
        ink("rgba(0,0,0,0)", true),
        0,
        "transparent glyphs and decorations paint nothing"
    );
    let half = ink("rgba(0,0,0,0.5)", false);
    let opaque = ink("rgb(0,0,0)", false);
    assert!(half > 0 && opaque > 0);
    let ratio = half as f64 / opaque as f64;
    assert!(
        (0.4..0.6).contains(&ratio),
        "half alpha inks half as much: {ratio}"
    );
}

// --- vertical-align ------------------------------------------------------

#[test]
fn vertical_align_shifts_an_inline_span_once() {
    // Chrome line heights (16px Arial, line-height normal 18px). The shift
    // moves the span box; the text inside it is not shifted again.
    let (tree, laid) = layout(
        "<!doctype html><style>body{margin:0;font:16px Arial}.va{vertical-align:middle}\
         .vt{vertical-align:top}.vb{vertical-align:-3px}.vp{vertical-align:5px}</style>\
         <div id=low><span class=vb>vb</span></div>\
         <div id=up><span class=vp>vp</span></div>\
         <div id=mixed><span class=va>va</span> <span class=vt>vt</span> <span class=vb>vb</span></div>\
         <div id=big><span class=vb style='font-size:24px'>big</span></div>\
         <div id=middle><span class=va>va</span></div>",
        &[],
    );
    for (id, chrome) in [("low", 21.0), ("up", 23.0), ("mixed", 21.0), ("big", 28.0)] {
        assert_eq!(height(&tree, &laid, id), chrome, "{id}");
    }
    // middle: Chrome's line is 18.766px (the shift uses the unrounded
    // x-height); its box reports 18.77 through getBoundingClientRect.
    let middle = element(&tree, "middle");
    let ifc = laid.ifc.get(laid.ifc.by_node[&middle][0]).unwrap();
    let bottom = ifc
        .final_layout()
        .lines()
        .next()
        .unwrap()
        .metrics()
        .block_max_coord;
    assert!((bottom - 18.766).abs() < 0.03, "{bottom}");
    let up = element(&tree, "up");
    let span = tree.children(up)[0];
    assert_eq!(
        laid.rects[&span].y - laid.rects[&up].y,
        0.0,
        "a raised span sits at the line top"
    );
    // sub/super: Chrome lines of 22.1875px and 24.328px.
    let (tree, laid) = layout(
        "<!doctype html><style>body{margin:0;font:16px Arial}</style>\
         <div id=sub><span style='vertical-align:sub'>vu</span></div>\
         <div id=sup><span style='vertical-align:super'>vs</span></div>",
        &[],
    );
    for (id, chrome) in [("sub", 22.1875), ("sup", 24.328)] {
        let host = element(&tree, id);
        let ifc = laid.ifc.get(laid.ifc.by_node[&host][0]).unwrap();
        let line = *ifc.final_layout().lines().next().unwrap().metrics();
        let height = line.block_max_coord - line.block_min_coord;
        assert!((height - chrome).abs() < 0.02, "{id}: {height}");
    }
}

#[test]
fn closed_select_width_is_its_widest_label_plus_the_arrow_area() {
    // Chrome: ceil(widest option label) + 4px inset + 16px arrow + borders.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'>\
         <select id=s1><option>Option one</option></select>\
         <select id=s2><option>o</option></select>\
         <select id=s3><option>o</option><option>a much longer option label</option></select>\
         <select id=s4><option></option></select>\
         <select id=s5 style='font:16px Arial'><option>Option one</option></select>",
        &[],
    );
    for (id, chrome) in [
        ("s1", 88.0),
        ("s2", 30.0),
        ("s3", 179.0),
        ("s4", 22.0),
        ("s5", 101.0),
    ] {
        assert_eq!(width(&tree, &laid, id), chrome, "{id}");
    }
}

#[test]
fn unavailable_families_fall_through_to_the_next_family_then_the_serif_default() {
    // Chrome on this host: names that are not installed (Verdana, Segoe UI,
    // Roboto, Georgia, Menlo...) move on down the list and end at the
    // default standard font, Times New Roman = Liberation Serif (223.375px);
    // Arial/Helvetica alias Liberation Sans (241.891), Courier Liberation
    // Mono (288.047).
    let cases = [
        ("Verdana", 223.375),
        ("'Segoe UI'", 223.375),
        ("Roboto", 223.375),
        ("Georgia", 223.375),
        ("Menlo", 223.375),
        ("Verdana, sans-serif", 241.891),
        ("Helvetica", 241.891),
        ("Arial", 241.891),
        ("'Courier New'", 288.047),
        ("Times", 223.375),
    ];
    let html: String = cases
        .iter()
        .enumerate()
        .map(|(i, (family, _))| {
            format!("<div><span id=f{i} style=\"font-family:{family}\">{SAMPLE}</span></div>")
        })
        .collect();
    let (tree, laid) = layout(
        &format!(
            "<!doctype html><body style='margin:0;font-size:32px;white-space:pre'>{html}\
             <div><span id=plain>{SAMPLE}</span></div>"
        ),
        &[],
    );
    for (i, (family, chrome)) in cases.iter().enumerate() {
        close(width(&tree, &laid, &format!("f{i}")), *chrome, family);
    }
    close(width(&tree, &laid, "plain"), 223.375, "no font-family");
}

#[test]
fn host_installed_families_and_whole_pixel_glyph_fallback() {
    // Chrome on this host: a family installed on the host is used by name
    // (DejaVu Serif 282.453px, Nimbus Sans 240.453px for SAMPLE at 32px),
    // and a glyph missing from the page's font falls back to DejaVu Sans
    // with whole-pixel advances (❮ at 100px: 84px; DejaVu Sans named:
    // 83.80px).
    let (tree, laid) = layout(
        &format!(
            "<!doctype html><body style='margin:0;white-space:pre'>\
             <div><span id=serif style=\"font:32px 'DejaVu Serif'\">{SAMPLE}</span></div>\
             <div><span id=nimbus style=\"font:32px 'Nimbus Sans'\">{SAMPLE}</span></div>\
             <div><span id=fallback style='font:100px sans-serif'>❮</span></div>\
             <div><span id=named style=\"font:100px 'DejaVu Sans'\">❮</span></div>"
        ),
        &[],
    );
    let installed = |name: &str| super::fonts::tests_host_has_family(name);
    if installed("dejavu serif") {
        close(width(&tree, &laid, "serif"), 282.453, "DejaVu Serif");
    }
    if installed("nimbus sans") {
        assert!((width(&tree, &laid, "nimbus") - 240.453).abs() < 0.05);
    }
    close(width(&tree, &laid, "fallback"), 84.0, "fallback ❮");
    assert!(
        (width(&tree, &laid, "named") - 83.80).abs() < 0.02,
        "{} {:?}",
        width(&tree, &laid, "named"),
        faces(&tree, &laid, "named")
    );
}

#[test]
fn ch_lengths_use_the_advance_of_zero_in_the_font() {
    // Chrome: width:10ch is 102.016px in 17px monospace (Liberation Mono's
    // "0" is 0.6em) and 89.0px in 16px sans-serif (Liberation Sans 0.556em).
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'>\
         <div id=mono style='font:17px monospace;width:10ch'>x</div>\
         <div id=sans style='font:16px sans-serif;width:10ch'>x</div>",
        &[],
    );
    assert!(
        (width(&tree, &laid, "mono") - 102.016).abs() < 0.05,
        "{}",
        width(&tree, &laid, "mono")
    );
    assert!(
        (width(&tree, &laid, "sans") - 88.98).abs() < 0.05,
        "{}",
        width(&tree, &laid, "sans")
    );
}

#[test]
fn canvas_font_shorthand_measures_with_the_bundled_faces() {
    // Chrome canvas measureText("Download on the"): 12px Arial 90.064;
    // "400 12px Arial" the same; bold 96.656 (Liberation Sans Bold).
    let m = |font: &str| {
        crate::paint::measure_text_with_font_shorthand("Download on the", font).unwrap()
    };
    assert!((m("12px Arial") - 90.064).abs() < 0.01);
    assert!((m("400 12px Arial") - 90.064).abs() < 0.01);
    assert!(
        (m("bold 12px Arial") - 96.656).abs() < 0.01,
        "{}",
        m("bold 12px Arial")
    );
    assert!((m("600 12px Helvetica, Arial, sans-serif") - 96.656).abs() < 0.01);
}

#[test]
fn text_controls_size_from_the_fonts_average_character_width() {
    // Chrome on the capture host: default input 185, 16px Arial 215,
    // size=1 38, Helvetica (untrusted average: "0" advances) 186;
    // textarea default 181, 16px Arial 207.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'>\
         <input id=d><input id=a style='font:16px Arial'>\
         <input id=one size=1 style='font:16px Arial'>\
         <input id=h style='font:16px Helvetica, Arial'>\
         <textarea id=t></textarea><textarea id=ta style='font:16px Arial'></textarea>",
        &[],
    );
    for (id, want) in [
        ("d", 185.0),
        ("a", 215.0),
        ("one", 38.0),
        ("h", 186.0),
        ("t", 181.0),
        ("ta", 207.0),
    ] {
        assert_eq!(width(&tree, &laid, id), want, "{id}");
    }
}

#[test]
fn shrink_to_fit_treats_percentage_atomic_widths_as_auto() {
    // Chrome: an abspos shrink-to-fit box around a 30% wide 2400x538 image
    // in a 720px containing block is 720 wide (the image contributes its
    // natural width, clamped by the available width) and the image is 216.
    let tree = obscura_dom::parse_html(
        "<!doctype html><body style='margin:0'>\
         <div style='width:720px;position:relative;height:100px'>\
         <div id=d style='position:absolute;text-align:center'>\
         <span id=s><img id=i src=a.png style='width:30%'></span></div></div>",
    );
    let mut intrinsic = HashMap::new();
    intrinsic.insert(
        element(&tree, "i"),
        crate::ReplacedIntrinsic::from_dimensions(2400.0, 538.0),
    );
    let laid = crate::dom::layout_dom_with_web_fonts(&tree, (1280.0, 800.0), &intrinsic, &[]);
    assert_eq!(width(&tree, &laid, "d"), 720.0);
    assert_eq!(width(&tree, &laid, "i"), 216.0);
}

#[test]
fn glyphs_missing_from_bundled_fonts_fall_back_to_host_fonts() {
    // Chrome on the capture host (fontconfig's sans-serif order): 16px
    // Arial "漢字テスト" 80 wide, "한국어" 48, "ภาษาไทย" 68.
    if !super::fonts::tests_host_has_family("wenquanyi zen hei") {
        return;
    }
    let (tree, laid) = layout(
        "<!doctype html><meta charset=utf-8><body style='margin:0;font:16px Arial'>\
         <div><span id=ja>漢字テスト</span></div><div><span id=ko>한국어</span></div>\
         <div><span id=th>ภาษาไทย</span></div>",
        &[],
    );
    for (id, want) in [("ja", 80.0), ("ko", 48.0), ("th", 68.0)] {
        assert!(
            (width(&tree, &laid, id) - want).abs() < 0.5,
            "{id}: {}",
            width(&tree, &laid, id)
        );
    }
}

#[test]
fn floats_keep_their_first_childs_top_margin() {
    // Chrome: a float is a block formatting context root, so its first
    // child's margin-top stays inside it (float 80 tall around a 60px child
    // 20px down); the float used to lose the margin (60 tall).
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'><div style='width:810px'><p>x</p>\
         <div id=w style='float:left;width:100%'><div id=t style='margin-top:20px;padding:30px'></div></div>\
         <p id=after style='clear:both'>y</p></div>",
        &[],
    );
    assert_eq!(height(&tree, &laid, "w"), 80.0);
    let top = |id: &str| laid.rects[&element(&tree, id)].y;
    assert_eq!(top("t") - top("w"), 20.0);
}

#[test]
fn float_containing_boxes_keep_bottom_padding_below_floats() {
    // Chrome: 178 and 112 tall (the last float, then padding-bottom 32px).
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'>\
         <div id=a style='float:left;width:300px;padding:16px 0 32px'><p>x</p>\
         <div style='float:left;clear:both;width:100%;height:80px'></div></div>\
         <div id=b style='display:flow-root;width:300px;padding-bottom:32px;clear:both'>\
         <div style='float:left;height:80px;width:10px'></div></div>",
        &[],
    );
    assert_eq!(height(&tree, &laid, "a"), 178.0);
    assert_eq!(height(&tree, &laid, "b"), 112.0);
}

#[test]
fn percentage_images_in_shrink_to_fit_boxes_resolve_against_the_used_width() {
    // Chrome, a 433x273 image: in a content-sized flex item at width:95%;
    // height:220px the item is 348.94 (height x ratio) and the image
    // 331.48; in a float at width:95% the float is 433 and the image 411.34.
    let tree = obscura_dom::parse_html(
        "<!doctype html><body style='margin:0'>\
         <div style='display:flex;width:810px'><div id=a><img id=ia src=a.png style='width:95%;height:220px'></div></div>\
         <div id=f style='float:left'><img id=ie src=a.png style='width:95%'></div>",
    );
    let mut intrinsic = HashMap::new();
    for id in ["ia", "ie"] {
        intrinsic.insert(
            element(&tree, id),
            crate::ReplacedIntrinsic::from_dimensions(433.0, 273.0),
        );
    }
    let laid = crate::dom::layout_dom_with_web_fonts(&tree, (1280.0, 800.0), &intrinsic, &[]);
    let w = |id: &str| {
        let node = element(&tree, id);
        laid.fractional_rects
            .get(&node)
            .copied()
            .unwrap_or(laid.rects[&node])
            .width
    };
    assert!((w("a") - 348.94).abs() < 0.02, "{}", w("a"));
    assert!((w("ia") - 331.48).abs() < 0.02, "{}", w("ia"));
    assert_eq!(w("f"), 433.0);
    assert!((w("ie") - 411.34).abs() < 0.02, "{}", w("ie"));
}

#[test]
fn span_rects_exclude_whitespace_removed_at_line_ends() {
    // Chrome: <span style=padding-left:1px> x </span> is 9 wide (16px
    // Arial); an empty padded span after "x " at the end of a right-aligned
    // 300px line starts at 299.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:16px Arial'>\
         <div><span id=a style='padding-left:1px'> x </span></div>\
         <div style='text-align:right;width:300px'>x <span id=d style='padding-left:1px'></span></div>",
        &[],
    );
    let rect = |id: &str| {
        let node = element(&tree, id);
        laid.fractional_rects
            .get(&node)
            .copied()
            .unwrap_or(laid.rects[&node])
    };
    assert!((rect("a").width - 9.0).abs() < 0.02, "{:?}", rect("a"));
    assert!((rect("d").x - 299.0).abs() < 0.05, "{:?}", rect("d"));
}

#[test]
fn characters_missing_from_bundled_liberation_use_the_host_copy() {
    // Chrome: 16px Arial "עברית" is 42.328125 wide (host Liberation Sans 2,
    // fractional advances; the bundled copy has no Hebrew).
    if !super::fonts::tests_host_has_family("liberation sans") {
        return;
    }
    let (tree, laid) = layout(
        "<!doctype html><meta charset=utf-8><body style='margin:0;font:16px Arial'>\
         <div><span id=he>עברית</span></div>",
        &[],
    );
    let node = element(&tree, "he");
    let w = laid
        .fractional_rects
        .get(&node)
        .copied()
        .unwrap_or(laid.rects[&node])
        .width;
    assert!((w - 42.328).abs() < 0.02, "{w}");
}

#[test]
fn push_button_inputs_ignore_inherited_line_height() {
    // Chrome: under `font: inherit` from a 1.5 line-height parent, a 16px
    // Arial <input type=button> is 24 tall; a text input stays 30.
    let (tree, laid) = layout(
        "<!doctype html><style>input{font:inherit}</style>\
         <body style='margin:0;font:16px Arial;line-height:1.5'>\
         <input id=a type=button value='Go Back'><br><input id=b>",
        &[],
    );
    assert_eq!(height(&tree, &laid, "a"), 24.0);
    assert_eq!(height(&tree, &laid, "b"), 30.0);
}

#[test]
fn web_font_kerning_rounds_separately_from_the_advance() {
    // Chrome, Liberation Sans served as a 17px web font: "T" 10, "y" 9,
    // "Ty" 18 (the kerning rounds on its own), "AV" 21, "To" 17.
    let fonts = [web_font(super::fonts::SANS_R, "W", None)];
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:17px W'>\
         <div><span id=a>Ty</span></div><div><span id=d>AV</span></div><div><span id=e>To</span></div>",
        &fonts,
    );
    assert_eq!(width(&tree, &laid, "a"), 18.0);
    assert_eq!(width(&tree, &laid, "d"), 21.0);
    assert_eq!(width(&tree, &laid, "e"), 17.0);
}

#[test]
fn block_level_images_apply_their_ratio_to_the_content_box() {
    // Chrome: a display:block 120px border-box image with a 6px border and
    // width/height attributes 420x868 is 235.19 tall (108 x 868/420 + 12).
    let tree = obscura_dom::parse_html(
        "<!doctype html><body style='margin:0'><div>\
         <img id=i src=a.png width=420 height=868 \
         style='display:block;width:120px;height:auto;box-sizing:border-box;border:6px solid'></div>",
    );
    let mut intrinsic = HashMap::new();
    intrinsic.insert(
        element(&tree, "i"),
        crate::ReplacedIntrinsic::from_dimensions(420.0, 868.0),
    );
    let laid = crate::dom::layout_dom_with_web_fonts(&tree, (1280.0, 800.0), &intrinsic, &[]);
    let node = element(&tree, "i");
    let h = laid
        .fractional_rects
        .get(&node)
        .copied()
        .unwrap_or(laid.rects[&node])
        .height;
    assert!((h - 235.19).abs() < 0.02, "{h}");
}
