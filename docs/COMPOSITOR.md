# GPU compositor

The window no longer pulls PNG tiles from the engine. The engine sends a
display list with a spatial tree and hit-test regions (`crates/redrob-scene`),
and the window draws it on the GPU with vello every frame. This follows
WebRender (Firefox, Servo) and Chromium's compositor.

```
engine (DOM, style, layout, JS)
  | SceneMsg: Resources, Frame, Delta  (binary, local socket)
  v
window compositor (redrob-shell/src/compositor/)
  - builds a vello Scene from the items, per frame, on wgpu
  - owns scroll offsets; resolves sticky and fixed per frame
  - looks up cursor and link from hit regions on pointer move
  - caches images and fonts by id on the GPU
  | ClientMsg: Scrolled, Presented
  v
engine updates scrollTop/Left, fires scroll events
```

Agents keep CDP. `Page.captureScreenshot` rasterizes the same frame on the
CPU (vello_cpu, `crates/redrob-scene-raster`), so an agent sees what the
person sees.

## Rules

- Coordinates are CSS px, local to the item's spatial node.
- Items are in paint order; the engine does stacking-context sorting.
- `position: fixed` content is attached to `ROOT_SPATIAL`; normal content to
  `ROOT_SCROLL` or a nested scroll frame; sticky boxes to a `Sticky` node.
- Scrolling sends no new items. Only content changes do.
- Text is glyph runs with font ids; the window draws glyphs with vello.
- `sticky_offset` in redrob-scene is the one sticky formula; both sides use it.
- Spatial mapping is WebRender's: scroll and sticky children stay in the
  parent's space, moved by `-offset` or the sticky offset; a scroll `frame`
  clips the scroller's subtree. `redrob_scene_raster::SpatialMap` implements
  it (and `hit_test`); the window reuses it rather than re-deriving it.
  Item details (gradient space, shadow blur, text skew, layer transform) are
  in the crate docs of `crates/redrob-scene-raster`.
- Flow control: at most two unpresented frames.

## Channel

`Page.redrobSceneAttach { rasterScale? }` on a page session opens a local
socket for that tab and returns `{ transport, address, socketPath }`: a Unix
socket readable only by this user (`$XDG_RUNTIME_DIR` or the temp dir) on
Linux and macOS, `127.0.0.1:<port>` TCP on Windows. Attaching again returns
the same socket; `Page.redrobSceneDetach` closes it, and it goes away with
the tab. A window that reconnects gets every resource and a full frame again.
Messages are `u32` little-endian length + bincode body
(`redrob_scene::encode`). `rasterScale` (default: the page's device scale
factor) is the density the engine rasterizes SVG images at.

Engine side (`crates/obscura-render/src/paint/scene.rs`,
`crates/obscura-cdp/src/scene_channel.rs`):

- A frame is recorded from the screenshot painter itself, run over the whole
  document at zero scroll with a canvas that keeps ops and writes no pixels.
  Every op carries the DOM node being painted, which places it in the spatial
  tree; text is glyph runs in the fonts cosmic-text shaped with (variable
  fonts as `Resource::FontInstance`), images are interned by content.
- Compositor scrollers are `overflow: auto|scroll` boxes and the document.
  An `overflow: hidden` box only script can scroll is painted at its live
  offset; script scrolling it sends a new frame.
- Each 16 ms tick: a `Frame` when DOM, style, layout, images, fonts, a
  canvas or a CSS animation changed, while fewer than two frames are
  unpresented; otherwise a spatial-only `Delta` when only script scrolled,
  with `offset_changed_by_page` set on the scrollers it moved. Resources go
  out before the frame that first uses them; ones no frame uses are dropped.
- `Scrolled` sets `scrollLeft`/`scrollTop` (or the window scroll) through the
  page, so `scroll` events fire; there is no relayout and no echo back.
- Hit regions: every element box (inline boxes per line fragment) and every
  line of text, in paint order, with the computed `cursor` (links get
  `pointer` from the UA sheet), `is_text` for text and editable fields, the
  resolved `href` of the nearest link, and no regions for
  `pointer-events: none` or `visibility: hidden`.
- `External.key` is the video's media id; canvases are sent as images.
- Checks: `OBSCURA_SCENE_DUMP=<file.json> redrob-browser fetch <url>
  --screenshot <png>` writes the frame (`.bin`, the exact stream) and a
  summary; `cargo run -p redrob-scene-raster --example render_stream` draws a
  dumped stream, `--example scene_client` connects to a live channel.

## Window side (`crates/redrob-shell/src/compositor/`)

| File | Does |
|---|---|
| `channel.rs` | Opens the scene socket, reads framed `SceneMsg`s, turns resources into vello images and fonts off the UI thread, writes `ClientMsg`s. |
| `state.rs` | `TabScene`: the current `Frame` per tab, deltas, resources, item bounds for culling. |
| `spatial.rs` | Maps every spatial node to the page area each frame. |
| `scroll.rs` | Window-owned scroll offsets, smooth scrolling, latching, keys, `Scrolled`. |
| `paint.rs` | Items to a vello `Scene`. |
| `hit.rs` | Hit regions front to back: cursor, link, which box scrolls. |
| `ui.rs` | Cursor icons, the link status bubble, overlay scrollbars. |
| `mod.rs` | `Gpu`: vello on eframe's wgpu device, one page texture, rendered only when something changed. |

### Spatial mapping

As WebRender:

- `Reference`: children map through `transform`.
- `Scroll`: children keep the parent's coordinates shifted by minus the
  live offset, and are clipped to `frame` (in the parent's space). Content
  of a nested scroller is therefore in the same coordinates layout gave it.
  Offsets range over `0..=content - frame.size`.
- `Sticky`: children keep the parent's coordinates shifted by
  `sticky_offset(frame, ..., viewport)`, where `viewport` is the nearest
  ancestor scroll frame's `frame` mapped into the sticky node's parent space
  (the page area when there is none).
- Item details (text skew, synthetic bold, layer transforms, shadows,
  gradients) follow `crates/redrob-scene-raster/src/lib.rs`, so the window
  and agent screenshots draw the same pixels.
- `External.key` is the media element id (`__redrobMediaElements`); the
  window draws that element's current video frame there, letterboxed.

### Scrolling and input

- The window scrolls first and tells the engine (`Scrolled`); it adopts an
  engine offset only for a new scroller or `offset_changed_by_page`.
- A wheel scrolls the innermost scroller under the pointer that can move in
  that direction, then stays latched to it for 300 ms of wheel events.
- Arrow, Page, Home, End and Space keys go to the page as before; when no
  text field has focus (the window asks the page), the window scrolls the
  box last clicked in, or the document.
- Wheel and key events still reach the page for its listeners. They carry
  `"redrobCompositorScrolls": true` in `Input.dispatchMouseEvent` /
  `Input.dispatchKeyEvent`: the engine must not scroll for them itself.

### Windows

- All windows of a profile share one `Gpu`; each window draws into its own
  page texture, re-rendered only when its tab's scene, scroll offsets, size
  or video frames changed.
- Each window is a deferred egui viewport, so it repaints only for its own
  input, its own animations and engine updates for its own tabs (cdp.rs tags
  every wake with its tab; browser.rs wakes the viewport showing it).

### Debugging

- `REDROB_SCENE_FILE=<file>`: every web tab shows the scene in the file
  (a JSON array of `SceneMsg`s, or framed bincode as on the socket) and no
  scene channel is opened.
- `REDROB_SCENE_TRACE=<file>`: one line per rendered frame with build and
  render times, the root scroll offset and each sticky node's position.
