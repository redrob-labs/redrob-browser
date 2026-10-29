//! Rasterize a recorded scene channel stream (length-prefixed SceneMsg
//! frames, as `OBSCURA_SCENE_DUMP` writes) to a PNG.
//!
//! `render_stream <stream.bin> <out.png> [scroll_y] [node:x:y ...]`
//! renders the viewport of the last Frame with the document scrolled to
//! `scroll_y` and any element scrollers at the given offsets.

use std::collections::HashMap;

use redrob_scene::{Frame, Rect, SceneMsg};
use redrob_scene_raster::{rasterize, to_png, ResourceStore};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("usage: render_stream <stream.bin> <out.png> [scroll_y] [node:x:y ...]");
        std::process::exit(2);
    }
    let bytes = std::fs::read(&args[1]).expect("read stream");
    let mut resources = ResourceStore::new();
    let mut frame: Option<Frame> = None;
    let mut at = 0usize;
    while at + 4 <= bytes.len() {
        let len = u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap()) as usize;
        let body = &bytes[at + 4..at + 4 + len];
        at += 4 + len;
        match redrob_scene::decode::<SceneMsg>(body).expect("decode message") {
            SceneMsg::Resources(list) => resources.apply_all(list),
            SceneMsg::Frame(next) => frame = Some(next),
            SceneMsg::Delta(_) => {}
        }
    }
    let frame = frame.expect("stream has a frame");
    let mut scroll = HashMap::new();
    if let Some(y) = args.get(3).and_then(|y| y.parse::<f32>().ok()) {
        scroll.insert(0u64, (0.0, y));
    }
    for spec in args.iter().skip(4) {
        let parts: Vec<&str> = spec.split(':').collect();
        if let [node, x, y] = parts[..] {
            scroll.insert(
                node.parse().expect("node"),
                (x.parse().expect("x"), y.parse().expect("y")),
            );
        }
    }
    let started = std::time::Instant::now();
    let image = rasterize(
        &frame,
        &resources,
        &scroll,
        Rect {
            x: 0.0,
            y: 0.0,
            w: frame.viewport.0,
            h: frame.viewport.1,
        },
        1.0,
    );
    eprintln!(
        "rasterized {}x{} in {:.1} ms",
        image.width,
        image.height,
        started.elapsed().as_secs_f64() * 1000.0
    );
    std::fs::write(&args[2], to_png(&image)).expect("write png");
}
