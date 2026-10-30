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
    assert!(
        height(&tree, &laid, "a") < 30.0,
        "{}",
        height(&tree, &laid, "a")
    );
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

#[test]
fn decorated_inlines_split_around_blocks() {
    // Chrome: the block inside a padded/bordered span spans the container
    // (400) and the span's first fragment keeps only its start edge
    // (24.8 = 2 + 5 + "bb"); a padding-left-only span before a block makes
    // a 17px line. 512 nested padded spans leave the block 1280 wide.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:16px Arial'>\
         <div style='width:400px'>aa <span id=s style='padding:0 5px;border:2px solid'>bb\
         <div id=d style='height:20px'>blk</div>cc</span> dd</div>\
         <div style='width:400px'><span style='padding-left:3px'><div id=d2>x</div></span></div>",
        &[],
    );
    let r = |id: &str| laid.rects[&element(&tree, id)];
    assert_eq!((r("d").x, r("d").y, r("d").width), (0.0, 18.0, 400.0));
    assert_eq!((r("d2").y, r("d2").width), (74.0, 400.0));
    let first = laid.inline_fragments[&element(&tree, "s")][0];
    assert!((first.width - 24.797).abs() < 0.02, "{first:?}");
    let n = 512;
    let html = format!(
        "<!doctype html><body style='margin:0'>{}<div id=deep>x</div>{}",
        "<span style='padding-left:1px'>".repeat(n),
        "</span>".repeat(n)
    );
    let (tree, laid) = layout(&html, &[]);
    assert_eq!(laid.rects[&element(&tree, "deep")].width, 1280.0);
}

#[test]
fn table_caption_min_content_keeps_its_fraction() {
    // Chrome: a table whose caption's longest word ("caption", 16px
    // sans-serif) is wider than its two cells is 51.6 wide, not 52.
    let (tree, laid) = layout(
        "<!doctype html><style>body{margin:8px;font:16px/20px sans-serif} td{border:1px solid}</style>\
         <table id=a><caption>Top caption that is longer than the table</caption>\
         <tr><td>a</td><td>b</td></tr></table>",
        &[],
    );
    let node = element(&tree, "a");
    let w = laid
        .fractional_rects
        .get(&node)
        .copied()
        .unwrap_or(laid.rects[&node])
        .width;
    assert!((w - 51.6).abs() < 0.05, "{w}");
}

#[test]
fn inline_around_a_block_spans_the_anonymous_block() {
    // Chrome: an <a> around a centered max-width:300px block in a 500px
    // container is 500 wide (the anonymous block box), not 300.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'><div style='width:500px'>\
         <a id=a href=#><div style='max-width:300px;margin:auto;position:relative;height:10px'></div></a></div>",
        &[],
    );
    let r = laid.rects[&element(&tree, "a")];
    assert_eq!((r.x, r.width), (0.0, 500.0));
}

#[test]
fn table_cells_keep_fractional_heights_after_block_alignment() {
    // Chrome: 15px/1.5 Verdana cells with 4px padding are 30.5 tall and
    // the second starts at 34.5 (2px border-spacing); we pinned 31 and 30.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:15px/1.5 Verdana,sans-serif'>\
         <table><tr><td id=e style='padding:4px'>a</td></tr><tr><td id=f style='padding:4px'>a</td></tr></table>",
        &[],
    );
    for id in ["e", "f"] {
        let node = element(&tree, id);
        let rect = laid
            .fractional_rects
            .get(&node)
            .copied()
            .unwrap_or(laid.rects[&node]);
        assert_eq!(rect.height, 30.5, "{id}");
    }
}

#[test]
fn picture_sources_are_empty_inlines() {
    // Chrome: <source> is an empty inline: 0 wide, one line box tall, at
    // its position in the line ("a " in 16px Arial: x 13.34).
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:16px Arial'><div>a <source id=s width=500 height=500> b</div>",
        &[],
    );
    let r = laid
        .fractional_rects
        .get(&element(&tree, "s"))
        .copied()
        .or_else(|| {
            laid.inline_fragments
                .get(&element(&tree, "s"))
                .and_then(|f| f.first().copied())
        })
        .unwrap_or(laid.rects[&element(&tree, "s")]);
    assert!(
        (r.x - 13.34).abs() < 0.02 && r.width == 0.0 && r.height == 17.0,
        "{r:?}"
    );
}

