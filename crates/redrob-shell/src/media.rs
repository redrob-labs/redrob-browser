//! Video and audio playback for `<video>` and `<audio>`. Design: docs/MEDIA.md.
//!
//! The page keeps the element's state; the window plays the media with
//! GStreamer and draws the current frame over the page at the element's
//! position, the way a compositor places a video layer. Built with the
//! `media` feature; without it the element stays at its poster.

use std::sync::{Arc, Mutex};

/// What the window reports back to the page after each poll.
#[derive(Clone, Copy, Default, Debug)]
pub struct Status {
    pub current_time: f64,
    pub duration: f64,
    pub paused: bool,
    pub ended: bool,
    pub width: u32,
    pub height: u32,
    /// HAVE_NOTHING (0) to HAVE_ENOUGH_DATA (4).
    pub ready_state: u8,
    pub error: bool,
}

/// The newest decoded frame, RGBA, tightly packed.
#[derive(Default)]
pub struct Frame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    /// Bumped per frame so the window uploads only new ones.
    pub serial: u64,
}

pub trait Player: Send {
    fn play(&mut self);
    fn pause(&mut self);
    fn seek(&mut self, seconds: f64);
    fn set_volume(&mut self, volume: f64, muted: bool);
    fn status(&mut self) -> Status;
    fn frame(&self) -> Arc<Mutex<Frame>>;
    /// Media Source Extensions: the page added a SourceBuffer of this type.
    fn mse_add(&mut self, _sb: u64, _mime: &str) {}
    /// Bytes the page appended to SourceBuffer `sb`.
    fn mse_append(&mut self, _sb: u64, _bytes: Vec<u8>) {}
    /// MediaSource.endOfStream().
    fn mse_end(&mut self) {}
}

/// A player fed by a page's MediaSource, or None without a media backend.
pub fn open_mse() -> Option<Box<dyn Player>> {
    #[cfg(feature = "media")]
    {
        match mse_backend::MsePlayer::new() {
            Ok(p) => return Some(Box::new(p)),
            Err(e) => eprintln!("redrob-browser: cannot start MediaSource playback: {e}"),
        }
    }
    None
}

/// Open `url` for playback, or None when this build has no media backend.
pub fn open(url: &str) -> Option<Box<dyn Player>> {
    #[cfg(feature = "media")]
    {
        match gst_backend::GstPlayer::open(url) {
            Ok(p) => return Some(Box::new(p)),
            Err(e) => eprintln!("redrob-browser: cannot play {url}: {e}"),
        }
    }
    let _ = url;
    None
}

#[cfg(feature = "media")]
mod gst_backend {
    use super::*;
    use gstreamer as gst;
    use gstreamer::prelude::*;
    use gstreamer_app as gst_app;
    use gstreamer_video as gst_video;

    /// Point GStreamer at the runtime a release package carries, unless the
    /// environment already names one. macOS: `Contents/Frameworks/
    /// GStreamer.framework` (scripts/package-macos.sh). Windows: the DLLs next
    /// to the program and the plugins in `lib\gstreamer-1.0` (release.yml).
    /// Without a bundled runtime (Linux, a source build) nothing is set and the
    /// system GStreamer is used.
    fn use_bundled_runtime() {
        let Some(dir) = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        else {
            return;
        };
        let root = if cfg!(target_os = "macos") {
            dir.join("../Frameworks/GStreamer.framework/Versions/1.0")
        } else {
            dir
        };
        let plugins = root.join("lib").join("gstreamer-1.0");
        if !plugins.is_dir() {
            return;
        }
        let set = |key: &str, value: std::path::PathBuf| {
            if std::env::var_os(key).is_none() {
                std::env::set_var(key, value);
            }
        };
        set("GST_PLUGIN_SYSTEM_PATH_1_0", plugins);
        let scanner = root
            .join("libexec")
            .join("gstreamer-1.0")
            .join(if cfg!(windows) {
                "gst-plugin-scanner.exe"
            } else {
                "gst-plugin-scanner"
            });
        if scanner.is_file() {
            set("GST_PLUGIN_SCANNER_1_0", scanner);
        }
        let gio = root.join("lib").join("gio").join("modules");
        if gio.is_dir() {
            set("GIO_EXTRA_MODULES", gio);
        }
    }

    pub struct GstPlayer {
        playbin: gst::Element,
        frame: Arc<Mutex<Frame>>,
        ended: bool,
        error: bool,
    }

    impl GstPlayer {
        pub fn open(url: &str) -> anyhow::Result<Self> {
            init()?;
            let scheme = url.split(':').next().unwrap_or("");
            if !matches!(scheme, "http" | "https") {
                anyhow::bail!("only http and https media are played");
            }
            let frame: Arc<Mutex<Frame>> = Default::default();
            let sink = video_sink(frame.clone());
            let playbin = gst::ElementFactory::make("playbin")
                .property("uri", url)
                .build()?;
            playbin.set_property("video-sink", &sink);
            playbin.set_state(gst::State::Paused)?;
            Ok(Self {
                playbin,
                frame,
                ended: false,
                error: false,
            })
        }
    }

