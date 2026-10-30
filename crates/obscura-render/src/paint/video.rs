//! Video frames for painting `<video>` without a window (docs/MEDIA.md).
//!
//! With the `media` feature the engine decodes the frame a paused video
//! shows (the first, or the one at `currentTime`) through GStreamer, the
//! same backend the window plays with; its decoders are the operating
//! system's. Bytes come from the page's resource cache, so the request
//! goes through the page's network stack like any other subresource.
//! Without the feature nothing decodes and `<video>` paints its poster.

/// One decoded frame and the stream's metadata.
#[derive(Clone, Debug)]
pub struct DecodedFrame {
    pub width: u32,
    pub height: u32,
    /// Seconds, `NaN` when the stream does not say.
    pub duration: f64,
    /// The file has an audio stream.
    pub has_audio: bool,
    /// Straight RGBA.
    pub rgba: Vec<u8>,
}

/// Decode the frame at `time` seconds of the media file `bytes`.
#[cfg(feature = "media")]
pub fn decode_frame(bytes: std::sync::Arc<[u8]>, time: f64) -> Option<DecodedFrame> {
    gst_decode::decode(bytes, time)
}

#[cfg(not(feature = "media"))]
pub fn decode_frame(_bytes: std::sync::Arc<[u8]>, _time: f64) -> Option<DecodedFrame> {
    None
}

#[cfg(feature = "media")]
mod gst_decode {
    use super::DecodedFrame;
    use gstreamer as gst;
    use gstreamer::prelude::*;
    use gstreamer_app as gst_app;
    use gstreamer_video as gst_video;
    use std::sync::{Arc, Mutex};

    const TIMEOUT: gst::ClockTime = gst::ClockTime::from_seconds(10);

    fn init() -> bool {
        static INIT: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
        *INIT.get_or_init(|| gst::init().is_ok())
    }

    /// Wait for the pipeline to finish its state change; false on error.
    fn settle(pipeline: &gst::Pipeline) -> bool {
        let Some(bus) = pipeline.bus() else {
            return false;
        };
        let deadline = std::time::Instant::now() + std::time::Duration::from(TIMEOUT);
        while std::time::Instant::now() < deadline {
            let Some(message) = bus.timed_pop_filtered(
                gst::ClockTime::from_mseconds(200),
                &[gst::MessageType::AsyncDone, gst::MessageType::Error],
            ) else {
                continue;
            };
            return matches!(message.view(), gst::MessageView::AsyncDone(_));
        }
        false
    }

    pub(super) fn decode(bytes: Arc<[u8]>, time: f64) -> Option<DecodedFrame> {
        if !init() || bytes.is_empty() {
            return None;
        }
        let pipeline = gst::Pipeline::new();
        let has_audio = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let result = (|| {
            let src = gst_app::AppSrc::builder().build();
            let decode = gst::ElementFactory::make("decodebin").build().ok()?;
            let convert = gst::ElementFactory::make("videoconvert").build().ok()?;
            let scale = gst::ElementFactory::make("videoscale").build().ok()?;
            let caps = gst_video::VideoCapsBuilder::new()
                .format(gst_video::VideoFormat::Rgba)
                .pixel_aspect_ratio(gst::Fraction::new(1, 1))
                .build();
            let sink = gst_app::AppSink::builder().caps(&caps).build();
            pipeline
                .add_many([
                    src.upcast_ref(),
                    &decode,
                    &convert,
                    &scale,
                    sink.upcast_ref(),
                ])
                .ok()?;
            gst::Element::link_many([src.upcast_ref(), &decode]).ok()?;
            gst::Element::link_many([&convert, &scale, sink.upcast_ref()]).ok()?;
            // Video goes to the sink; every other stream to a fakesink, so an
            // unlinked audio pad cannot stop the pipeline.
            let weak = pipeline.downgrade();
            let video_in = convert.static_pad("sink")?;
            let audio = has_audio.clone();
            decode.connect_pad_added(move |_, pad| {
                let Some(pipeline) = weak.upgrade() else {
                    return;
                };
                let kind = pad
                    .current_caps()
                    .and_then(|caps| caps.structure(0).map(|s| s.name().to_string()))
                    .unwrap_or_default();
                if kind.starts_with("video/") && !video_in.is_linked() {
                    let _ = pad.link(&video_in);
                    return;
                }
                if kind.starts_with("audio/") {
                    audio.store(true, std::sync::atomic::Ordering::Relaxed);
                }
                if let Ok(fake) = gst::ElementFactory::make("fakesink")
                    .property("sync", false)
                    .property("async", false)
                    .build()
                {
                    if pipeline.add(&fake).is_ok() {
                        let _ = fake.sync_state_with_parent();
                        if let Some(sink_pad) = fake.static_pad("sink") {
                            let _ = pad.link(&sink_pad);
                        }
                    }
                }
            });
            src.set_stream_type(gst_app::AppStreamType::RandomAccess);
            src.set_size(bytes.len() as i64);
            src.set_format(gst::Format::Bytes);
            let offset = Arc::new(Mutex::new(0usize));
            let (feed, seek) = (offset.clone(), offset);
            let data = bytes.clone();
            src.set_callbacks(
                gst_app::AppSrcCallbacks::builder()
                    .need_data(move |src, length| {
                        let mut at = feed.lock().unwrap_or_else(|e| e.into_inner());
                        if *at >= data.len() {
                            let _ = src.end_of_stream();
                            return;
                        }
                        let end = (*at + (length as usize).max(4096)).min(data.len());
                        let buffer = gst::Buffer::from_slice(data[*at..end].to_vec());
                        *at = end;
                        let _ = src.push_buffer(buffer);
                    })
                    .seek_data(move |_, position| {
                        *seek.lock().unwrap_or_else(|e| e.into_inner()) = position as usize;
                        true
                    })
                    .build(),
            );
            sink.set_property("sync", false);
            pipeline.set_state(gst::State::Paused).ok()?;
            if !settle(&pipeline) {
                return None;
            }
            let duration = pipeline
                .query_duration::<gst::ClockTime>()
                .map_or(f64::NAN, |d| d.nseconds() as f64 / 1e9);
            if time > 0.0 && time.is_finite() {
                let at = gst::ClockTime::from_nseconds((time * 1e9) as u64);
                if pipeline
                    .seek_simple(gst::SeekFlags::FLUSH | gst::SeekFlags::ACCURATE, at)
                    .is_ok()
                {
                    settle(&pipeline);
                }
            }
            let sample = sink.try_pull_preroll(TIMEOUT)?;
            let caps = sample.caps()?;
            let info = gst_video::VideoInfo::from_caps(caps).ok()?;
            let buffer = sample.buffer()?;
            let map = buffer.map_readable().ok()?;
            let (width, height) = (info.width(), info.height());
            let stride = info.stride()[0] as usize;
            let row = width as usize * 4;
            let mut rgba = Vec::with_capacity(row * height as usize);
            for y in 0..height as usize {
                rgba.extend_from_slice(map.get(y * stride..y * stride + row)?);
            }
            Some(DecodedFrame {
                width,
                height,
                duration,
                has_audio: has_audio.load(std::sync::atomic::Ordering::Relaxed),
                rgba,
            })
        })();
        let _ = pipeline.set_state(gst::State::Null);
        result
    }
}