#[test]
fn ch_lengths_use_the_inherited_font() {
    // Chrome: an inline-block span in 17px <code> with width:10ch is
    // 102.016 wide (inherited monospace "0"), not 85 (default serif).
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'><code style='font-size:17px'>\
         <span id=s style='display:inline-block;width:10ch'></span></code>",
        &[],
    );
    assert!(
        (width(&tree, &laid, "s") - 102.0).abs() < 0.5,
        "{}",
        width(&tree, &laid, "s")
    );
}

#[test]
fn three_d_transforms_project_through_perspective_and_preserve_3d() {
    // Chrome (w3schools carousel at rotateY(90deg), perspective 1000px):
    // card 0 (translateZ(173px)) 34.95 x 222.22 at 257.27, 68.89 here;
    // card 1 (rotateY(60deg)) 157.48 x 181.85 at 99.91, 89.08; the
    // preserve-3d carousel itself 0 x 222.22. calc() angles resolve.
    let (tree, laid) = layout(
        "<!doctype html><style>:root{--n:6;--r:173px}body{margin:0}\
         .c{width:200px;height:200px;margin:80px auto 0 0;perspective:1000px}\
         .k{position:absolute;width:200px;height:200px;\
         transform:rotateY(calc(var(--i) * (360deg / var(--n)))) translateZ(var(--r))}</style>\
         <div class=c style='margin-left:0'><div id=car style='position:relative;width:100%;height:100%;\
         transform-style:preserve-3d;transform:rotateY(90deg)'>\
         <div class=k id=k0 style='--i:0'></div><div class=k id=k1 style='--i:1'></div></div></div>",
        &[],
    );
    let r = |id: &str| {
        let node = element(&tree, id);
        laid.transformed_rect(node, laid.rects[&node])
    };
    let close = |a: f32, b: f32| (a - b).abs() < 0.05;
    let (k0, k1, car) = (r("k0"), r("k1"), r("car"));
    assert!(
        close(k0.width, 34.95) && close(k0.height, 222.22) && close(k0.x, 257.27),
        "{k0:?}"
    );
    assert!(
        close(k1.width, 157.48) && close(k1.height, 181.85) && close(k1.y, 89.08),
        "{k1:?}"
    );
    assert!(
        close(car.width, 0.0) && close(car.height, 222.22),
        "{car:?}"
    );
}

#[test]
fn angle_calc_and_matrix3d_parse() {
    let (tree, laid) = layout(
        "<!doctype html><div id=a style='width:10px;height:10px;transform:rotate(calc(0.5turn - 90deg))'></div>\
         <div id=b style='width:10px;height:10px;transform:matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,5,6,7,1)'></div>",
        &[],
    );
    let a = laid.transforms[&element(&tree, "a")];
    assert!(
        (a.a - 0.0).abs() < 1e-5 && (a.b - 1.0).abs() < 1e-5,
        "{a:?}"
    );
    let b = laid.projective_transforms[&element(&tree, "b")];
    assert_eq!(b.m[2][3], 7.0);
}

#[test]
fn baseline_aligned_cells_share_the_row_baseline() {
    // Chrome: a row of vertical-align:baseline cells, one with
    // padding-top:20px: the 40px "B" span is at y 2 and the <br> of
    // "c<br>d" at 24 (we had -8 and 5 with the cells top-aligned).
    let (tree, laid) = layout(
        "<!doctype html><style>body{margin:0;font:16px/20px sans-serif} td{border:1px solid;height:80px}</style>\
         <table><tr><td style='vertical-align:baseline;padding-top:20px'>a</td>\
         <td style='vertical-align:baseline'><span id=s style='font-size:40px'>B</span></td>\
         <td style='vertical-align:baseline'>c<br id=t>d</td></tr></table>",
        &[],
    );
    let y = |id: &str| {
        let node = element(&tree, id);
        laid.fractional_rects
            .get(&node)
            .copied()
            .unwrap_or(laid.rects[&node])
            .y
    };
    assert!((y("s") - 2.0).abs() < 0.5, "{}", y("s"));
    assert!((y("t") - 24.0).abs() < 0.5, "{}", y("t"));
}

