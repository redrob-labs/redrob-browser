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

vello 0.11 targets wgpu 30, the same wgpu egui-wgpu 0.36 uses, so the window and the page share one
device.

Steps 1, 2, 3 and 5 have landed. Step 4 has not.

1. **Canvas trait** (`obscura-render/src/canvas.rs`). Every draw goes through `Canvas`: `fill_path`,
   `fill_gradient`, `fill_rect`, `stroke_path`, `draw_image`, `push_clip`/`pop_clip` (paths, intersected)
   and `push_layer`/`pop_layer` (opacity, blend). Call sites write `pixmap.canvas().fill_path(...)` with
   the same arguments they passed tiny-skia. `TinySkiaCanvas` makes the same tiny-skia calls, so CPU
   output is unchanged. Gradients pass a `Gradient` with their parameters, because tiny-skia's shaders
   hide them. Masks are built with `new_mask` and the `ClipMask` methods (`clip_fill_path`,
   `clip_intersect_path`, `clip_invert`), copied with `clone_mask` and combined with
   `intersect_mask_into`.
2. **Display list** (`obscura-render/src/display_list.rs`, feature `display-list`). `record` runs a
   paint while a `RecordingCanvas` listens: `TinySkiaCanvas` copies each call made on the recorded
   surface to it. The list is serde data:
   - `Fill` / `Stroke`: path as `M`/`L`/`Q`/`C`/`Z` verbs, a brush (`solid`, `linear` or `radial` with
     stops, extend and a gradient transform), fill rule or stroke style, and a transform
     (`[sx, ky, kx, sy, tx, ty]`).
   - `Image`: an index into `images` (premultiplied RGBA, base64 in JSON, stored once), transform,
     opacity, sampling.
   - `PushClip { clips }` / `PopClip`: the paths a mask was built from. The recorder tracks every mask
     made through the canvas helpers, keyed by its buffer and checked with a sampled fingerprint.
     Consecutive draws under one mask share one clip.
   - `PushLayer { opacity, blend }` / `PopLayer`: opacity and transform groups. Paint marks their
     offscreen surface with `begin_layer`; when the group is composited back, its ops move into the
     parent mapped by the group's transform.
3. **CPU-only content enters as images.** Glyph blits (`draw_text`, `TextEngine`) run inside
   `direct_pixels`: while recording, they write into a transparent surface that is cropped into an
   image. Pattern fills, hairlines, shadows and anything under a mask of unknown shape are rasterized
   the same way. While recording, text is composited from that image, so its pixels can differ from an
   unrecorded paint by rounding; without the feature nothing changes.
4. Fixed and sticky boxes get their own layers, so the compositor positions them and the gap in
   Phase A closes. **Not done.**
5. **Replay on the GPU** (`redrob-shell/src/gpu_paint.rs`, feature `gpu`). For each tile the window
   calls `Page.redrobDisplayList` with the same `clip` it gives `Page.captureScreenshot`. The engine
   answers `{width, height, ops, images}` (built with `obscura-cli/display-list`). The window replays
   it into a `vello::Scene` (`fill`, `stroke`, `draw_image`, one `push_clip_layer` per clip path,
   `push_layer`) and renders it with `vello::Renderer::render_to_texture` into an `Rgba8Unorm` texture
   registered with egui through `register_native_texture`. A tile of the same size reuses its texture.

The PNG path stays the default. With `gpu` on, the window still falls back to PNG tiles when vello
cannot start on the device, when the engine answers that it has no display lists (it then stops
asking), or when one tile's list fails.

Build both halves with the features on:

    cargo build --release -p obscura-cli -p redrob-shell \
      --features obscura-cli/render,obscura-cli/display-list,redrob-shell/gpu

Open items: step 4; recording still runs the CPU paint (the list is a by-product of it); text arrives
as images rather than glyph runs; the new dependencies (`vello`, `serde` in obscura-render) still have
to be written into `Cargo.lock` by the first build.
