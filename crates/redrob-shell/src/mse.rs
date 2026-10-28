//! Media Source Extensions in the window (docs/MEDIA.md).
//!
//! The page's SourceBuffers hand their bytes to the window. Each SourceBuffer
//! is an `appsrc` feeding its own `decodebin`; decoded video goes to the same
//! RGBA appsink as `playbin` playback and decoded audio to the system audio
//! sink. A seek rebuilds the pipeline, which flushes every appsrc, and replays
//! each SourceBuffer's initialization segment; the page then appends the
//! media segments for the new position, as MSE players do after `seeking`.

use super::gst_backend::{init, video_sink};
use super::*;
use gstreamer as gst;
use gstreamer::prelude::*;
use gstreamer_app as gst_app;

/// State the decodebin callbacks share with the player.
struct Shared {
    /// Running time of the first decoded buffer. Sinks render with this
    /// subtracted, so a stream whose first segment starts late plays at once.
    origin: Option<i64>,
    sinks: Vec<gst::Element>,
    volume_element: Option<gst::Element>,
    volume: f64,
    muted: bool,
    video_linked: bool,
    audio_linked: bool,
}

struct Source {
    id: u64,
    appsrc: gst_app::AppSrc,
    /// The latest initialization segment (ftyp+moov, or the WebM header up
    /// to the first Cluster), replayed after a seek.
    init: Vec<u8>,
}

pub struct MsePlayer {
    pipeline: gst::Pipeline,
    shared: Arc<Mutex<Shared>>,
    frame: Arc<Mutex<Frame>>,
    sources: Vec<Source>,
    playing: bool,
    ended: bool,
    error: bool,
    /// Reported as currentTime after a seek until new frames arrive.
    seek_to: Option<f64>,
}

impl MsePlayer {
    pub fn new() -> anyhow::Result<Self> {
        init()?;
        let shared = Arc::new(Mutex::new(Shared {
            origin: None,
            sinks: Vec::new(),
            volume_element: None,
            volume: 1.0,
            muted: false,
            video_linked: false,
            audio_linked: false,
        }));
        let pipeline = gst::Pipeline::new();
        pipeline.set_state(gst::State::Paused)?;
        Ok(Self {
            pipeline,
            shared,
            frame: Default::default(),
            sources: Vec::new(),
            playing: false,
            ended: false,
            error: false,
            seek_to: None,
        })
    }

    /// An appsrc ! decodebin branch in the current pipeline.
    fn branch(&self) -> anyhow::Result<gst_app::AppSrc> {
        let appsrc = gst_app::AppSrc::builder()
            .format(gst::Format::Bytes)
            .block(false)
            // 0 = no limit: the page decides how much it buffers.
            .max_bytes(0)
            .build();
        let decodebin = gst::ElementFactory::make("decodebin").build()?;
        self.pipeline.add_many([appsrc.upcast_ref::<gst::Element>(), &decodebin])?;
        appsrc.link(&decodebin)?;
        let weak = self.pipeline.downgrade();
        let shared = self.shared.clone();
        let frame = self.frame.clone();
        decodebin.connect_pad_added(move |_, pad| {
            let Some(pipeline) = weak.upgrade() else { return };
            link_decoded(&pipeline, pad, &shared, &frame);
        });
        decodebin.sync_state_with_parent()?;
        appsrc.sync_state_with_parent()?;
        Ok(appsrc)
    }

    /// Throw the pipeline away and start an empty one with the same
    /// SourceBuffers, their initialization segments queued again.
    fn rebuild(&mut self) {
        let _ = self.pipeline.set_state(gst::State::Null);
        let (volume, muted) = self.shared.lock().map(|s| (s.volume, s.muted)).unwrap_or((1.0, false));
        self.shared = Arc::new(Mutex::new(Shared {
            origin: None,
            sinks: Vec::new(),
            volume_element: None,
            volume,
            muted,
            video_linked: false,
            audio_linked: false,
        }));
        self.pipeline = gst::Pipeline::new();
        let _ = self.pipeline.set_state(gst::State::Paused);
        let old = std::mem::take(&mut self.sources);
        for s in old {
            match self.branch() {
                Ok(appsrc) => {
                    if !s.init.is_empty() {
                        let _ = appsrc.push_buffer(gst::Buffer::from_slice(s.init.clone()));
                    }
                    self.sources.push(Source { id: s.id, appsrc, init: s.init });
                }
                Err(e) => {
                    eprintln!("redrob-browser: MediaSource: {e}");
                    self.error = true;
                }
            }
        }
        if self.playing {
            let _ = self.pipeline.set_state(gst::State::Playing);
        }
    }
}

