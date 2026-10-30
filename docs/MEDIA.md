# Video and audio

## Decision: GStreamer in the window, the element's state in the page

| Option | Why not, or why |
|---|---|
| Decode in the engine and paint frames into page tiles | Every frame would repaint tiles on the CPU and cross the CDP socket as images |
| ffmpeg | Shipping its H.264 and AAC decoders carries patent licensing; one more large native build |
| One OS media API per platform (AVFoundation, Media Foundation, GStreamer) | Three players to write and keep in step |
| **GStreamer `playbin`** | One API on all three systems; its plugins use the OS hardware decoders (VideoToolbox, D3D11/Media Foundation, VA-API), so H.264 comes from the OS rather than from us; LGPL, linked dynamically |

## How it fits together

```text
page JS: <video>.play()
  -> redrobMedia binding (CDP Runtime.bindingCalled)
     -> window: media_view.rs opens a GStreamer playbin for the element's URL
        -> appsink hands RGBA frames to an egui texture
        -> drawn over the page tiles at the element's getBoundingClientRect
  <- every 250 ms: __redrobMediaUpdate(id, {currentTime, duration, paused, ended, ...})
     -> the element fires loadedmetadata, canplay, playing, timeupdate, pause, ended, error
```

- The page keeps the HTMLMediaElement state machine (`obscura-js/js/bootstrap.js`). Setting
  `currentTime`, `volume` or `muted` goes to the window the same way.
- Elements with `controls` get a play/pause button, a seek bar and the time, drawn by the window.
- Media stops when its tab navigates or closes. A background tab keeps playing sound.
- Headless use (`redrob-browser serve`, `fetch`) has no window and no binding: `play()` rejects
  with `NotSupportedError` and `canPlayType` answers `""`. Built with `obscura-cli/media` it
  still shows paused videos as Chrome does; see [Headless frames](#headless-frames).

## Autoplay

After a page's `load` event the window starts every `video[autoplay][muted]` and
`audio[autoplay][muted]` element. Autoplay with sound stays blocked: the page has to call
`play()` itself.

## Full screen

`Element.requestFullscreen()` (and the `webkit` names) on a video, or on a player's container,
which picks the first `<video>` inside it, is reported through the `redrobMedia` binding. The
window switches to full-screen mode (`egui::ViewportCommand::Fullscreen`) and draws that video
with its controls over the whole window. `document.exitFullscreen()`, Escape, or switching tabs
leaves; the page sees `document.fullscreenElement` change and a `fullscreenchange` event either
way. Other elements cannot go full screen.

## Subtitles

With `play` and `load` the element sends its `<track>` list. The window picks the first
`kind="subtitles"` or `kind="captions"` track marked `default` (or set to `showing`), fetches it
(http, https or `data:`, see `redrob-shell/src/webvtt.rs`) and draws the active cue at the bottom
of the video. Cue timing and text are used; cue settings (position, line, alignment), regions and
styling are ignored, and inline tags are stripped.

## Media Source Extensions

```text
page JS: new MediaSource(); video.src = URL.createObjectURL(ms)
  -> mse-open (redrobMedia)        window: one MSE player for the element
  ms.addSourceBuffer(type)
  -> mse-add {sb, mime}            window: appsrc ! decodebin, added to its pipeline
  sb.appendBuffer(bytes)
  -> redrobMse binding: mse-append {sb, data: base64}
                                   window: pushed into that appsrc; decodebin sends
                                   video to the RGBA appsink and audio to the speakers
```

- `obscura-js/js/media.js` (spliced into `bootstrap.js` at build time) implements
  `MediaSource`, `SourceBuffer`, `SourceBufferList`, `TimeRanges` and
  `MediaSource.isTypeSupported` (MP4 and WebM with H.264, AAC, VP8, VP9, Opus, Vorbis or FLAC).
  The MediaSource attaches through `src`, `setAttribute('src', ...)` or `srcObject`.
- `SourceBuffer.buffered` is read in the page from the appended bytes: `tfdt` and `trun` in
  fragmented MP4, Cluster and block timecodes in WebM. `updateend` fires on the next task.
- Seeking (`currentTime = t`) rebuilds the window's pipeline, which flushes every appsrc, and
  replays each SourceBuffer's last initialization segment. The page then appends the segments for
  the new position, as MSE players do on `seeking`. Sinks render from the first decoded buffer, so
  playback starts at whatever time those segments carry.
- `remove()` and `abort()` change only the page's view of what is buffered; bytes already handed
  to GStreamer still play.
- The window code is `redrob-shell/src/mse.rs`, built with the `media` feature.

## Headless frames

Agent screenshots of a page with `<video>` show what Chrome shows for a paused element: the poster
if there is one, else the frame at the playback position, and, with `controls`, Chrome's default
controls bar.

```text
layout/paint: <video src> without poster
  -> RenderResourceCache::video_frame(url, currentTime)
     media bytes from the page's resource cache (a cache-only miss requests them through the
     page transport, with the page's cookies, like an image)
     -> paint/video.rs: appsrc ! decodebin ! videoconvert ! videoscale ! RGBA appsink
        (seek to currentTime, take the preroll frame; audio pads go to a fakesink)
  -> the frame is the replaced content: it sizes the element (intrinsic size) and paints with
     object-fit like a poster
page JS: readyState, videoWidth/Height, duration
  <- op_video_frame_metadata: polled after DOMContentLoaded and load(), then
     loadedmetadata, loadeddata, canplay, canplaythrough fire; setting currentTime repaints the
     frame at the new position and fires seeked
```

- The decoders are GStreamer's plugins, the same ones the window plays with: the engine ships no
  codec. On this repository's Linux build hosts VP8/VP9 (WebM) decode with `libgstvpx`; H.264
  needs an H.264 plugin on the machine (OS hardware decoder or `gst-libav`). Without a decoder the
  element stays at `readyState` 0 and paints its poster or nothing, as before.
- `preload="none"` decodes nothing until `load()`.
- The controls bar (`paint_video_controls` in `paint.rs`) is drawn only in screenshots; the window
  draws its own. Its geometry, gradient and colours are measured from headless Chrome 153
  (play, `m:ss / m:ss`, timeline, volume greyed when there is no audio track, fullscreen, overflow
  menu); icons are the Material icons Chromium's controls use. It is the paused, never-played
  state; narrow players do not drop buttons as Chrome does.
- Build: `cargo build -p obscura-cli --features render,media`; same GStreamer requirements as
  the window. `release.yml` does not pass `obscura-cli/media` yet, so released `serve` binaries
  keep painting posters only.

## Build

`cargo build -p redrob-shell --features media`. Building needs the GStreamer development files
(`libgstreamer1.0-dev`, `libgstreamer-plugins-base1.0-dev`); running needs the GStreamer runtime
and the `good`, `bad` and `libav` or OS decoder plugins. Release packages bundle the runtime on
macOS and Windows.

## Not yet

- Encrypted media (EME, Widevine).
- Picture in picture.
- `appendWindowStart`/`appendWindowEnd`, and `SourceBuffer.remove()` evicting bytes GStreamer
  already has.
- In the window, media requests go out from GStreamer, not the engine, so they carry no page
  cookies. Subtitle files are fetched the same way. Headless frames load through the engine.