#[test]
fn overflowing_atomic_at_line_start_keeps_trailing_space_on_its_line() {
    // Chrome: a 160px image in a 100px block followed by whitespace is one
    // line around the 20px image (we opened an empty second line);
    // a following word still wraps.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:16px/24px Arial'>\
         <div id=a style='width:100px'>\n <span></span>\n <img style='width:160px;height:20px'>\n</div>\
         <div style='width:100px'><img style='width:160px;height:20px'> word <span id=w>x</span></div>",
        &[],
    );
    assert!(
        height(&tree, &laid, "a") < 30.0,
        "{}",
        height(&tree, &laid, "a")
    );
    let w = laid.rects[&element(&tree, "w")];
    // "word x" is on the second line, below the image line.
    assert!(w.x < 50.0 && w.y > height(&tree, &laid, "a"), "{w:?}");
}

#[test]
fn kerning_applies_across_undecorated_inline_boundaries() {
    // Chrome (42px Arial, Liberation Sans): "L" before <span> " T" kerns
    // with the space: the span starts at 21.813, not 23.359. A span with
    // padding breaks shaping (23.359).
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:42px Arial'>\
         <div>L<span id=a> T</span></div><div>L<span id=b style='padding-left:2px'> T</span></div>",
        &[],
    );
    let x = |id: &str| {
        let node = element(&tree, id);
        laid.inline_fragments[&node][0].x
    };
    assert!((x("a") - 21.81).abs() < 0.05, "{}", x("a"));
    assert!((x("b") - 23.36).abs() < 0.05, "{}", x("b"));
}

#[test]
fn stretched_row_flex_items_are_definite_for_percentage_children() {
    // Chrome: in a row flex container of indefinite height, a stretched
    // item (300px from its sibling) lets a height:100% child be 300.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'><div style='display:flex'>\
         <div style='height:300px;width:100px'>a</div>\
         <div><div id=p style='height:100%;width:50px'></div></div></div>",
        &[],
    );
    assert_eq!(height(&tree, &laid, "p"), 300.0);
}

#[test]
fn min_height_that_grows_a_box_keeps_the_last_margin_inside() {
    // Chrome: a min-height:100px box over a 50px child with margin-bottom
    // 20px is 100 tall and the next sibling's 16px margin starts at 100.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'><div style='min-height:100px'>\
         <div style='height:50px;margin-bottom:20px'></div></div>\
         <div id=b style='margin-top:16px;height:5px'></div>",
        &[],
    );
    assert_eq!(laid.rects[&element(&tree, "b")].y, 116.0);
}

#[test]
fn preserved_spaces_hanging_at_a_line_end_stay_in_the_inline_box() {
    // Chrome: a pre-wrap span wrapping in a 100px box keeps the hanging
    // space of its lines (84.03 = 10 monospace advances); with normal
    // white-space it is removed (75.6 = 9).
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:14px monospace'>\
         <div style='width:100px;white-space:pre-wrap'><span id=a>aaaa bbbb cccc dddd</span></div>\
         <div style='width:100px'><span id=b>aaaa bbbb cccc dddd</span></div>",
        &[],
    );
    let w = |id: &str| {
        let node = element(&tree, id);
        laid.fractional_rects
            .get(&node)
            .copied()
            .unwrap_or(laid.rects[&node])
            .width
    };
    assert!((w("a") - 84.03).abs() < 0.1, "{}", w("a"));
    assert!((w("b") - 75.61).abs() < 0.1, "{}", w("b"));
}

#[test]
fn negative_collapsed_first_child_margin_can_rise_above_the_content_edge() {
    // Chrome: in a padding-top:25px box, a child whose own first child has
    // margin-top:-40px (collapsing through it) starts 15px above the box's
    // border edge: y 60 for a box at 75.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'><div style='height:100px'></div>\
         <div style='margin-top:-25px;padding-top:25px'><div id=h>\
         <h2 style='margin-top:-40px;padding-top:40px;margin-bottom:0'>x</h2></div></div>",
        &[],
    );
    assert_eq!(laid.rects[&element(&tree, "h")].y, 60.0);
}

#[test]
fn atomic_with_negative_margin_box_keeps_the_line_and_sits_on_the_baseline() {
    // Chrome: a 5px image with margin-top:-20px still makes a 24px line
    // (16px/24px Arial) and its bottom edge stays on the baseline (y 12).
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:16px/24px Arial'>\
         <div id=d><img id=s style='width:10px;height:5px;margin-top:-20px'></div>",
        &[],
    );
    assert_eq!(height(&tree, &laid, "d"), 24.0);
    assert_eq!(laid.rects[&element(&tree, "s")].y, 12.0);
}

