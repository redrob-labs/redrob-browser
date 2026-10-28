# Painting on the GPU

How Redrob Browser gets pages on screen fast enough for a person to browse.

## Where we start

`obscura-render` rasterises on the CPU with tiny-skia. It paints straight into a `Pixmap`; there is
no display list in between. Drawing reaches tiny-skia through a small surface: about 19 `fill_path`,
10 `draw_pixmap`, 4 `stroke_path` and 1 `fill_rect` call sites, clips built as `Mask`s from paths
(`fill_path` then `intersect_path`), and a handful of direct `pixels_mut` writes for glyphs and
effects.

What a person feels is not raster speed. It is scrolling and typing: a page that repaints in full
on every wheel tick feels broken even if each paint is quick.

## Phase A: CPU raster, GPU compositing (now)

Chromium shipped this design for years: Skia rasterises tiles on the CPU, the compositor moves them
on the GPU.

- The document is cut into tiles of 512 x 512 CSS pixels at the device scale.
- The window keeps each tile as a GPU texture (`redrob-shell/src/tiles.rs`), keyed by tile position,
  scale and the page's paint generation.
- Missing tiles are requested with `Page.captureScreenshot` and a `clip` in document coordinates
  plus `captureBeyondViewport`, so no tile depends on the current scroll position.
- Scrolling moves tiles. It paints nothing new until an uncovered tile is needed.
- Any event that can change pixels (navigation, load, input other than the wheel, a screencast
  frame) bumps the generation. Old tiles stay on screen until their replacement arrives, so the
  page never flashes blank.

Known gap: `position: fixed` and `sticky` content is baked into tiles and scrolls with them. After
scrolling settles the window repaints the viewport tile row so fixed content lands where it belongs.
Phase B removes the gap.

## Phase B: GPU raster with vello

vello 0.11 targets wgpu 30, the same wgpu egui-wgpu 0.36 uses, so the window and the page can share
one device.

1. A `Canvas` trait in `obscura-render` takes the calls above: fill and stroke a path with a paint,
   draw an image, push and pop a clip made of paths, push and pop a layer with opacity and blend.
   The tiny-skia implementation is today's code, unchanged.
2. A recording implementation stores the same calls as a display list. Paths become `kurbo::BezPath`,
   solid and gradient paints become `peniko::Brush`, `Mask` clips become `push_clip_layer` with the
   intersected paths.
3. The direct `pixels_mut` sites stay on the CPU and enter the list as images.
4. Fixed and sticky boxes get their own layers, so the compositor positions them and the gap in
   Phase A closes.
5. The window replays the list into a `vello::Scene` and renders it into the page texture.

Phase B starts once Phase A has been measured at release time: if tile capture keeps up with scrolling
on real pages, raster moves to the GPU for animation and video, not for scrolling.
