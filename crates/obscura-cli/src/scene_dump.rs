//! `OBSCURA_SCENE_DUMP=<file.json>` with `fetch --screenshot`: write the
//! page's GPU compositor frame (docs/COMPOSITOR.md) next to the PNG. The
//! `.bin` beside it is the exact channel stream (Resources, then Frame);
//! the JSON summarizes it for checks: build times, sizes, the spatial tree,
//! item counts and every hit region with the element it names.

use obscura_browser::Page;
use obscura_js::redrob_scene as rs;

pub fn write_scene_dump(page: &Page, path: &std::path::Path) -> anyhow::Result<()> {
    let scale = std::env::var("OBSCURA_SCENE_SCALE")
        .ok()
        .and_then(|value| value.parse::<f32>().ok())
        .unwrap_or(1.0);
    let started = std::time::Instant::now();
    let built = page
        .scene_frame(scale)
        .map_err(|error| anyhow::anyhow!("scene frame failed: {error:?}"))?;
    let build_ms = started.elapsed().as_secs_f64() * 1000.0;
    // A second build of the unchanged page: the steady-state cost of a
    // content-change frame once images are decoded.
    let again = std::time::Instant::now();
    let rebuilt = page.scene_frame(scale).ok();
    let rebuild_ms = again.elapsed().as_secs_f64() * 1000.0;
    let rebuild_paint_ms = rebuilt.as_ref().map(|frame| frame.stats.paint_ms);
    let mut resources = Vec::new();
    for image in &built.images {
        resources.push(rs::Resource::Image {
            id: image.id,
            width: image.width,
            height: image.height,
            rgba: image.rgba.as_ref().clone(),
        });
    }
    for font in &built.fonts {
        resources.push(rs::Resource::Font {
            id: font.id,
            data: font.data.bytes().to_vec(),
            index: font.data.index(),
        });
    }
    for instance in &built.font_instances {
        resources.push(rs::Resource::FontInstance {
            id: instance.id,
            font: instance.font,
            axes: instance.axes.clone(),
        });
    }
    let encode_started = std::time::Instant::now();
    let resources_bytes = rs::encode(&rs::SceneMsg::Resources(resources));
    let frame_bytes = rs::encode(&rs::SceneMsg::Frame(built.frame.clone()));
    let encode_ms = encode_started.elapsed().as_secs_f64() * 1000.0;
    let mut stream = resources_bytes.clone();
    stream.extend_from_slice(&frame_bytes);
    std::fs::write(path.with_extension("bin"), &stream)?;

    let mut kinds: std::collections::BTreeMap<&str, usize> = Default::default();
    let mut glyphs = 0usize;
    for item in &built.frame.items {
        let kind = match &item.item {
            rs::Item::Rect { .. } => "Rect",
            rs::Item::RoundedRect { .. } => "RoundedRect",
            rs::Item::Path { .. } => "Path",
            rs::Item::Stroke { .. } => "Stroke",
            rs::Item::LinearGradient { .. } => "LinearGradient",
            rs::Item::RadialGradient { .. } => "RadialGradient",
            rs::Item::BoxShadow { .. } => "BoxShadow",
            rs::Item::Image { .. } => "Image",
            rs::Item::Text { glyphs: run, .. } => {
                glyphs += run.len();
                "Text"
            }
            rs::Item::External { .. } => "External",
            rs::Item::PushClip { .. } => "PushClip",
            rs::Item::PushClipPath { .. } => "PushClipPath",
            rs::Item::PopClip => "PopClip",
            rs::Item::PushLayer { .. } => "PushLayer",
            rs::Item::PopLayer => "PopLayer",
        };
        *kinds.entry(kind).or_default() += 1;
    }
    let describe = |index: u64| -> String {
        page.with_dom(|dom| {
            dom.with_node(obscura_dom::tree::NodeId::new(index as u32), |node| {
                let Some(name) = node.as_element() else {
                    return "#text".to_string();
                };
                let mut out = name.local.to_string();
                if let Some(id) = node.get_attribute("id") {
                    out.push('#');
                    out.push_str(id);
                }
                if let Some(class) = node.get_attribute("class") {
                    for class in class.split_whitespace().take(3) {
                        out.push('.');
                        out.push_str(class);
                    }
                }
                out
            })
            .unwrap_or_default()
        })
        .unwrap_or_default()
    };
    let hits: Vec<serde_json::Value> = built
        .frame
        .hits
        .iter()
        .map(|hit| {
            serde_json::json!({
                "node": hit.node,
                "element": describe(hit.node),
                "spatial": hit.spatial.0,
                "rect": [hit.rect.x, hit.rect.y, hit.rect.w, hit.rect.h],
                "clip": hit.clip.map(|c| [c.x, c.y, c.w, c.h]),
                "cursor": format!("{:?}", hit.cursor),
                "text": hit.is_text,
                "link": hit.link,
            })
        })
        .collect();
    let spatial: Vec<serde_json::Value> = built
        .frame
        .spatial
        .iter()
        .map(|node| {
            let mut value = serde_json::to_value(node).unwrap_or_default();
            if let rs::SpatialKind::Scroll { node: dom, .. } = &node.kind {
                if *dom != 0 {
                    value["element"] = serde_json::Value::String(describe(*dom));
                }
            }
            value
        })
        .collect();
    let image_bytes: usize = built.images.iter().map(|image| image.rgba.len()).sum();
    let font_bytes: usize = built.fonts.iter().map(|font| font.data.bytes().len()).sum();
    let summary = serde_json::json!({
        "buildMs": build_ms,
        "paintMs": built.stats.paint_ms,
        "rebuildMs": rebuild_ms,
        "rebuildPaintMs": rebuild_paint_ms,
        "assembleMs": built.stats.assemble_ms,
        "encodeMs": encode_ms,
        "document": [built.stats.document.0, built.stats.document.1],
        "recordedOps": built.stats.ops,
        "frameBytes": frame_bytes.len(),
        "resourceBytes": resources_bytes.len(),
        "images": built.images.len(),
        "imageBytes": image_bytes,
        "fonts": built.fonts.len(),
        "fontBytes": font_bytes,
        "fontInstances": built.font_instances.len(),
        "items": built.frame.items.len(),
        "itemKinds": kinds,
        "glyphs": glyphs,
        "hitCount": built.frame.hits.len(),
        "viewport": [built.frame.viewport.0, built.frame.viewport.1],
        "background": built.frame.background,
        "spatial": spatial,
        "hits": hits,
    });
    let mut summary = summary;
    if std::env::var("OBSCURA_SCENE_DUMP_ITEMS").is_ok_and(|value| value == "1") {
        summary["items"] = serde_json::to_value(&built.frame.items)?;
    }
    std::fs::write(path, serde_json::to_vec_pretty(&summary)?)?;
    Ok(())
}
