# Layout port: real inline formatting and tables (from Blitz)

## Why

Taffy has only block, flex and grid. The engine emulates the rest:

| CSS | Engine today | Effect |
|---|---|---|
| Inline formatting (text with spans, inline-blocks, images) | Flex row with `flex-wrap`, one leaf per word or one cosmic-text leaf for "pure text" | Wrong min/max-content, wrong wrapping between atomic inlines, baseline gaps missing |
| Floats beside text | Float-zone flex rows, or a native band that only narrows atomic boxes | Paragraphs do not wrap around floats |
| `inline-block` | Flex row, NoWrap special cases | Buttons and lists measured wrong |
| Tables | Grid built by `build_table`, cells are column-flex stand-ins | Column widths, hidden rows, floats in cells |

Every difference measured against Chrome on Wikipedia and w3schools traces back to one of these.

## Source

[Blitz](https://github.com/DioxusLabs/blitz) (MIT OR Apache-2.0) solves the same problem on the same Taffy:
- `packages/blitz-dom/src/layout/construct.rs`: box construction. Inline-level children of a block container become one inline formatting context (IFC); block-level children among inline content get anonymous block wrappers.
- `packages/blitz-dom/src/layout/inline/build.rs`: builds one Parley layout per IFC: text runs, styled spans, inline boxes (atomic inline-blocks, replaced elements, floats with `break_on_box`).
- `packages/blitz-dom/src/layout/inline/layout.rs`: measures and lays out the IFC as a Taffy leaf. Line breaking runs line by line (`break_next`); each line gets its width and x from Taffy's `BlockContext::find_content_slot`, and floats are placed with `place_floated_box` when the breaker reaches them. Inline boxes are laid out through Taffy `compute_child_layout`.
- `packages/blitz-dom/src/layout/table.rs`: tables as a Taffy grid with HTML column sizing, colspan/rowspan, fixed layout, border-collapse.

A local checkout is at `/home/ubuntu/workplace/blitz-ref` (commit 0674e8e). Servo (MPL-2.0) is design reference only; do not copy Servo code.

Blitz uses Stylo for style. We keep our own `LayoutStyle`; port the algorithms and data flow, mapping Stylo values to ours. Copied Blitz code keeps its license header comment: `// Portions derived from Blitz (https://github.com/DioxusLabs/blitz), MIT OR Apache-2.0.`

## Stages

1. **IFC core** (one owner): Parley 0.12 inline layout replacing the cosmic-text `TextEngine` for layout; Blitz-style box construction replacing the flex-row emulation (`build_mixed_block`, word leaves, inline-block NoWrap rules, float-zone rows); Taffy leaf measure receives the `BlockContext` so lines wrap around floats; inline boxes via `compute_child_layout`; glyph runs feed the existing scene protocol (`redrob-scene`), raster and CSSOM rects (getClientRects per line fragment, caret, hit testing).
2. **Tables** (parallel): port `table.rs` behaviour into `build_table`: column sizing (auto and fixed), colspan/rowspan, hidden rows, captions, border-spacing/collapse, cells as real block containers.
3. **CSSOM fidelity** (parallel): `getComputedStyle` returns the specified display (`table`, `table-row`, `table-cell`, `list-item`, `flow-root`, `inline-flex` ...), not the engine's stand-in.
4. **Verify**: Wikipedia and every w3schools HTML/CSS/JS tutorial page against headless Chrome (`target/cmp/w3run.py`), fix what remains.
