//! Connect to an engine scene channel (`Page.redrobSceneAttach`) as the
//! window would, for checks: prints each message, acknowledges frames, and
//! can scroll the document like the compositor does.
//!
//! `scene_client <socket> <seconds> <out.png> [scroll_after_first_frame_y]`

#[cfg(unix)]
fn main() {
    use std::collections::HashMap;
    use std::io::{Read, Write};
    use std::os::unix::net::UnixStream;
    use std::time::{Duration, Instant};

    use redrob_scene::{ClientMsg, Frame, Rect, SceneMsg, SpatialKind};
    use redrob_scene_raster::{rasterize, to_png, ResourceStore};

    let args: Vec<String> = std::env::args().collect();
    let mut stream = UnixStream::connect(&args[1]).expect("connect");
    let seconds: f64 = args[2].parse().expect("seconds");
    let scroll_y: Option<f32> = args.get(4).and_then(|v| v.parse().ok());
    stream
        .set_read_timeout(Some(Duration::from_millis(50)))
        .unwrap();
    let started = Instant::now();
    let mut buf = Vec::new();
    let mut resources = ResourceStore::new();
    let mut frame: Option<Frame> = None;
    let mut scrolled = false;
    let mut offsets: HashMap<u64, (f32, f32)> = HashMap::new();
    let mut chunk = vec![0u8; 1 << 20];
    while started.elapsed().as_secs_f64() < seconds {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
            Err(_) => {}
        }
        while buf.len() >= 4 {
            let len = u32::from_le_bytes(buf[..4].try_into().unwrap()) as usize;
            if buf.len() < 4 + len {
                break;
            }
            let at = started.elapsed().as_secs_f64() * 1000.0;
            let message: SceneMsg = redrob_scene::decode(&buf[4..4 + len]).expect("decode");
            match message {
                SceneMsg::Resources(list) => {
                    println!("{at:8.1} ms Resources n={} bytes={len}", list.len());
                    resources.apply_all(list);
                }
                SceneMsg::Frame(next) => {
                    let sticky = next
                        .spatial
                        .iter()
                        .filter(|n| matches!(n.kind, SpatialKind::Sticky { .. }))
                        .count();
                    println!(
                        "{at:8.1} ms Frame epoch={} bytes={len} items={} hits={} spatial={} sticky={}",
                        next.epoch,
                        next.items.len(),
                        next.hits.len(),
                        next.spatial.len(),
                        sticky
                    );
                    let epoch = next.epoch;
                    frame = Some(next);
                    let ack = redrob_scene::encode(&ClientMsg::Presented { epoch });
                    stream.write_all(&ack).unwrap();
                    if let (Some(y), false) = (scroll_y, scrolled) {
                        scrolled = true;
                        offsets.insert(0, (0.0, y));
                        let msg = redrob_scene::encode(&ClientMsg::Scrolled {
                            node: 0,
                            offset: (0.0, y),
                        });
                        stream.write_all(&msg).unwrap();
                        println!("{at:8.1} ms -> Scrolled node=0 y={y}");
                    }
                }
                SceneMsg::Delta(delta) => {
                    let changed: Vec<String> = delta
                        .spatial
                        .iter()
                        .flatten()
                        .filter_map(|n| match n.kind {
                            SpatialKind::Scroll {
                                offset,
                                offset_changed_by_page: true,
                                node,
                                ..
                            } => Some(format!("node {node} -> {offset:?}")),
                            _ => None,
                        })
                        .collect();
                    println!(
                        "{at:8.1} ms Delta epoch={} base={} bytes={len} page-scrolls={changed:?}",
                        delta.epoch, delta.base_epoch
                    );
                    if let (Some(spatial), Some(frame)) = (delta.spatial, frame.as_mut()) {
                        for node in &spatial {
                            if let SpatialKind::Scroll {
                                offset,
                                offset_changed_by_page: true,
                                node,
                                ..
                            } = node.kind
                            {
                                offsets.insert(node, offset);
                            }
                        }
                        frame.spatial = spatial;
                    }
                    let ack = redrob_scene::encode(&ClientMsg::Presented { epoch: delta.epoch });
                    stream.write_all(&ack).unwrap();
                }
            }
            buf.drain(..4 + len);
        }
    }
    if let Some(frame) = frame {
        let image = rasterize(
            &frame,
            &resources,
            &offsets,
            Rect {
                x: 0.0,
                y: 0.0,
                w: frame.viewport.0,
                h: frame.viewport.1,
            },
            1.0,
        );
        std::fs::write(&args[3], to_png(&image)).unwrap();
        println!("wrote {} with offsets {offsets:?}", args[3]);
    }
}

#[cfg(not(unix))]
fn main() {
    eprintln!("scene_client needs a Unix socket");
}