    /// Start GStreamer once per process.
    pub(super) fn init() -> anyhow::Result<()> {
        static INIT: std::sync::OnceLock<Result<(), String>> = std::sync::OnceLock::new();
        INIT.get_or_init(|| {
            // A packaged app carries its own GStreamer (release.yml); point GStreamer at it first.
            use_bundled_runtime();
            gst::init().map_err(|e| e.to_string())
        })
        .clone()
        .map_err(|e| anyhow::anyhow!("GStreamer: {e}"))
    }

    /// An appsink that copies each RGBA frame into `frame`.
    pub(super) fn video_sink(frame: Arc<Mutex<Frame>>) -> gst_app::AppSink {
        let caps = gst_video::VideoCapsBuilder::new()
            .format(gst_video::VideoFormat::Rgba)
            .build();
        let sink = gst_app::AppSink::builder()
            .caps(&caps)
            .max_buffers(2)
            .drop(true)
            .build();
        let target = frame;
        sink.set_callbacks(
            gst_app::AppSinkCallbacks::builder()
                .new_sample(move |s| {
                    let sample = s.pull_sample().map_err(|_| gst::FlowError::Eos)?;
                    let buffer = sample.buffer().ok_or(gst::FlowError::Error)?;
                    let caps = sample.caps().ok_or(gst::FlowError::Error)?;
                    let info =
                        gst_video::VideoInfo::from_caps(caps).map_err(|_| gst::FlowError::Error)?;
                    let map = buffer.map_readable().map_err(|_| gst::FlowError::Error)?;
                    let (w, h) = (info.width(), info.height());
                    let stride = info.stride()[0] as usize;
                    let row = w as usize * 4;
                    let mut rgba = Vec::with_capacity(row * h as usize);
                    for y in 0..h as usize {
                        let start = y * stride;
                        if let Some(line) = map.get(start..start + row) {
                            rgba.extend_from_slice(line);
                        }
                    }
                    if let Ok(mut f) = target.lock() {
                        f.width = w;
                        f.height = h;
                        f.rgba = rgba;
                        f.serial += 1;
                    }
                    Ok(gst::FlowSuccess::Ok)
                })
                .build(),
        );
        sink
    }

    impl Player for GstPlayer {
        fn play(&mut self) {
            if self.ended {
                self.seek(0.0);
                self.ended = false;
            }
            let _ = self.playbin.set_state(gst::State::Playing);
        }

        fn pause(&mut self) {
            let _ = self.playbin.set_state(gst::State::Paused);
        }

        fn seek(&mut self, seconds: f64) {
            let t = gst::ClockTime::from_mseconds((seconds.max(0.0) * 1000.0) as u64);
            let _ = self
                .playbin
                .seek_simple(gst::SeekFlags::FLUSH | gst::SeekFlags::KEY_UNIT, t);
            self.ended = false;
        }

        fn set_volume(&mut self, volume: f64, muted: bool) {
            self.playbin.set_property("volume", volume.clamp(0.0, 1.0));
            self.playbin.set_property("mute", muted);
        }

        fn status(&mut self) -> Status {
            if let Some(bus) = self.playbin.bus() {
                while let Some(msg) =
                    bus.pop_filtered(&[gst::MessageType::Eos, gst::MessageType::Error])
                {
                    match msg.view() {
                        gst::MessageView::Eos(_) => self.ended = true,
                        gst::MessageView::Error(_) => self.error = true,
                        _ => {}
                    }
                }
            }
            let pos = self
                .playbin
                .query_position::<gst::ClockTime>()
                .map(|t| t.mseconds() as f64 / 1000.0);
            let dur = self
                .playbin
                .query_duration::<gst::ClockTime>()
                .map(|t| t.mseconds() as f64 / 1000.0);
            let (_, state, _) = self.playbin.state(gst::ClockTime::ZERO);
            let (width, height) = self
                .frame
                .lock()
                .map(|f| (f.width, f.height))
                .unwrap_or((0, 0));
            Status {
                current_time: pos.unwrap_or(0.0),
                duration: dur.unwrap_or(f64::NAN),
                paused: state != gst::State::Playing,
                ended: self.ended,
                width,
                height,
                ready_state: if self.error {
                    0
                } else if width > 0 {
                    4
                } else if dur.is_some() {
                    1
                } else {
                    0
                },
                error: self.error,
            }
        }

        fn frame(&self) -> Arc<Mutex<Frame>> {
            self.frame.clone()
        }
    }

    impl Drop for GstPlayer {
        fn drop(&mut self) {
            let _ = self.playbin.set_state(gst::State::Null);
        }
    }
}

/// Media Source Extensions playback: one appsrc per SourceBuffer.
#[cfg(feature = "media")]
#[path = "mse.rs"]
mod mse_backend;