/// decodebin found a stream: send video to the RGBA appsink and audio to
/// the speakers, once each.
fn link_decoded(pipeline: &gst::Pipeline, pad: &gst::Pad, shared: &Arc<Mutex<Shared>>, frame: &Arc<Mutex<Frame>>) {
    let caps = pad.current_caps().unwrap_or_else(|| pad.query_caps(None));
    let Some(name) = caps.structure(0).map(|s| s.name().as_str().to_string()) else { return };
    let Ok(mut sh) = shared.lock() else { return };
    let make = |f: &str| gst::ElementFactory::make(f).build().ok();
    let chain: Vec<gst::Element> = if name.starts_with("video/") && !sh.video_linked {
        let Some(convert) = make("videoconvert") else { return };
        sh.video_linked = true;
        vec![convert, video_sink(frame.clone()).upcast()]
    } else if name.starts_with("audio/") && !sh.audio_linked {
        let (Some(convert), Some(resample), Some(volume), Some(out)) =
            (make("audioconvert"), make("audioresample"), make("volume"), make("autoaudiosink"))
        else {
            return;
        };
        volume.set_property("volume", sh.volume);
        volume.set_property("mute", sh.muted);
        sh.volume_element = Some(volume.clone());
        sh.audio_linked = true;
        vec![convert, resample, volume, out]
    } else {
        return;
    };
    let sink = chain.last().expect("chain is never empty").clone();
    if let Some(o) = sh.origin {
        set_offset(&sink, o);
    }
    sh.sinks.push(sink);
    drop(sh);
    if pipeline.add_many(chain.iter()).is_err() || gst::Element::link_many(chain.iter()).is_err() {
        return;
    }
    for e in &chain {
        let _ = e.sync_state_with_parent();
    }
    if let Some(sinkpad) = chain[0].static_pad("sink") {
        let _ = pad.link(&sinkpad);
    }
    let shared = shared.clone();
    let _ = pad.add_probe(gst::PadProbeType::BUFFER, move |pad, info| {
        let Some(pts) = info.buffer().and_then(|b| b.pts()) else { return gst::PadProbeReturn::Ok };
        let running = pad
            .sticky_event::<gst::event::Segment>(0)
            .and_then(|ev| ev.segment().downcast_ref::<gst::ClockTime>().and_then(|s| s.to_running_time(pts)))
            .unwrap_or(pts);
        if let Ok(mut sh) = shared.lock() {
            if sh.origin.is_none() {
                let o = running.nseconds() as i64;
                sh.origin = Some(o);
                for s in &sh.sinks {
                    set_offset(s, o);
                }
            }
        }
        gst::PadProbeReturn::Remove
    });
}

/// Render `sink`'s buffers `origin` nanoseconds of running time earlier.
fn set_offset(sink: &gst::Element, origin: i64) {
    if sink.find_property("ts-offset").is_some() {
        sink.set_property("ts-offset", -origin);
    }
}

/// Length of the initialization segment at the start of `b`, if it starts
/// with one: MP4 ftyp/moov boxes up to the first moof or mdat, or a WebM
/// EBML header up to the first Cluster.
fn init_len(b: &[u8]) -> Option<usize> {
    if b.len() >= 8 && (&b[4..8] == b"ftyp" || &b[4..8] == b"moov") {
        let mut off = 0usize;
        while off + 8 <= b.len() {
            let size32 = u32::from_be_bytes([b[off], b[off + 1], b[off + 2], b[off + 3]]) as usize;
            let kind = &b[off + 4..off + 8];
            if kind == b"moof" || kind == b"mdat" {
                return Some(off);
            }
            let size = match size32 {
                0 => b.len() - off,
                1 if off + 16 <= b.len() => {
                    let mut x = [0u8; 8];
                    x.copy_from_slice(&b[off + 8..off + 16]);
                    u64::from_be_bytes(x) as usize
                }
                1 => return Some(b.len()),
                n => n,
            };
            if size < 8 {
                return Some(b.len());
            }
            off = off.saturating_add(size);
        }
        return Some(off.min(b.len()));
    }
    if b.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]) {
        let cluster = [0x1F, 0x43, 0xB6, 0x75];
        return Some(b.windows(4).position(|w| w == cluster).unwrap_or(b.len()));
    }
    None
}

