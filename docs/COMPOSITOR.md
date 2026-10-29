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

The engine listens on a local socket per tab when started with
`--scene-socket`; the window opens it with the CDP session. Messages are
`u32` little-endian length + bincode body (`redrob_scene::encode`).
CDP: `Page.redrobSceneAttach { targetId }` returns the socket path for a tab.