#[test]
fn web_fonts_use_light_autohinted_advances() {
    // Chrome on Linux (FreeType light autohinting): Liberation Sans served
    // as an 18px web font: "t" advance 5 (linear 5.0), "m" 15 and the
    // word "mt" 20; widths are whole pixels.
    let fonts = [web_font(super::fonts::SANS_R, "W", None)];
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:18px W'><div><span id=a>mt</span></div>",
        &fonts,
    );
    let w = width(&tree, &laid, "a");
    assert_eq!(w, w.round(), "{w}");
}

#[test]
fn legend_sits_on_the_fieldset_border_and_shrinks_to_fit() {
    // Chrome: a legend in a full-width fieldset is 84 wide at the fieldset
    // top (y 0), and the fieldset is 53.59 tall; <map> is inline.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:16px Arial'>\
         <fieldset id=f><legend id=l>Personalia:</legend>x</fieldset>\
         <div>a<map id=m name=x></map>b</div>",
        &[],
    );
    let r = |id: &str| {
        let node = element(&tree, id);
        laid.fractional_rects
            .get(&node)
            .copied()
            .unwrap_or(laid.rects[&node])
    };
    assert!(
        (r("l").width - 84.05).abs() < 0.5 && r("l").y == 0.0,
        "{:?}",
        r("l")
    );
    assert!((r("f").height - 53.59).abs() < 0.05, "{:?}", r("f"));
    assert_eq!(
        laid.styles[&element(&tree, "m")].display,
        crate::Display::Inline
    );
}

#[test]
fn inline_fragment_around_a_middle_aligned_image_stands_on_the_baseline() {
    // Chrome: <a><img middle 395px tall><br>... has a first fragment at
    // y 187.73 (the line's baseline), not at the image bottom.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:16px Arial'><div style='width:300px'>\
         <a id=a href=#><img style='width:220px;height:375px;vertical-align:middle;border:10px solid'>\
         <br><br><b>Without</b></a></div>",
        &[],
    );
    let first = laid.inline_fragments[&element(&tree, "a")][0];
    assert!((first.y - 187.73).abs() < 0.1, "{first:?}");
}

#[test]
fn whitespace_only_inline_runs_make_no_line_fragments() {
    // Chrome: <span><span>\n</span> <div>x</div></span> is just the
    // block (0, 22.5): the whitespace before it makes no line box.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:15px/22.5px monospace'>\
         <div><span id=s><span>\n</span> <div>x</div>\n </span></div>",
        &[],
    );
    let r = laid.rects[&element(&tree, "s")];
    assert_eq!(r.y, 0.0, "{r:?}");
}

#[test]
fn functional_flex_basis_resolves_against_the_container() {
    // Chrome: `flex: 0 0 calc(41.6667% - 16px)` in a 768px row is 304
    // wide (the shorthand split calc() at its spaces and dropped it).
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'><div style='display:flex;width:768px;gap:32px'>\
         <div id=a style='flex:0 0 calc(58.3333% - 16px)'>a</div>\
         <div id=b style='flex-basis:calc(41.6667% - 16px);flex-grow:0;flex-shrink:0'>b</div></div>",
        &[],
    );
    assert!((width(&tree, &laid, "a") - 432.0).abs() < 0.5);
    assert!((width(&tree, &laid, "b") - 304.0).abs() < 0.5);
}

#[test]
fn inline_boxes_on_the_empty_line_after_a_last_br_are_empty() {
    // Chrome: in <span>a<br><span>\n</span>b<br><span id=t>\n</span></span>
    // the last span makes no line box: (0, 45, 0, 0) at the end of the
    // second line, not a 17px box.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:15px/22.5px monospace'><div><span id=p>a<br><span id=s>\n</span>b<br><span id=t>\n</span></span></div>",
        &[],
    );
    let t = laid.inline_fragments[&element(&tree, "t")][0];
    assert_eq!((t.y, t.width, t.height), (45.0, 0.0, 0.0), "{t:?}");
    let s = laid.inline_fragments[&element(&tree, "s")][0];
    assert_eq!(s.height, 17.0, "{s:?}");
}