impl Player for MsePlayer {
    fn play(&mut self) {
        self.playing = true;
        self.ended = false;
        let _ = self.pipeline.set_state(gst::State::Playing);
    }

    fn pause(&mut self) {
        self.playing = false;
        let _ = self.pipeline.set_state(gst::State::Paused);
    }

    fn seek(&mut self, seconds: f64) {
        self.ended = false;
        self.seek_to = Some(seconds.max(0.0));
        self.rebuild();
    }

    fn set_volume(&mut self, volume: f64, muted: bool) {
        if let Ok(mut sh) = self.shared.lock() {
            sh.volume = volume.clamp(0.0, 1.0);
            sh.muted = muted;
            if let Some(v) = &sh.volume_element {
                v.set_property("volume", sh.volume);
                v.set_property("mute", muted);
            }
        }
    }

    fn status(&mut self) -> Status {
        if let Some(bus) = self.pipeline.bus() {
            while let Some(msg) = bus.pop_filtered(&[gst::MessageType::Eos, gst::MessageType::Error]) {
                match msg.view() {
                    gst::MessageView::Eos(_) => self.ended = true,
                    gst::MessageView::Error(e) => {
                        eprintln!("redrob-browser: MediaSource: {}", e.error());
                        self.error = true;
                    }
                    _ => {}
                }
            }
        }
        let started = self.shared.lock().map(|s| s.origin.is_some()).unwrap_or(false);
        let pos = self.pipeline.query_position::<gst::ClockTime>().map(|t| t.mseconds() as f64 / 1000.0);
        let current_time = match (self.seek_to, started, pos) {
            (Some(t), false, _) | (Some(t), true, None) => t,
            (_, _, Some(p)) => {
                self.seek_to = None;
                p
            }
            (None, _, None) => 0.0,
        };
        let (width, height) = self.frame.lock().map(|f| (f.width, f.height)).unwrap_or((0, 0));
        let (_, state, _) = self.pipeline.state(gst::ClockTime::ZERO);
        Status {
            current_time,
            // The page's MediaSource.duration is the duration.
            duration: f64::NAN,
            paused: state != gst::State::Playing,
            ended: self.ended,
            width,
            height,
            ready_state: if self.error {
                0
            } else if width > 0 || started {
                4
            } else if !self.sources.is_empty() {
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

    fn mse_add(&mut self, sb: u64, _mime: &str) {
        if self.sources.iter().any(|s| s.id == sb) {
            return;
        }
        // decodebin finds the container and codecs itself, so the MIME type
        // is not needed to build the branch.
        match self.branch() {
            Ok(appsrc) => self.sources.push(Source { id: sb, appsrc, init: Vec::new() }),
            Err(e) => {
                eprintln!("redrob-browser: MediaSource: {e}");
                self.error = true;
            }
        }
    }

    fn mse_append(&mut self, sb: u64, bytes: Vec<u8>) {
        let Some(s) = self.sources.iter_mut().find(|s| s.id == sb) else { return };
        if let Some(n) = init_len(&bytes) {
            s.init = bytes[..n].to_vec();
        }
        let _ = s.appsrc.push_buffer(gst::Buffer::from_slice(bytes));
    }

    fn mse_end(&mut self) {
        for s in &self.sources {
            let _ = s.appsrc.end_of_stream();
        }
    }
}

impl Drop for MsePlayer {
    fn drop(&mut self) {
        let _ = self.pipeline.set_state(gst::State::Null);
    }
}
