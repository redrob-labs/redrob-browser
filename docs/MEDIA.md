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
  with `NotSupportedError` and `canPlayType` answers `""`, as before.

## Build

`cargo build -p redrob-shell --features media`. Building needs the GStreamer development files
(`libgstreamer1.0-dev`, `libgstreamer-plugins-base1.0-dev`); running needs the GStreamer runtime
and the `good`, `bad` and `libav` or OS decoder plugins. Release packages bundle the runtime on
macOS and Windows.

## Not yet

- Media Source Extensions (`MediaSource`, `SourceBuffer`). YouTube and most streaming sites
  use them; they play nothing until MSE exists.
- Encrypted media (EME, Widevine).
- `autoplay` (the page has to call `play()`), `<track>` subtitles drawn over video, picture in
  picture, fullscreen video.
- Media requests go out from GStreamer, not the engine, so they carry no page cookies.