#[test]
fn absolutely_positioned_box_of_floats_shrinks_to_the_float_row() {
    // Chrome: a right:2px absolute box holding three 32px left floats is
    // 96 wide with the floats in one row (plotly's modebar); it was 0 wide
    // with the floats stacked.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'><div style='position:relative;width:700px;height:400px'>\
         <div id=m style='position:absolute;top:2px;right:2px'>\
         <div id=a style='float:left;width:32px'>x</div><div style='float:left;width:32px'>x</div>\
         <div id=c style='float:left;width:32px'>x</div></div></div>",
        &[],
    );
    let r = |id: &str| laid.rects[&element(&tree, id)];
    assert_eq!((r("m").x, r("m").width), (602.0, 96.0), "{:?}", r("m"));
    assert_eq!((r("c").x, r("c").y), (666.0, 2.0), "{:?}", r("c"));
}

#[test]
fn null_cells_in_grid_template_areas_count_as_explicit_columns() {
    // Chrome: grid-template-areas 'a a a . .' makes five auto columns, so
    // items 2 and 3 fill columns 4 and 5 of the first row (a 443.59, b at
    // 443.59 and 153.2 wide, c at 596.8) and item 4 wraps.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0'><div style=\"display:grid;width:750px;grid-template-areas:'a a a . .'\">\
         <div id=a style='grid-area:a'>1</div><div id=b>2</div><div id=c>3</div><div id=d>4</div></div>",
        &[],
    );
    let r = |id: &str| {
        let node = element(&tree, id);
        laid.fractional_rects
            .get(&node)
            .copied()
            .unwrap_or(laid.rects[&node])
    };
    assert!((r("a").width - 443.59).abs() < 0.05, "{:?}", r("a"));
    assert!(
        (r("b").x - 443.59).abs() < 0.05 && r("b").y == 0.0,
        "{:?}",
        r("b")
    );
    assert!(
        (r("c").x - 596.8).abs() < 0.05 && r("c").y == 0.0,
        "{:?}",
        r("c")
    );
    assert!(r("d").x == 0.0 && r("d").y == 18.0, "{:?}", r("d"));
}

#[test]
fn bundled_liberation_sans_kerns_digit_pairs_like_chrome() {
    // Chrome (Liberation Sans 2.1.5, HarfBuzz): "1111" at 16px Arial is
    // 32.03 wide, the "11" pair kerned by -152 units; 1.07.4 had no pair
    // (35.59).
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:16px Arial'><div><span id=a>1111</span></div>",
        &[],
    );
    let w = width(&tree, &laid, "a");
    assert!((w - 32.03).abs() < 0.05, "{w}");
}

#[test]
fn percentage_image_wrapper_shrinks_in_a_full_flex_row() {
    // Chrome: in a 376px row, a 170px column and a shrinkable wrapper of a
    // width:100% image (natural 250) leave the wrapper 206 wide, not 250.
    let png = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22250%22%20height%3D%22179%22%2F%3E";
    let html = format!(
        "<!doctype html><body style='margin:0'><div style='display:flex;width:376px'>\
         <div style='flex:0 0 170px'>x</div><div id=p style='flex:1 1 auto;display:flex'>\
         <img src=\"{png}\" width=250 height=179 style='width:100%;display:block'></div></div>"
    );
    let (tree, laid) = layout(&html, &[]);
    assert!(
        (width(&tree, &laid, "p") - 206.0).abs() < 0.5,
        "{}",
        width(&tree, &laid, "p")
    );
}

#[test]
fn absolute_shrink_to_fit_room_excludes_insets() {
    // Chrome (CSS 2 10.3.7): in a 300px containing block, an auto-width box
    // at left:250px wraps in 50px, one at left:-200px fits on one line
    // (213 wide) instead of wrapping at 300.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:16px Arial'><div style='position:relative;width:300px;height:100px'>\
         <div id=a style='position:absolute;left:250px;top:0'>hello world foo bar</div>\
         <div id=b style='position:absolute;left:-200px;top:20px'>hello world foo bar baz qux quux</div></div>",
        &[],
    );
    let a = laid.rects[&element(&tree, "a")];
    let b = laid.rects[&element(&tree, "b")];
    assert!(a.width <= 50.0 && a.height > 50.0, "{a:?}");
    assert!(b.width > 210.0 && b.height < 20.0, "{b:?}");
}

