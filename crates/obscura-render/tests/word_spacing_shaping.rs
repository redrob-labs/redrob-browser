#![cfg(feature = "paint")]

//! `word-spacing` through the Parley inline formatting context: the extra
//! advance lands on word separators only (spaces and no-break spaces), never
//! on tabs, em spaces or other glyphs. Layout rects are rounded to whole
//! pixels, so widths compare within half a pixel.

use obscura_render::dom::layout_dom;

fn width_of(html: &str) -> f32 {
    let tree = obscura_dom::parse_html(html);
    let laid = layout_dom(&tree, (800.0, 200.0));
    let id = tree.get_element_by_id("t").unwrap();
    laid.rects[&id].width
}

fn page(text: &str, spacing: &str) -> String {
    format!(
        "<style>body{{margin:0}} #t{{display:inline-block;white-space:pre;\
         font:16px/20px monospace;word-spacing:{spacing}}}</style>\
         <span id=t>{text}</span>"
    )
}

#[test]
fn word_spacing_adds_to_each_separator() {
    let normal = width_of(&page("A B C", "0"));
    for spacing in [0.75f32, 3.0, -1.0] {
        let spaced = width_of(&page("A B C", &format!("{spacing}px")));
        assert!(
            (spaced - normal - 2.0 * spacing).abs() <= 0.5,
            "spacing {spacing}: {spaced} vs {normal}"
        );
    }
}

#[test]
fn word_spacing_skips_tabs_and_non_separator_spaces() {
    for (text, separators) in [
        ("A\u{a0}B", 1.0f32),
        ("A\tB", 0.0),
        ("A\u{2003}B", 0.0),
        ("A  B", 2.0),
    ] {
        let normal = width_of(&page(text, "0"));
        let spaced = width_of(&page(text, "4px"));
        assert!(
            (spaced - normal - 4.0 * separators).abs() <= 0.5,
            "{text:?}: {spaced} vs {normal}"
        );
    }
}
