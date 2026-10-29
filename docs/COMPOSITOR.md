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
CPU (vello_cpu), so an agent sees what the person sees.

## Rules

- Coordinates are CSS px, local to the item's spatial node.
- Items are in paint order; the engine does stacking-context sorting.
- `position: fixed` content is attached to `ROOT_SPATIAL`; normal content to
  `ROOT_SCROLL` or a nested scroll frame; sticky boxes to a `Sticky` node.
- Scrolling sends no new items. Only content changes do.
- Text is glyph runs with font ids; the window draws glyphs with vello.
- `sticky_offset` in redrob-scene is the one sticky formula; both sides use it.
- Flow control: at most two unpresented frames.

## Channel

The engine listens on a local socket per tab when started with
`--scene-socket`; the window opens it with the CDP session. Messages are
`u32` little-endian length + bincode body (`redrob_scene::encode`).
CDP: `Page.redrobSceneAttach { targetId }` returns the socket path for a tab.

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
- `Text.skew` is a horizontal shear factor (tan of the slant angle, positive
  leans right), as vello's `glyph_transform`.
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

### Debugging

- `REDROB_SCENE_FILE=<file>`: every web tab shows the scene in the file
  (a JSON array of `SceneMsg`s, or framed bincode as on the socket) and no
  scene channel is opened.
- `REDROB_SCENE_TRACE=<file>`: one line per rendered frame with build and
  render times, the root scroll offset and each sticky node's position.