#[test]
fn culled_inline_rect_spans_its_padded_children() {
    // Chrome: an undecorated span around a child with 8px padding reports
    // the child's extent (y -8, 33 tall); a span with a background keeps
    // its own 17px font box.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:16px Arial'><div>\
         <span id=b><span style='padding:8px'>B</span></span> \
         <span id=d style='background:#eee'><span style='padding:8px'>C</span></span></div>",
        &[],
    );
    let b = laid.inline_fragments[&element(&tree, "b")][0];
    let d = laid.inline_fragments[&element(&tree, "d")][0];
    assert_eq!((b.y, b.height), (-8.0, 33.0), "{b:?}");
    assert_eq!((d.y, d.height), (0.0, 17.0), "{d:?}");
}

#[test]
fn calc_percentages_resolve_against_layout_unit_widths() {
    // Chrome: 83.33333% of 1050 is the LayoutUnit 874.984375, so four
    // calc(25% - 20px) images with 10px margins fit one row of the flex
    // gallery inside it (175.234375 each); against 874.99997 they were
    // 175.25 and the fourth wrapped.
    let png = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22600%22%20height%3D%22400%22%2F%3E";
    let img = |id: &str| {
        format!("<img id={id} src=\"{png}\" width=600 height=400 style='position:relative;width:calc(25% - 20px);height:auto;margin:10px'>")
    };
    let html = format!(
        "<!doctype html><body style='margin:0'><div style='width:1050px'>\
         <div style='float:left;width:83.33333%;padding:0 32px;box-sizing:border-box'>\
         <div style='display:flex;flex-wrap:wrap;padding:0 15px;box-sizing:border-box'>{}{}{}{}</div></div></div>",
        img("a"), img("b"), img("c"), img("d")
    );
    let (tree, laid) = layout(&html, &[]);
    let d = laid
        .fractional_rects
        .get(&element(&tree, "d"))
        .copied()
        .unwrap_or(laid.rects[&element(&tree, "d")]);
    assert_eq!((d.y, d.width), (10.0, 175.234375), "{d:?}");
}

#[test]
fn text_wraps_around_shape_outside_circles_and_ellipses() {
    // Chrome: a paragraph in 500px beside a 300x300 left float is 360 tall;
    // with shape-outside:circle(45%) 312, with ellipse(25% 50%) 264
    // (16px/24px Arial).
    let text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla ac laoreet quam, id aliquet nisl. Etiam id eros ligula. Aenean euismod, enim sed mollis feugiat, magna massa cursus leo, ut maximus metus eros non ante. Praesent quis neque eu urna dignissim consequat. Sed vitae tincidunt quam. Vivamus nec ipsum vitae justo pretium ornare. Maecenas tempor tellus at lacus interdum, in congue lectus ultricies.";
    let height = |shape: &str| {
        let (tree, laid) = layout(
            &format!(
                "<!doctype html><body style='margin:0;font:16px/24px Arial'><div style='width:500px'>\
                 <div style='float:left;width:300px;height:300px;{shape}'></div>\
                 <p id=p style='margin:0'>{text}</p></div>"
            ),
            &[],
        );
        laid.rects[&element(&tree, "p")].height
    };
    assert_eq!(
        (
            height(""),
            height("shape-outside:circle(45%)"),
            height("shape-outside:ellipse(25% 50%)")
        ),
        (360.0, 312.0, 264.0)
    );
}

#[test]
fn vertical_writing_mode_inline_becomes_an_upright_inline_block() {
    // Chrome: <span style=writing-mode:vertical-rl>vertical-rl</span> in
    // 16px/24px text is an inline-block 24 wide (one line box) and as tall
    // as its text, and the line box grows to hold it.
    let (tree, laid) = layout(
        "<!doctype html><body style='margin:0;font:16px/24px Arial'><p id=p style='margin:0'>a \
         <span id=s style='writing-mode:vertical-rl'>vertical-rl</span> b</p>",
        &[],
    );
    let s = laid.rects[&element(&tree, "s")];
    let p = laid.rects[&element(&tree, "p")];
    assert_eq!(s.width, 24.0, "{s:?}");
    assert!(s.height > 60.0 && p.height > s.height, "{s:?} {p:?}");
}
